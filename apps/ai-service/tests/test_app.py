import ast
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from qdrant_client import QdrantClient

from app.config import Settings
from app.main import create_app
from app.providers.base import FaceEmbedder, Providers
from app.security import request_signature
from tests.fakes import FakeEmbedder

NOW = 1_763_337_600


def signed(key: str, method: str, path: str, body: bytes = b"", ts: int = NOW) -> dict[str, str]:
    return {
        "x-service-timestamp": str(ts),
        "x-service-signature": request_signature(key.encode(), str(ts), method, path, body),
    }


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    app = create_app(settings, qdrant=QdrantClient(":memory:"), clock=lambda: NOW)
    with TestClient(app) as c:
        yield c


def test_health_and_ready_need_no_auth(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    res = client.get("/ready")
    assert res.status_code == 200
    assert res.json() == {"status": "ready", "checks": {"warmup": "ok", "qdrant": "ok"}}


def test_ready_is_503_when_qdrant_is_unreachable(settings: Settings) -> None:
    # settings point at 127.0.0.1:1, where nothing listens.
    with TestClient(create_app(settings)) as c:
        res = c.get("/ready")
    assert res.status_code == 503
    assert res.json()["checks"] == {"warmup": "ok", "qdrant": "fail"}


def test_ready_waits_for_warmup(settings: Settings) -> None:
    app = create_app(settings, qdrant=QdrantClient(":memory:"))
    c = TestClient(app)  # no `with`: lifespan (warmup) has not run
    assert c.get("/ready").json()["checks"]["warmup"] == "fail"


def test_warmup_runs_every_loaded_provider(settings: Settings) -> None:
    embedder = FakeEmbedder()
    app = create_app(
        settings, qdrant=QdrantClient(":memory:"), providers=Providers(embedder=embedder)
    )
    with TestClient(app) as c:
        assert embedder.warmed
        assert c.get("/ready").status_code == 200


def test_v1_requires_a_valid_signature(client: TestClient, vectors: dict[str, Any]) -> None:
    key = vectors["requestKey"]
    assert client.get("/v1/models").status_code == 401
    bad = signed("x" * 32, "GET", "/v1/models")
    assert client.get("/v1/models", headers=bad).status_code == 401
    other_path = signed(key, "GET", "/v1/other")
    assert client.get("/v1/models", headers=other_path).status_code == 401

    res = client.get("/v1/models", headers=signed(key, "GET", "/v1/models"))
    assert res.status_code == 200
    assert res.json() == {"executionProvider": "cpu", "warm": True, "models": []}


@pytest.mark.parametrize("skew", [-61, 61])
def test_stale_or_future_timestamps_are_rejected(
    client: TestClient, vectors: dict[str, Any], skew: int
) -> None:
    headers = signed(vectors["requestKey"], "GET", "/v1/models", ts=NOW + skew)
    res = client.get("/v1/models", headers=headers)
    assert res.status_code == 401
    assert res.headers["content-type"] == "application/problem+json"
    assert res.json()["code"] == "UNAUTHENTICATED"


def test_signature_covers_the_body(client: TestClient, vectors: dict[str, Any]) -> None:
    key = vectors["requestKey"]
    headers = signed(key, "POST", "/v1/models", b'{"limit":1}')
    # Same headers, tampered body: rejected before routing.
    assert client.post("/v1/models", headers=headers, content=b'{"limit":500}').status_code == 401
    # Valid signature reaches routing (405: there is no POST /v1/models).
    assert client.post("/v1/models", headers=headers, content=b'{"limit":1}').status_code == 405


def test_oversized_body_is_rejected(client: TestClient) -> None:
    res = client.post("/v1/models", content=b"x" * 1_048_577)
    assert res.status_code == 413


def test_metrics_use_route_templates_and_count_rejections(client: TestClient) -> None:
    client.get("/health")
    client.get("/v1/models")  # 401
    client.get("/v1/nope/12345")
    text = client.get("/metrics").text
    assert 'http_requests_total{method="GET",route="/health",status="200"} 1.0' in text
    assert 'http_requests_total{method="GET",route="/v1/models",status="401"} 1.0' in text
    assert 'route="unmatched"' in text
    assert "12345" not in text


def test_openapi_is_hidden_in_production(settings: Settings) -> None:
    prod = settings.model_copy(update={"env": "production"})
    with TestClient(create_app(prod, qdrant=QdrantClient(":memory:"))) as c:
        assert c.get("/openapi.json").status_code in (401, 404)
        assert c.get("/docs").status_code in (401, 404)


def test_fake_embedder_satisfies_the_protocol_but_lives_only_in_tests() -> None:
    assert isinstance(FakeEmbedder(), FaceEmbedder)
    app_dir = Path(__file__).resolve().parents[1] / "app"
    for source in app_dir.rglob("*.py"):
        tree = ast.parse(source.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith("tests"), source
            if isinstance(node, ast.Name):
                assert node.id != "FakeEmbedder", source

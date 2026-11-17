"""Proves the VectorStore refuses unscoped access and never leaks across scopes.

Runs against Qdrant's in-process engine (`:memory:`), which uses the same filter
semantics as the server, so no Docker is needed.
"""

import uuid
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest
from qdrant_client import QdrantClient

from app.scope import Scope
from app.vector_store import FacePoint, ScopeRequiredError, VectorStore
from tests.fakes import FakeEmbedder

DIM = 8
TENANT_A_EVENT_1 = Scope.model_validate({"scopeType": "studio", "scopeId": "A", "eventId": "e1"})
TENANT_A_EVENT_2 = Scope.model_validate({"scopeType": "studio", "scopeId": "A", "eventId": "e2"})
TENANT_B_EVENT_1 = Scope.model_validate({"scopeType": "studio", "scopeId": "B", "eventId": "e1"})
PERSONAL_ALBUM_X = Scope.model_validate(
    {"scopeType": "personal", "scopeId": "A", "personalAlbumIds": ["x"]}
)


def crop(seed: int) -> Any:
    return np.full((4, 4, 3), seed, dtype=np.uint8)


def points(prefix: str, n: int, embedder: FakeEmbedder) -> list[FacePoint]:
    vectors = embedder.embed([crop(i) for i in range(n)])
    return [
        FacePoint(
            face_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"{prefix}/{i}")),
            photo_id=f"{prefix}-photo-{i}",
            vector=vectors[i].tolist(),
            model_version=embedder.model_version,
            quality=0.9,
        )
        for i in range(n)
    ]


@pytest.fixture
def store() -> Iterator[VectorStore]:
    client = QdrantClient(":memory:")
    vs = VectorStore(client, "face_embeddings__test")
    vs.ensure_collection(DIM)
    embedder = FakeEmbedder(DIM)
    # The *same* faces exist in every scope: only the filter can tell them apart.
    vs.upsert(TENANT_A_EVENT_1, points("a1", 5, embedder))
    vs.upsert(TENANT_A_EVENT_2, points("a2", 5, embedder))
    vs.upsert(TENANT_B_EVENT_1, points("b1", 5, embedder))
    vs.upsert(PERSONAL_ALBUM_X, points("px", 5, embedder))
    yield vs
    client.close()


def query() -> list[float]:
    vector: list[float] = FakeEmbedder(DIM).embed([crop(2)])[0].tolist()
    return vector


@pytest.mark.parametrize(
    "bad_scope", [None, {}, {"scopeId": "A"}, "A", TENANT_A_EVENT_1.canonical()]
)
def test_search_without_a_validated_scope_is_refused(store: VectorStore, bad_scope: Any) -> None:
    with pytest.raises(ScopeRequiredError):
        store.search(bad_scope, query(), limit=10)


@pytest.mark.parametrize("bad_scope", [None, {"scopeId": "A"}])
def test_upsert_and_delete_without_scope_are_refused(store: VectorStore, bad_scope: Any) -> None:
    with pytest.raises(ScopeRequiredError):
        store.upsert(bad_scope, [])
    with pytest.raises(ScopeRequiredError):
        store.delete(bad_scope)


@pytest.mark.parametrize(
    ("scope", "prefix"),
    [
        (TENANT_A_EVENT_1, "a1"),
        (TENANT_A_EVENT_2, "a2"),
        (TENANT_B_EVENT_1, "b1"),
        (PERSONAL_ALBUM_X, "px"),
    ],
)
def test_search_only_returns_points_from_its_own_scope(
    store: VectorStore, scope: Scope, prefix: str
) -> None:
    hits = store.search(scope, query(), limit=500)
    assert len(hits) == 5
    assert all(h.photo_id.startswith(f"{prefix}-") for h in hits)
    assert hits[0].photo_id == f"{prefix}-photo-2"
    assert hits[0].score == pytest.approx(1.0, abs=1e-5)


def test_same_event_id_in_another_tenant_is_not_matched(store: VectorStore) -> None:
    # Tenant B also has an "e1": the scopeId condition must keep them apart.
    assert {h.photo_id[:2] for h in store.search(TENANT_B_EVENT_1, query(), limit=500)} == {"b1"}


def test_unknown_album_returns_nothing(store: VectorStore) -> None:
    other = Scope.model_validate(
        {"scopeType": "personal", "scopeId": "A", "personalAlbumIds": ["not-mine"]}
    )
    assert store.search(other, query(), limit=500) == []


def test_results_never_carry_vectors(store: VectorStore) -> None:
    hit = store.search(TENANT_A_EVENT_1, query(), limit=1)[0]
    assert set(hit.__slots__) == {"photo_id", "face_id", "score"}


def test_limit_is_bounded(store: VectorStore) -> None:
    with pytest.raises(ValueError, match="limit"):
        store.search(TENANT_A_EVENT_1, query(), limit=501)


def test_scoped_delete_removes_only_that_scope_and_verifies(store: VectorStore) -> None:
    assert store.delete(TENANT_A_EVENT_1, photo_ids=["a1-photo-0"]) == 1
    assert store.delete(TENANT_A_EVENT_1) == 4
    assert store.search(TENANT_A_EVENT_1, query(), limit=500) == []
    assert len(store.search(TENANT_A_EVENT_2, query(), limit=500)) == 5
    assert len(store.search(TENANT_B_EVENT_1, query(), limit=500)) == 5


def test_personal_upsert_needs_exactly_one_album(store: VectorStore) -> None:
    two = Scope.model_validate(
        {"scopeType": "personal", "scopeId": "A", "personalAlbumIds": ["x", "y"]}
    )
    with pytest.raises(ScopeRequiredError):
        store.upsert(two, [])

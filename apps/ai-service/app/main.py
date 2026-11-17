"""ai-service entrypoint: `uvicorn --factory app.main:create_app`.

Phase 1 ships the skeleton only — auth, scoped vector access, probes and metrics.
The /v1/faces/* endpoints arrive with real models in Phase 4; until then they do not
exist (no placeholder that pretends to work).
"""

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from qdrant_client import QdrantClient

from .config import Settings
from .metrics import Metrics, MetricsMiddleware
from .providers.base import Providers
from .security import ServiceAuthMiddleware

READY_CHECK_TIMEOUT_SECONDS = 2.0


def create_app(
    settings: Settings | None = None,
    *,
    qdrant: QdrantClient | None = None,
    providers: Providers | None = None,
    clock: Callable[[], float] | None = None,
) -> FastAPI:
    settings = settings or Settings()  # values come from env
    providers = providers or Providers()
    qdrant = qdrant or QdrantClient(
        url=str(settings.qdrant_url),
        api_key=settings.qdrant_api_key.get_secret_value(),
        timeout=int(READY_CHECK_TIMEOUT_SECONDS),
        # Local dev talks plain HTTP on a private network; production uses TLS (§9).
        https=settings.qdrant_url.scheme == "https",
    )
    metrics = Metrics()
    state: dict[str, bool] = {"warm": False}

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        await asyncio.to_thread(providers.warmup)
        state["warm"] = True
        yield
        qdrant.close()

    production = settings.env == "production"
    app = FastAPI(
        title="SnapShare ai-service",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if production else "/docs",
        redoc_url=None,
        openapi_url=None if production else "/openapi.json",
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    async def ready() -> JSONResponse:
        checks = {"warmup": "ok" if state["warm"] else "fail", "qdrant": "fail"}
        # Any failure (refused, timeout, auth) just means "not ready".
        with suppress(Exception):
            await asyncio.wait_for(
                asyncio.to_thread(qdrant.get_collections), READY_CHECK_TIMEOUT_SECONDS
            )
            checks["qdrant"] = "ok"
        is_ready = all(v == "ok" for v in checks.values())
        metrics.ready.set(1 if is_ready else 0)
        return JSONResponse(
            {"status": "ready" if is_ready else "not_ready", "checks": checks},
            status_code=200 if is_ready else 503,
        )

    @app.get("/metrics", include_in_schema=False)
    async def prometheus() -> Response:
        return Response(generate_latest(metrics.registry), media_type=CONTENT_TYPE_LATEST)

    @app.get("/v1/models")
    async def list_models() -> dict[str, Any]:
        return {"executionProvider": "cpu", "warm": state["warm"], "models": providers.describe()}

    # Outermost first: metrics see every response, including auth rejections.
    app.add_middleware(
        ServiceAuthMiddleware,
        key=settings.service_token.get_secret_value().encode(),
        max_skew_seconds=settings.max_clock_skew_seconds,
        **({"clock": clock} if clock else {}),
    )
    app.add_middleware(MetricsMiddleware, metrics=metrics, routes=app.router.routes)
    return app

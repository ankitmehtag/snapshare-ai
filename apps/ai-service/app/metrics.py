"""Prometheus metrics. AI-specific metrics (AI_ARCHITECTURE §11) are added with the
pipelines that emit them in Phase 4 — none are registered before they mean something."""

import time
from collections.abc import MutableMapping
from typing import Any

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram
from starlette.routing import Match

from .security import ASGIApp, ASGIMessage, Receive, Send


class Metrics:
    def __init__(self) -> None:
        self.registry = CollectorRegistry()
        self.requests = Counter(
            "http_requests_total",
            "HTTP requests",
            ["method", "route", "status"],
            registry=self.registry,
        )
        self.duration = Histogram(
            "http_request_duration_seconds",
            "HTTP request duration",
            ["method", "route"],
            buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30),
            registry=self.registry,
        )
        self.ready = Gauge(
            "ai_service_ready",
            "1 when warmup finished and Qdrant is reachable",
            registry=self.registry,
        )


class MetricsMiddleware:
    """Records RED metrics labelled by route template (never raw paths: bounded cardinality)."""

    def __init__(self, app: ASGIApp, *, metrics: Metrics, routes: list[Any]) -> None:
        self.app = app
        self.metrics = metrics
        self.routes = routes

    def _route(self, scope: MutableMapping[str, Any]) -> str:
        for route in self.routes:
            match, _ = route.matches(scope)
            if match == Match.FULL:
                return str(route.path)
        return "unmatched"

    async def __call__(self, scope: MutableMapping[str, Any], receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] == "/metrics":
            await self.app(scope, receive, send)
            return
        status = 500
        start = time.perf_counter()

        async def capture(message: ASGIMessage) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message["status"])
            await send(message)

        try:
            await self.app(scope, receive, capture)
        finally:
            route = self._route(scope)
            method = str(scope["method"])
            self.metrics.requests.labels(method, route, str(status)).inc()
            self.metrics.duration.labels(method, route).observe(time.perf_counter() - start)

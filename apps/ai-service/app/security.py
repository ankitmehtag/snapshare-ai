"""Service-to-service authentication and signed scopes (AI_ARCHITECTURE §10, SECURITY §4).

Request signing: the orchestrator sends
  X-Service-Timestamp: <unix seconds>
  X-Service-Signature: hex(HMAC-SHA256(AI_SERVICE_TOKEN,
                         "{ts}\\n{METHOD}\\n{path}\\n{sha256(body)}"))
Requests outside the clock-skew window are rejected, which bounds replay.

Scope signing: hex(HMAC-SHA256(AI_SCOPE_SIGNING_KEY, canonical_json(scope))).
The Node counterpart lives in packages/server-kit/src/ai-signing.ts; both sides are
pinned to tooling/contracts/ai-signing-vectors.json.
"""

import hashlib
import hmac
import json
import time
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

from .scope import Scope

ASGIMessage = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[ASGIMessage]]
Send = Callable[[ASGIMessage], Awaitable[None]]
ASGIApp = Callable[[MutableMapping[str, Any], Receive, Send], Awaitable[None]]

TIMESTAMP_HEADER = b"x-service-timestamp"
SIGNATURE_HEADER = b"x-service-signature"
# Requests carry image URLs and ids, never image bytes.
MAX_BODY_BYTES = 1_048_576
UNAUTHENTICATED_PATHS = frozenset({"/health", "/ready", "/metrics"})


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _hmac_hex(key: bytes, message: bytes) -> str:
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def request_signature(key: bytes, timestamp: str, method: str, path: str, body: bytes) -> str:
    digest = hashlib.sha256(body).hexdigest()
    return _hmac_hex(key, f"{timestamp}\n{method.upper()}\n{path}\n{digest}".encode())


def scope_signature(key: bytes, scope: Scope) -> str:
    return _hmac_hex(key, canonical_json(scope.canonical()))


class InvalidScopeSignatureError(PermissionError):
    pass


def verify_scope(key: bytes, scope: Scope, signature: str) -> Scope:
    """Returns the scope only if its signature is valid; raises otherwise."""
    if not hmac.compare_digest(scope_signature(key, scope), signature):
        raise InvalidScopeSignatureError("scope signature mismatch")
    return scope


def _problem(status: int, code: str, title: str) -> tuple[dict[str, Any], bytes]:
    body = canonical_json({"type": "about:blank", "title": title, "status": status, "code": code})
    start = {
        "type": "http.response.start",
        "status": status,
        "headers": [
            (b"content-type", b"application/problem+json"),
            (b"content-length", str(len(body)).encode()),
        ],
    }
    return start, body


class ServiceAuthMiddleware:
    """Pure ASGI middleware: buffers the (small) body, verifies the HMAC, replays the body."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        key: bytes,
        max_skew_seconds: int,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.app = app
        self.key = key
        self.max_skew = max_skew_seconds
        self.clock = clock

    async def __call__(self, scope: MutableMapping[str, Any], receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in UNAUTHENTICATED_PATHS:
            await self.app(scope, receive, send)
            return

        chunks: list[bytes] = []
        size = 0
        more = True
        while more:
            message = await receive()
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                await self._reject(send, 413, "PAYLOAD_TOO_LARGE", "Request body too large")
                return
            chunks.append(chunk)
            more = message.get("more_body", False)
        body = b"".join(chunks)

        headers = dict(scope["headers"])
        timestamp = headers.get(TIMESTAMP_HEADER, b"").decode("latin-1")
        signature = headers.get(SIGNATURE_HEADER, b"").decode("latin-1")
        if not self._valid(timestamp, signature, scope["method"], scope["path"], body):
            await self._reject(send, 401, "UNAUTHENTICATED", "Invalid service signature")
            return

        replayed = False

        async def replay() -> ASGIMessage:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    def _valid(self, timestamp: str, signature: str, method: str, path: str, body: bytes) -> bool:
        if not timestamp.isdigit() or not signature:
            return False
        if abs(self.clock() - int(timestamp)) > self.max_skew:
            return False
        expected = request_signature(self.key, timestamp, method, path, body)
        return hmac.compare_digest(expected, signature)

    @staticmethod
    async def _reject(send: Send, status: int, code: str, title: str) -> None:
        start, body = _problem(status, code, title)
        await send(start)
        await send({"type": "http.response.body", "body": body})

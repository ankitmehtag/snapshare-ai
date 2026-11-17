"""The only path to Qdrant (AI_ARCHITECTURE §9, SECURITY §5).

Every search, upsert and delete requires a validated `Scope`, which always narrows to
one event or a set of personal albums inside one tenant. There is no unscoped method:
cross-tenant matching is impossible by construction, not by convention. Vectors are
never returned to callers.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from qdrant_client import QdrantClient, models

from .scope import Scope

PointKind = Literal["photo_face", "reference"]
MAX_SEARCH_LIMIT = 500


class ScopeRequiredError(ValueError):
    """Raised when an operation is attempted without a valid scope."""


class BiometricDeletionError(RuntimeError):
    """Raised when points remain after a scoped delete (the job must fail loudly)."""


@dataclass(frozen=True, slots=True)
class FacePoint:
    face_id: str  # uuid5(photoId, modelVersion, faceIndex) — idempotent re-index
    photo_id: str
    vector: Sequence[float]
    model_version: str
    quality: float
    kind: PointKind = "photo_face"


@dataclass(frozen=True, slots=True)
class FaceHit:
    photo_id: str
    face_id: str
    score: float


def _require_scope(scope: object) -> Scope:
    if not isinstance(scope, Scope):
        raise ScopeRequiredError("a validated Scope is required for every vector operation")
    return scope


def scope_conditions(scope: Scope) -> list[models.Condition]:
    conditions: list[models.Condition] = [
        models.FieldCondition(key="scopeType", match=models.MatchValue(value=scope.scope_type)),
        models.FieldCondition(key="scopeId", match=models.MatchValue(value=scope.scope_id)),
    ]
    if scope.event_id is not None:
        conditions.append(
            models.FieldCondition(key="eventId", match=models.MatchValue(value=scope.event_id))
        )
    elif scope.personal_album_ids:
        conditions.append(
            models.FieldCondition(
                key="personalAlbumId",
                match=models.MatchAny(any=list(scope.personal_album_ids)),
            )
        )
    else:  # unreachable: Scope's validator guarantees narrowing
        raise ScopeRequiredError("scope must narrow to an event or albums")
    return conditions


class VectorStore:
    PAYLOAD_INDEXES = ("scopeType", "scopeId", "eventId", "personalAlbumId", "photoId", "kind")

    def __init__(self, client: QdrantClient, collection: str) -> None:
        self._client = client
        self.collection = collection

    def ensure_collection(self, dim: int) -> None:
        if self._client.collection_exists(self.collection):
            return
        self._client.create_collection(
            self.collection,
            vectors_config=models.VectorParams(size=dim, distance=models.Distance.COSINE),
        )
        for key in self.PAYLOAD_INDEXES:
            self._client.create_payload_index(
                self.collection, key, field_schema=models.PayloadSchemaType.KEYWORD
            )

    def upsert(self, scope: Scope, points: Sequence[FacePoint]) -> None:
        scope = _require_scope(scope)
        base: dict[str, object] = {"scopeType": scope.scope_type, "scopeId": scope.scope_id}
        if scope.event_id is not None:
            base["eventId"] = scope.event_id
        elif scope.personal_album_ids is not None and len(scope.personal_album_ids) == 1:
            base["personalAlbumId"] = scope.personal_album_ids[0]
        else:
            raise ScopeRequiredError("a personal upsert scope must name exactly one album")
        self._client.upsert(
            self.collection,
            wait=True,
            points=[
                models.PointStruct(
                    id=p.face_id,
                    vector=list(p.vector),
                    payload={
                        **base,
                        "photoId": p.photo_id,
                        "faceId": p.face_id,
                        "kind": p.kind,
                        "modelVersion": p.model_version,
                        "quality": p.quality,
                    },
                )
                for p in points
            ],
        )

    def search(
        self,
        scope: Scope,
        vector: Sequence[float],
        *,
        limit: int,
        score_threshold: float | None = None,
        min_quality: float | None = None,
        kind: PointKind = "photo_face",
    ) -> list[FaceHit]:
        scope = _require_scope(scope)
        if not 1 <= limit <= MAX_SEARCH_LIMIT:
            raise ValueError(f"limit must be between 1 and {MAX_SEARCH_LIMIT}")
        must = [
            *scope_conditions(scope),
            models.FieldCondition(key="kind", match=models.MatchValue(value=kind)),
        ]
        if min_quality is not None:
            must.append(models.FieldCondition(key="quality", range=models.Range(gte=min_quality)))
        result = self._client.query_points(
            self.collection,
            query=list(vector),
            query_filter=models.Filter(must=must),
            limit=limit,
            score_threshold=score_threshold,
            with_payload=["photoId", "faceId"],
            with_vectors=False,
        )
        return [
            FaceHit(
                photo_id=str(p.payload["photoId"]),
                face_id=str(p.payload["faceId"]),
                score=p.score,
            )
            for p in result.points
            if p.payload is not None
        ]

    def delete(self, scope: Scope, *, photo_ids: Sequence[str] | None = None) -> int:
        """Deletes the scope's points (optionally only some photos) and verifies none remain."""
        scope = _require_scope(scope)
        must: list[models.Condition] = list(scope_conditions(scope))
        if photo_ids is not None:
            must.append(
                models.FieldCondition(key="photoId", match=models.MatchAny(any=list(photo_ids)))
            )
        flt = models.Filter(must=must)
        before = self._client.count(self.collection, count_filter=flt, exact=True).count
        self._client.delete(
            self.collection, points_selector=models.FilterSelector(filter=flt), wait=True
        )
        remaining = self._client.count(self.collection, count_filter=flt, exact=True).count
        if remaining:
            raise BiometricDeletionError(f"{remaining} points remain after scoped delete")
        return before

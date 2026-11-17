"""Model-agnostic provider contracts (AI_ARCHITECTURE §3).

Business code never imports a concrete model. Real implementations (YuNet, SFace)
arrive in Phase 4 and are chosen by the model registry. There is deliberately no
fallback implementation here: a fake embedder exists only in tests (spec §19).
"""

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import numpy as np
from numpy.typing import NDArray

Image = NDArray[np.uint8]  # HxWx3, RGB, EXIF-oriented
Embeddings = NDArray[np.float32]  # (N, dim), L2-normalized rows


@dataclass(frozen=True, slots=True)
class BBox:
    """Normalized to [0, 1] relative to the source image."""

    x: float
    y: float
    w: float
    h: float


@dataclass(frozen=True, slots=True)
class DetectedFace:
    bbox: BBox
    landmarks5: tuple[tuple[float, float], ...]
    det_score: float


@dataclass(frozen=True, slots=True)
class Quality:
    blur: float
    exposure: float
    face_size: int


@runtime_checkable
class FaceDetector(Protocol):
    model_version: str

    def warmup(self) -> None: ...
    def detect(self, images: list[Image]) -> list[list[DetectedFace]]: ...


@runtime_checkable
class FaceEmbedder(Protocol):
    model_version: str
    dim: int

    def warmup(self) -> None: ...
    def embed(self, aligned_crops: list[Image]) -> Embeddings: ...


@runtime_checkable
class QualityScorer(Protocol):
    def warmup(self) -> None: ...
    def score(self, images: list[Image]) -> list[Quality]: ...


@dataclass(slots=True)
class Providers:
    """The providers loaded in this process. Empty until Phase 4 ships real models."""

    detector: FaceDetector | None = None
    embedder: FaceEmbedder | None = None
    quality: QualityScorer | None = None

    def warmup(self) -> None:
        """Runs one inference per model so the first real request isn't slow (§8)."""
        for provider in (self.detector, self.embedder, self.quality):
            if provider is not None:
                provider.warmup()

    def describe(self) -> list[dict[str, object]]:
        models: list[dict[str, object]] = []
        if self.detector is not None:
            models.append({"role": "face-detector", "version": self.detector.model_version})
        if self.embedder is not None:
            models.append(
                {
                    "role": "face-embedder",
                    "version": self.embedder.model_version,
                    "dim": self.embedder.dim,
                }
            )
        return models

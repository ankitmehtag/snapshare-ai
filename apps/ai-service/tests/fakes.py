"""Test-only fakes. Never imported by `app/` — a fake embedder must not become a
production fallback (spec §19). tests/test_app.py enforces that."""

import hashlib

import numpy as np

from app.providers.base import Embeddings, Image


class FakeEmbedder:
    """Deterministic: the same crop bytes always give the same L2-normalized vector."""

    model_version = "fake-test-only"

    def __init__(self, dim: int = 8) -> None:
        self.dim = dim
        self.warmed = False

    def warmup(self) -> None:
        self.warmed = True

    def embed(self, aligned_crops: list[Image]) -> Embeddings:
        rows = []
        for crop in aligned_crops:
            seed = int.from_bytes(hashlib.sha256(crop.tobytes()).digest()[:8], "big")
            v = np.random.default_rng(seed).standard_normal(self.dim).astype(np.float32)
            rows.append(v / np.linalg.norm(v))
        return np.stack(rows) if rows else np.empty((0, self.dim), dtype=np.float32)

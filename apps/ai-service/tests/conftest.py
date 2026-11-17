import json
from pathlib import Path
from typing import Any

import pytest

from app.config import Settings

VECTORS_PATH = Path(__file__).resolve().parents[3] / "tooling/contracts/ai-signing-vectors.json"


@pytest.fixture(scope="session")
def vectors() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(VECTORS_PATH.read_text())
    return data


@pytest.fixture
def settings(vectors: dict[str, Any]) -> Settings:
    return Settings.model_validate(
        {
            "NODE_ENV": "test",
            "AI_SERVICE_TOKEN": vectors["requestKey"],
            "AI_SCOPE_SIGNING_KEY": vectors["scopeKey"],
            "QDRANT_URL": "http://127.0.0.1:1",
            "QDRANT_API_KEY": "test-only-qdrant-key",
        }
    )

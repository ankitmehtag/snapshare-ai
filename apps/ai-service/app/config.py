from typing import Literal

from pydantic import AliasChoices, Field, HttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """ai-service configuration. Reads the same root `.env` as the Node apps."""

    model_config = SettingsConfigDict(extra="ignore", frozen=True)

    env: Literal["development", "test", "production"] = Field(
        default="development", validation_alias=AliasChoices("NODE_ENV", "AI_ENV")
    )
    log_level: str = Field(default="info", validation_alias="LOG_LEVEL")

    # Authenticates every /v1 request from the orchestrator (AI_ARCHITECTURE §10).
    service_token: SecretStr = Field(validation_alias="AI_SERVICE_TOKEN", min_length=32)
    # Signs scope/filter objects. Separate from the request key so one leak alone
    # cannot be used to forge a widened search.
    scope_signing_key: SecretStr = Field(validation_alias="AI_SCOPE_SIGNING_KEY", min_length=32)
    max_clock_skew_seconds: int = Field(default=60, ge=5, le=300)

    qdrant_url: HttpUrl = Field(validation_alias="QDRANT_URL")
    qdrant_api_key: SecretStr = Field(validation_alias="QDRANT_API_KEY", min_length=16)

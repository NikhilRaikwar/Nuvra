from functools import lru_cache
from pathlib import Path
from tempfile import gettempdir

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    reasoning_model: str = Field(default="openai/gpt-4o-mini", alias="NUVRA_REASONING_MODEL")
    planner_model: str = Field(default="openai/gpt-4o-mini", alias="NUVRA_PLANNER_MODEL")
    critic_model: str = Field(default="openai/gpt-4o-mini", alias="NUVRA_CRITIC_MODEL")

    database_url: str = Field(default="", alias="DATABASE_URL")
    agent_service_url: str = Field(default="http://localhost:8000", alias="AGENT_SERVICE_URL")
    web_origin: str = Field(default="http://localhost:3000", alias="NUVRA_WEB_ORIGIN")

    langsmith_tracing: bool = Field(default=False, alias="LANGSMITH_TRACING")
    langsmith_api_key: str = Field(default="", alias="LANGSMITH_API_KEY")

    sqlite_checkpoint_path: str = str(
        Path(gettempdir()) / "nuvra-agent-service" / "nuvra-agent-checkpoints.sqlite"
    )
    graph_version: str = "proof-agent-v0.1"

    request_timeout_seconds: float = 8.0
    max_body_bytes: int = 350_000
    max_redirects: int = 3
    max_concurrent_runs: int = 2

    cors_origins: list[str | AnyHttpUrl] = []

    @property
    def allowed_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.cors_origins] or [
            self.web_origin.rstrip("/")
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()

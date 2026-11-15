from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def is_trusted_origin(value: str | None, config: "Settings") -> bool:
    return value is None or value in config.origins


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ASTRA_",
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )
    mode: Literal["DEMO"] = "DEMO"
    deployment_profile: Literal["local", "public_demo"] = "local"
    database_url: str = "sqlite:///./astra.db"
    demo_token: str = Field(default="local-demo-only", min_length=8)
    allowed_origin: str = "http://127.0.0.1:5173"
    trusted_origins: str = ""
    stale_seconds: int = Field(default=5, ge=1)
    disconnect_seconds: int = Field(default=15, ge=2)

    @model_validator(mode="after")
    def windows(self):
        if self.disconnect_seconds <= self.stale_seconds:
            raise ValueError("disconnect_seconds must exceed stale_seconds")
        if self.deployment_profile == "public_demo":
            for value in self.origins:
                origin = urlsplit(value)
                if (
                    origin.scheme not in ("http", "https")
                    or not origin.hostname
                    or origin.username
                    or origin.password
                    or origin.path
                    or origin.query
                    or origin.fragment
                ):
                    raise ValueError("public_demo requires exact HTTP(S) allowed origins")
            if len(self.demo_token) < 32:
                raise ValueError(
                    "public_demo requires a generated worker token of at least 32 characters"
                )
        return self

    @property
    def origins(self) -> list[str]:
        return list(
            dict.fromkeys(
                [
                    self.allowed_origin,
                    *(item.strip() for item in self.trusted_origins.split(",") if item.strip()),
                ]
            )
        )

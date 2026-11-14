from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ASTRA_",
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )
    mode: Literal["DEMO"] = "DEMO"
    database_url: str = "sqlite:///./astra.db"
    demo_token: str = Field(default="local-demo-only", min_length=8)
    allowed_origin: str = "http://127.0.0.1:5173"
    stale_seconds: int = Field(default=5, ge=1)
    disconnect_seconds: int = Field(default=15, ge=2)

    @model_validator(mode="after")
    def windows(self):
        if self.disconnect_seconds <= self.stale_seconds:
            raise ValueError("disconnect_seconds must exceed stale_seconds")
        return self

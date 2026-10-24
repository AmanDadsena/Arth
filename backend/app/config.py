"""Runtime settings, read once from environment variables / backend/.env.

Everything that differs between a laptop demo and a deployed server lives here,
so no module reads os.environ directly.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_prefix="ARTH_", extra="ignore"
    )

    env: Literal["development", "production", "test"] = "development"
    api_prefix: str = "/api"

    # --- Auth (Firebase Google sign-in) ---
    firebase_project_id: str = ""
    # Development only: accept requests without a token as this fixed user.
    # Refused at startup when env == "production".
    auth_disabled: bool = False
    dev_uid: str = "dev-user"

    # --- Browser access ---
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    rate_limit_rps: float = 10.0
    rate_limit_burst: int = 20

    # --- Local AI (Gemma 4 through Ollama) ---
    ollama_url: str = "http://127.0.0.1:11434"
    model: str = "gemma4:e2b"
    model_label: str = "gemma-4-e2b"
    llm_timeout_s: float = 18.0  # frontend aborts /ai/* at 20 s
    llm_max_concurrency: int = 2  # one laptop GPU; more just queues inside Ollama
    llm_num_ctx: int = 8192

    # --- Speech to text ---
    stt_backend: Literal["gemma", "whisper"] = "gemma"  # gemma = Gemma 4 native audio (no extra download)
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    # --- Storage ---
    data_dir: Path = BACKEND_DIR / ".data"
    # 32-byte key, base64. Generated into data_dir on first run if empty.
    data_key: str = ""
    history_ttl_days: int = 30
    # Community pest alerts appear only once this many different farmers in a district
    # report the same pest within 7 days (privacy threshold, k-anonymity style).
    pest_alert_min_farmers: int = Field(default=3, ge=2)

    # --- External data ---
    data_gov_in_api_key: str = ""
    mandi_resource_id: str = "9ef84268-d588-465a-a308-a864a43d0070"
    mandi_state: str = "Maharashtra"
    transport_rs_per_quintal_km: float = 2.0  # assumption, shown to farmer as an estimate
    http_timeout_s: float = 8.0

    # --- Upload limits (match docs/SPEC.md) ---
    max_image_bytes: int = 5 * 1024 * 1024
    max_audio_bytes: int = 2 * 1024 * 1024
    max_audio_seconds: float = 15.5
    image_max_side: int = 1024

    @field_validator("api_prefix")
    @classmethod
    def _prefix(cls, v: str) -> str:
        v = v.rstrip("/")
        return v if not v or v.startswith("/") else "/" + v

    def check_safe(self) -> None:
        """Fail fast on configurations that would be insecure in production."""
        if self.env == "production":
            if self.auth_disabled:
                raise RuntimeError("ARTH_AUTH_DISABLED must be false in production")
            if not self.firebase_project_id:
                raise RuntimeError("ARTH_FIREBASE_PROJECT_ID is required in production")
            if not self.data_key:
                raise RuntimeError("ARTH_DATA_KEY is required in production")
        elif not self.auth_disabled and not self.firebase_project_id:
            raise RuntimeError(
                "Set ARTH_FIREBASE_PROJECT_ID, or ARTH_AUTH_DISABLED=true for local development"
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Runtime configuration, loaded from environment variables / server/.env."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVER_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # Core
    environment: str = "development"
    database_url: str = "postgresql+psycopg://creovox:creovox@localhost:5432/creovox"
    frontend_origin: str = "http://localhost:5173"
    storage_dir: Path = SERVER_DIR / "storage"
    max_upload_bytes: int = 2 * 1024 * 1024 * 1024

    # Auth
    session_secret: str = "dev-insecure-secret-change-me"
    session_days: int = 30
    cookie_secure: bool = False
    google_client_id: str = ""
    otp_ttl_minutes: int = 10
    otp_resend_seconds: int = 60
    otp_max_per_hour: int = 5
    otp_max_attempts: int = 5

    # Mail (leave SMTP_HOST empty to print sign-in codes to the console)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "CREOVOX AI <no-reply@creovox.local>"
    smtp_starttls: bool = True

    # AI text/vision generation. AI_PROVIDER: auto | groq | anthropic | none
    ai_provider: str = "auto"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_vision_model: str = "qwen/qwen3.8-27b"
    anthropic_api_key: str = ""
    claude_model: str = "claude-opus-5-5"
    ai_force_enabled: bool = Field(default=False, description="Use Anthropic SDK default credentials even without ANTHROPIC_API_KEY")

    # Transcription. TRANSCRIBE_PROVIDER: auto (Groq Whisper if GROQ_API_KEY, else local) | groq | local
    transcribe_provider: str = "auto"
    groq_whisper_model: str = "whisper-large-v3-turbo"
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    # Media tools
    ffmpeg_bin: str = "ffmpeg"
    ffprobe_bin: str = "ffprobe"

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.frontend_origin.split(",") if o.strip()]

    @property
    def anthropic_configured(self) -> bool:
        return bool(
            self.anthropic_api_key
            or os.environ.get("ANTHROPIC_API_KEY")
            or os.environ.get("ANTHROPIC_AUTH_TOKEN")
            or self.ai_force_enabled
        )

    @property
    def groq_configured(self) -> bool:
        return bool(self.groq_api_key or os.environ.get("GROQ_API_KEY"))

    @property
    def active_ai_provider(self) -> str | None:
        """Which LLM provider generation calls use, or None when AI is not configured."""
        p = self.ai_provider.lower()
        if p == "none":
            return None
        if p == "groq":
            return "groq" if self.groq_configured else None
        if p == "anthropic":
            return "anthropic" if self.anthropic_configured else None
        if self.groq_configured:
            return "groq"
        if self.anthropic_configured:
            return "anthropic"
        return None

    @property
    def ai_enabled(self) -> bool:
        return self.active_ai_provider is not None

    @property
    def active_transcriber(self) -> str:
        p = self.transcribe_provider.lower()
        if p == "local":
            return "local"
        if p == "groq":
            return "groq"
        return "groq" if self.groq_configured else "local"

    @property
    def mail_enabled(self) -> bool:
        return bool(self.smtp_host)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

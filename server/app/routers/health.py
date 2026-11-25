from __future__ import annotations

import shutil

from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.db import engine

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health() -> dict:
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "ok": db_ok,
        "database": db_ok,
        "ffmpeg": bool(shutil.which(settings.ffmpeg_bin)) and bool(shutil.which(settings.ffprobe_bin)),
        "ai": {"enabled": settings.ai_enabled, "provider": settings.active_ai_provider},
        "transcriber": settings.active_transcriber,
        "googleSignIn": bool(settings.google_client_id),
        "mail": "smtp" if settings.mail_enabled else "console",
    }

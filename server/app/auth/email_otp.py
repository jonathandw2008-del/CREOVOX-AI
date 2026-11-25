"""Passwordless email sign-in with 6-digit one-time codes."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth.users import normalize_email
from app.config import settings
from app.models import EmailCode, utcnow


def _code_hash(email: str, code: str) -> str:
    return hmac.new(settings.session_secret.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _error(status: int, code: str, message: str, **extra) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message, **extra})


def start(db: Session, email: str) -> tuple[str, int]:
    """Create and store a new code. Returns (code, seconds until a resend is allowed)."""
    email = normalize_email(email)
    now = utcnow()

    last = db.scalar(select(EmailCode).where(EmailCode.email == email).order_by(EmailCode.created_at.desc()).limit(1))
    if last is not None:
        wait = settings.otp_resend_seconds - int((now - last.created_at).total_seconds())
        if wait > 0:
            raise _error(429, "resend_too_soon", f"Please wait {wait}s before requesting another code.", retryAfter=wait)

    recent = db.scalar(
        select(func.count()).select_from(EmailCode).where(EmailCode.email == email, EmailCode.created_at > now - timedelta(hours=1))
    )
    if (recent or 0) >= settings.otp_max_per_hour:
        raise _error(429, "too_many_codes", "Too many codes requested for this email. Try again later.", retryAfter=3600)

    # Only the newest code is valid.
    db.execute(update(EmailCode).where(EmailCode.email == email, EmailCode.consumed_at.is_(None)).values(consumed_at=now))

    code = f"{secrets.randbelow(10**6):06d}"
    db.add(EmailCode(email=email, code_hash=_code_hash(email, code), expires_at=now + timedelta(minutes=settings.otp_ttl_minutes)))
    db.commit()
    return code, settings.otp_resend_seconds


def verify(db: Session, email: str, code: str) -> str:
    """Check a code. Returns the normalised email on success, raises HTTPException otherwise."""
    email = normalize_email(email)
    now = utcnow()
    row = db.scalar(
        select(EmailCode)
        .where(EmailCode.email == email, EmailCode.consumed_at.is_(None))
        .order_by(EmailCode.created_at.desc())
        .limit(1)
    )
    if row is None or row.expires_at <= now:
        raise _error(400, "code_expired", "This code has expired. Request a new one.")
    if row.attempts >= settings.otp_max_attempts:
        raise _error(400, "too_many_attempts", "Too many incorrect attempts. Request a new code.")

    row.attempts += 1
    if not hmac.compare_digest(row.code_hash, _code_hash(email, code)):
        remaining = settings.otp_max_attempts - row.attempts
        if remaining <= 0:
            row.consumed_at = now
        db.commit()
        raise _error(400, "invalid_code", "That code isn't right." + (f" {remaining} attempt(s) left." if remaining > 0 else " Request a new code."), remaining=max(0, remaining))

    row.consumed_at = now
    db.commit()
    return email

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import SessionToken, User, utcnow

COOKIE_NAME = "creovox_session"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User, user_agent: str = "") -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        SessionToken(
            user_id=user.id,
            token_hash=_hash(token),
            user_agent=user_agent[:500],
            expires_at=utcnow() + timedelta(days=settings.session_days),
        )
    )
    user.last_login_at = utcnow()
    db.commit()
    return token


def user_for_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    row = db.scalar(select(SessionToken).where(SessionToken.token_hash == _hash(token)))
    if row is None:
        return None
    if row.expires_at <= utcnow():
        db.delete(row)
        db.commit()
        return None
    return db.get(User, row.user_id)


def revoke_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(SessionToken).where(SessionToken.token_hash == _hash(token)))
        db.commit()


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, secure=settings.cookie_secure, samesite="lax")

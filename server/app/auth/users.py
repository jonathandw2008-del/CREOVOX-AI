from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User


def normalize_email(email: str) -> str:
    return email.strip().lower()


def upsert_email_user(db: Session, email: str) -> User:
    email = normalize_email(email)
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, name=email.split("@")[0])
        db.add(user)
        db.flush()
    return user


def upsert_google_user(db: Session, *, sub: str, email: str, name: str | None, picture: str | None) -> User:
    email = normalize_email(email)
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, name=name or email.split("@")[0])
            db.add(user)
        user.google_sub = sub
    if name and (not user.name or user.name == user.email.split("@")[0]):
        user.name = name
    if picture:
        user.avatar_url = picture
    db.flush()
    return user

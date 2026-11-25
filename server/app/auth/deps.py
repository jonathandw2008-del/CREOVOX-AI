from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth.sessions import COOKIE_NAME, user_for_token
from app.db import get_db
from app.models import User


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = user_for_token(db, request.cookies.get(COOKIE_NAME))
    if user is None:
        raise HTTPException(status_code=401, detail={"code": "unauthenticated", "message": "Please sign in to continue."})
    return user


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

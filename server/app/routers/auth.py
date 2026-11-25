from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.auth import email_otp
from app.auth.deps import client_ip, current_user
from app.auth.google import GoogleAuthError, verify_credential
from app.auth.mailer import send_login_code
from app.auth.sessions import COOKIE_NAME, clear_session_cookie, create_session, revoke_session, set_session_cookie
from app.auth.users import upsert_email_user, upsert_google_user
from app.config import settings
from app.db import get_db
from app.models import User
from app.schemas.auth import AuthConfig, EmailStart, EmailVerify, GoogleSignIn, UserOut
from app.services.ratelimit import auth_ip_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_out(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email, name=user.name, avatarUrl=user.avatar_url, createdAt=user.created_at)


def _sign_in(db: Session, user: User, request: Request, response: Response) -> UserOut:
    token = create_session(db, user, request.headers.get("user-agent", ""))
    set_session_cookie(response, token)
    return user_out(user)


@router.get("/config", response_model=AuthConfig)
def auth_config() -> AuthConfig:
    return AuthConfig(
        googleClientId=settings.google_client_id or None,
        googleEnabled=bool(settings.google_client_id),
        emailEnabled=True,
        devMailer=not settings.mail_enabled,
    )


@router.post("/google", response_model=UserOut)
def google_sign_in(body: GoogleSignIn, request: Request, response: Response, db: Session = Depends(get_db)) -> UserOut:
    auth_ip_limiter.hit(f"google:{client_ip(request)}")
    if not settings.google_client_id:
        raise HTTPException(503, detail={"code": "google_disabled", "message": "Google sign-in is not configured on this server."})
    try:
        ident = verify_credential(body.credential)
    except GoogleAuthError as e:
        raise HTTPException(401, detail={"code": "google_invalid", "message": f"Google sign-in failed: {e}"}) from e
    user = upsert_google_user(db, sub=ident.sub, email=ident.email, name=ident.name, picture=ident.picture)
    return _sign_in(db, user, request, response)


@router.post("/email/start")
async def email_start(body: EmailStart, request: Request, db: Session = Depends(get_db)) -> dict:
    auth_ip_limiter.hit(f"otp-start:{client_ip(request)}")
    code, resend_in = await run_in_threadpool(email_otp.start, db, body.email)
    try:
        await run_in_threadpool(send_login_code, body.email.lower(), code)
    except Exception as e:  # SMTP failure: don't leave the user waiting for a code that never arrives
        raise HTTPException(502, detail={"code": "mail_failed", "message": "We couldn't send the email. Please try again shortly."}) from e
    return {"ok": True, "expiresIn": settings.otp_ttl_minutes * 60, "resendIn": resend_in, "devMailer": not settings.mail_enabled}


@router.post("/email/verify", response_model=UserOut)
def email_verify(body: EmailVerify, request: Request, response: Response, db: Session = Depends(get_db)) -> UserOut:
    auth_ip_limiter.hit(f"otp-verify:{client_ip(request)}")
    email = email_otp.verify(db, body.email, body.code)
    user = upsert_email_user(db, email)
    return _sign_in(db, user, request, response)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return user_out(user)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    revoke_session(db, request.cookies.get(COOKIE_NAME))
    clear_session_cookie(response)
    return {"ok": True}

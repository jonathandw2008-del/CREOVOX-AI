from __future__ import annotations

from dataclasses import dataclass

from app.config import settings


class GoogleAuthError(Exception):
    pass


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    name: str | None
    picture: str | None


def verify_credential(credential: str) -> GoogleIdentity:
    """Verify a Google Identity Services ID token (the `credential` from the Sign in with Google button)."""
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token

    try:
        info = id_token.verify_oauth2_token(credential, g_requests.Request(), settings.google_client_id, clock_skew_in_seconds=10)
    except ValueError as e:  # bad signature, wrong audience, expired…
        raise GoogleAuthError(str(e)) from e

    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise GoogleAuthError("Unexpected token issuer")
    if not info.get("email") or not info.get("email_verified"):
        raise GoogleAuthError("Google account email is not verified")
    return GoogleIdentity(sub=str(info["sub"]), email=info["email"], name=info.get("name"), picture=info.get("picture"))

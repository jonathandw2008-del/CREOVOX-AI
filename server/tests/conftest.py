"""Test setup: isolated SQLite DB + temp storage; AI and Groq are disabled so tests never hit the network."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="creovox-test-"))
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{_TMP / 'test.db'}",
        "STORAGE_DIR": str(_TMP / "storage"),
        "GROQ_API_KEY": "",
        "ANTHROPIC_API_KEY": "",
        "AI_PROVIDER": "none",
        "TRANSCRIBE_PROVIDER": "local",
        "SMTP_HOST": "",
        "GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com",
        "SESSION_SECRET": "test-secret",
        "FRONTEND_ORIGIN": "http://localhost:5173",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.models import Base, User  # noqa: E402
from app.auth.sessions import COOKIE_NAME, create_session  # noqa: E402
from app.services.ratelimit import ai_user_limiter, auth_ip_limiter  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    auth_ip_limiter.reset()
    ai_user_limiter.reset()
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def client():
    from app.main import app

    with TestClient(app, base_url="http://testserver") as c:
        yield c


def make_user(db, email: str = "alice@example.com") -> User:
    u = User(email=email, name=email.split("@")[0])
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def user(db) -> User:
    return make_user(db)


@pytest.fixture
def auth_client(client, db, user):
    """A TestClient signed in as `user`."""
    token = create_session(db, user, "pytest")
    client.cookies.set(COOKIE_NAME, token)
    return client


def login_as(client: TestClient, db, user: User) -> TestClient:
    client.cookies.set(COOKIE_NAME, create_session(db, user, "pytest"))
    return client

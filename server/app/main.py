"""CREOVOX AI API. Run: uv run uvicorn app.main:app --reload --port 8000"""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import activity, ai, auth, health, jobs, media, projects

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("creovox")

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def create_app() -> FastAPI:
    app = FastAPI(title="CREOVOX AI API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")

    @app.middleware("http")
    async def origin_check(request: Request, call_next):
        # CSRF defence in depth (cookies are already SameSite=Lax): reject cross-origin writes.
        if request.method in UNSAFE and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and origin.rstrip("/") not in settings.allowed_origins:
                return JSONResponse({"error": {"code": "bad_origin", "message": "Cross-origin request rejected."}}, status_code=403)
        return await call_next(request)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
        return JSONResponse({"error": detail}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(x) for x in first.get("loc", []) if x != "body")
        return JSONResponse(
            {"error": {"code": "invalid_request", "message": f"{loc}: {first.get('msg', 'invalid')}" if loc else "Invalid request.", "fields": exc.errors()[:10]}},
            status_code=422,
        )

    for r in (health, auth, projects, media, jobs, ai, activity):
        app.include_router(r.router)

    if settings.is_production and settings.session_secret.startswith("dev-"):
        log.warning("SESSION_SECRET is the development default. Set a long random value in production!")
    return app


app = create_app()

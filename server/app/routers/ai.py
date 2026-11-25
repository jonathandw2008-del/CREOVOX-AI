from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.auth.deps import current_user
from app.models import User
from app.schemas.ai import AudienceRequest, ContentRequest
from app.services import ai_tasks
from app.services.ai import AIError, AIUnavailable, ai_enabled, provider_name
from app.services.ratelimit import ai_user_limiter

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _unavailable() -> HTTPException:
    return HTTPException(503, detail={"code": "ai_unavailable", "message": "AI generation isn't configured on this server."})


async def _run(fn, **kwargs):
    try:
        return await run_in_threadpool(lambda: fn(**kwargs))
    except AIUnavailable as e:
        raise _unavailable() from e
    except AIError as e:
        raise HTTPException(e.status_code, detail={"code": e.code, "message": str(e)}) from e


@router.get("/status")
def status(user: User = Depends(current_user)) -> dict:
    return {"enabled": ai_enabled(), "provider": provider_name()}


@router.post("/content")
async def content(body: ContentRequest, user: User = Depends(current_user)) -> dict:
    if not ai_enabled():
        raise _unavailable()
    ai_user_limiter.hit(user.id)
    items = await _run(
        ai_tasks.generate_content,
        context=body.context.model_dump(),
        platform=body.platform,
        tone=body.tone,
        types=list(body.types),
        variant=body.variant,
        previous=body.previous,
    )
    return {"items": items}


@router.post("/audience")
async def audience(body: AudienceRequest, user: User = Depends(current_user)) -> dict:
    if not ai_enabled():
        raise _unavailable()
    ai_user_limiter.hit(user.id)
    variations = await _run(
        ai_tasks.generate_audience,
        context=body.context.model_dump(),
        audiences=[a.model_dump() for a in body.audiences],
        language=body.language,
        variant=body.variant,
    )
    return {"variations": variations}

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import Activity, User
from app.schemas.ai import ActivityIn
from app.services.projects import log_activity

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("")
def list_activity(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Activity).where(Activity.user_id == user.id).order_by(Activity.at.desc()).limit(30))
    out = []
    for a in rows:
        item = {"id": a.id, "text": a.text, "at": a.at.isoformat(), "kind": a.kind}
        if a.project_id:
            item["projectId"] = a.project_id
        out.append(item)
    return out


@router.post("")
def add_activity(body: ActivityIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    log_activity(db, user.id, body.text, body.kind, body.projectId)
    return {"ok": True}

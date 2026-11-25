from __future__ import annotations

import json
from typing import get_args

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import MediaAsset, Project, User, utcnow
from app.schemas.project import ProjectIn, ProjectStatus, ProjectUpdateIn, parse_doc
from app.services import storage
from app.services.projects import get_owned_project, log_activity, project_out, save_doc

router = APIRouter(prefix="/api/projects", tags=["projects"])

MAX_DOC_BYTES = 6 * 1024 * 1024
STATUSES = set(get_args(ProjectStatus))


def _bad(status: int, code: str, message: str, **extra) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message, **extra})


async def _check_size(request: Request) -> None:
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_DOC_BYTES:
        raise _bad(413, "too_large", "This project is too large to save. Remove captured frames or large images.")


def _title(data: dict) -> str:
    title = str(data.get("title") or "").strip()
    if not title:
        raise _bad(422, "invalid_request", "title: a project title is required.")
    if len(title) > 300:
        raise _bad(422, "invalid_request", "title: at most 300 characters.")
    return title


def _status(data: dict, default: str) -> str:
    st = data.get("status") or default
    if st not in STATUSES:
        raise _bad(422, "invalid_request", f"status: must be one of {sorted(STATUSES)}.")
    return st


def _doc(data: dict) -> dict:
    try:
        return parse_doc(data)
    except ValidationError as e:
        first = e.errors()[0] if e.errors() else {}
        loc = ".".join(str(x) for x in first.get("loc", []))
        raise _bad(422, "invalid_request", f"{loc}: {first.get('msg', 'invalid')}" if loc else "Invalid project.") from e


def asset_referenced(db: Session, user_id: str, asset_id: str, *, exclude_project: str | None = None) -> bool:
    for row in db.scalars(select(Project).where(Project.user_id == user_id)):
        if row.id == exclude_project:
            continue
        vf = (row.doc or {}).get("videoFile") or {}
        if vf.get("assetId") == asset_id:
            return True
    return False


def delete_asset(db: Session, asset: MediaAsset) -> None:
    storage.remove_tree(storage.asset_dir(asset.user_id, asset.id))
    db.delete(asset)


@router.get("")
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc())).all()
    return [project_out(r) for r in rows]


@router.post("", dependencies=[Depends(_check_size)])
def create_project(body: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    data = dict(body.project)
    data.pop("videoFile", None)
    data.pop("isDemo", None)
    title = _title(data)
    status = _status(data, "uploading")
    doc = _doc(data)
    now = utcnow()
    row = Project(user_id=user.id, title=title, status=status, doc=doc, version=1, created_at=now, updated_at=now)
    db.add(row)
    db.flush()
    log_activity(db, user.id, f"New project '{title}' created", "create", row.id, commit=False)
    db.commit()
    return project_out(row)


@router.get("/{project_id}")
def get_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return project_out(get_owned_project(db, user, project_id))


@router.put("/{project_id}", dependencies=[Depends(_check_size)])
def update_project(project_id: str, body: ProjectUpdateIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    row = get_owned_project(db, user, project_id, for_update=True)
    if body.version != row.version:
        raise _bad(409, "version_conflict", "This project changed elsewhere. Your view was refreshed.", project=project_out(row))
    data = dict(body.project)
    if len(json.dumps(data, separators=(",", ":"))) > MAX_DOC_BYTES:
        raise _bad(413, "too_large", "This project is too large to save. Remove captured frames or large images.")
    title = _title(data)
    status = _status(data, row.status)
    doc = _doc(data)
    stored_video = (row.doc or {}).get("videoFile")
    if stored_video:
        doc["videoFile"] = stored_video
    else:
        doc.pop("videoFile", None)
    save_doc(db, row, doc, title=title, status=status)
    return project_out(row)


@router.delete("/{project_id}")
def delete_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    row = get_owned_project(db, user, project_id)
    title = row.title
    asset_id = ((row.doc or {}).get("videoFile") or {}).get("assetId")
    storage.remove_tree(storage.project_dir(user.id, row.id))
    db.delete(row)
    db.flush()
    if asset_id and not asset_referenced(db, user.id, asset_id):
        asset = db.get(MediaAsset, asset_id)
        if asset is not None and asset.user_id == user.id:
            delete_asset(db, asset)
    log_activity(db, user.id, f"Deleted project '{title}'", "delete", commit=False)
    db.commit()
    return {"ok": True}


@router.post("/{project_id}/duplicate")
def duplicate_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    src = get_owned_project(db, user, project_id)
    now = utcnow()
    copy = Project(
        user_id=user.id,
        title=f"{src.title} (copy)"[:300],
        status=src.status,
        doc=json.loads(json.dumps(src.doc or {})),
        version=1,
        created_at=now,
        updated_at=now,
    )
    db.add(copy)
    db.flush()
    log_activity(db, user.id, f"Duplicated '{src.title}'", "create", copy.id, commit=False)
    db.commit()
    return project_out(copy)

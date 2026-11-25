"""Helpers shared by the projects/media routers and the worker."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Activity, Project, User, utcnow


def project_out(row: Project) -> dict:
    """Frontend `Project` JSON: the stored doc plus row columns."""
    doc = dict(row.doc or {})
    return {
        **doc,
        "id": row.id,
        "title": row.title,
        "status": row.status,
        "version": row.version,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
    }


def get_owned_project(db: Session, user: User | str, project_id: str, *, for_update: bool = False) -> Project:
    """Load a project owned by `user`, or raise 404 (also for other users' projects)."""
    user_id = user if isinstance(user, str) else user.id
    row = db.get(Project, project_id, with_for_update=for_update)
    if row is None or row.user_id != user_id:
        raise HTTPException(404, detail={"code": "not_found", "message": "Project not found."})
    return row


def save_doc(db: Session, row: Project, doc: dict, *, title: str | None = None, status: str | None = None, commit: bool = True) -> Project:
    """Replace the doc, bump the version and updated_at. Use for server-side writes (worker, uploads)."""
    row.doc = doc
    if title is not None:
        row.title = title
    if status is not None:
        row.status = status
    row.version = (row.version or 0) + 1
    row.updated_at = utcnow()
    if commit:
        db.commit()
    return row


def log_activity(db: Session, user_id: str, text: str, kind: str, project_id: str | None = None, *, commit: bool = True) -> None:
    db.add(Activity(user_id=user_id, project_id=project_id, kind=kind, text=text[:500]))
    if commit:
        db.commit()

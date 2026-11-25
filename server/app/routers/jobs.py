from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.jobs.queue import ACTIVE, enqueue, job_out, request_cancel
from app.models import Job, User, new_id
from app.schemas.ai import AnalyzeRequest, PackageOptionsIn, RenderRequest, TranslateRequest
from app.services import storage
from app.services.ai import ai_enabled
from app.services.projects import get_owned_project
from app.services.ratelimit import RateLimiter

router = APIRouter(prefix="/api", tags=["jobs"])

job_limiter = RateLimiter(limit=30, window_seconds=60)

MAX_THUMBS = 20
MAX_THUMB_BYTES = 10 * 1024 * 1024
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _err(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def _owned_job(db: Session, user: User, job_id: str) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.user_id != user.id:
        raise _err(404, "not_found", "Job not found.")
    return job


def _require_video(doc: dict) -> None:
    if not ((doc or {}).get("videoFile") or {}).get("assetId"):
        raise _err(400, "no_video", "Upload a video to this project first.")


@router.post("/projects/{project_id}/analyze")
def analyze(project_id: str, body: AnalyzeRequest | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    job_limiter.hit(user.id)
    row = get_owned_project(db, user, project_id)
    _require_video(row.doc)
    job = enqueue(db, user_id=user.id, project_id=row.id, type="analyze", params={"language": (body.language if body else None) or None}, dedupe=True)
    if row.status != "processing":
        row.status = "processing"
        db.commit()
    return job_out(job)


@router.post("/jobs/translate")
def translate(body: TranslateRequest, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    job_limiter.hit(user.id)
    if not ai_enabled():
        raise _err(503, "ai_unavailable", "AI translation isn't configured on this server.")
    project_id = None
    if body.projectId:
        project_id = get_owned_project(db, user, body.projectId).id
    params = {
        "segments": [s.model_dump() for s in body.segments],
        "sourceLanguage": body.sourceLanguage,
        "targetLanguage": body.targetLanguage,
        "targetLanguageName": body.targetLanguageName,
    }
    return job_out(enqueue(db, user_id=user.id, project_id=project_id, type="translate", params=params))


@router.post("/projects/{project_id}/thumbnails/suggest")
def suggest_thumbnails(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    job_limiter.hit(user.id)
    row = get_owned_project(db, user, project_id)
    _require_video(row.doc)
    return job_out(enqueue(db, user_id=user.id, project_id=row.id, type="thumbnails", params={}, dedupe=True))


def _check_clips(doc: dict, clip_ids: list[str]) -> None:
    known = {c.get("id") for c in (doc or {}).get("clips", [])}
    missing = [c for c in clip_ids if c not in known]
    if missing:
        raise _err(400, "unknown_clip", f"Unknown clip id(s): {', '.join(missing[:5])}.")


@router.post("/projects/{project_id}/render")
def render(project_id: str, body: RenderRequest, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    job_limiter.hit(user.id)
    row = get_owned_project(db, user, project_id)
    _require_video(row.doc)
    _check_clips(row.doc, body.clipIds)
    return job_out(enqueue(db, user_id=user.id, project_id=row.id, type="render", params=body.model_dump()))


@router.post("/projects/{project_id}/package")
async def package(
    project_id: str,
    options: str = Form(...),
    thumbnails: list[UploadFile] = File(default=[]),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    job_limiter.hit(user.id)
    row = get_owned_project(db, user, project_id)
    try:
        opts = PackageOptionsIn.model_validate(json.loads(options))
    except (ValueError, ValidationError) as e:
        raise _err(422, "invalid_request", "options: invalid package options.") from e
    if opts.includeClips:
        _require_video(row.doc)
        if opts.clipIds:
            _check_clips(row.doc, opts.clipIds)
    if len(thumbnails) > MAX_THUMBS:
        raise _err(400, "too_many_files", f"At most {MAX_THUMBS} thumbnails.")

    upload_dir = storage.project_dir(user.id, row.id) / "uploads" / new_id()
    upload_dir.mkdir(parents=True, exist_ok=True)
    try:
        for i, f in enumerate(thumbnails):
            data = await f.read(MAX_THUMB_BYTES + 1)
            if len(data) > MAX_THUMB_BYTES:
                raise _err(413, "too_large", "Each thumbnail must be under 10 MB.")
            if not data.startswith(PNG_MAGIC):
                raise _err(400, "invalid_file", "Thumbnails must be PNG images.")
            stem = Path(f.filename or f"thumbnail-{i + 1}.png").stem
            safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in stem)[:80].strip("-") or f"thumbnail-{i + 1}"
            (upload_dir / f"{i + 1:02d}-{safe}.png").write_bytes(data)
    except BaseException:
        storage.remove_tree(upload_dir)
        raise

    params = {**opts.model_dump(), "thumbnailDir": storage.rel_path(upload_dir)}
    return job_out(enqueue(db, user_id=user.id, project_id=row.id, type="package", params=params))


@router.get("/jobs/{job_id}")
def get_job(job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return job_out(_owned_job(db, user, job_id))


@router.get("/jobs")
def list_jobs(projectId: str | None = None, active: int = 0, user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    q = select(Job).where(Job.user_id == user.id)
    if projectId:
        get_owned_project(db, user, projectId)
        q = q.where(Job.project_id == projectId)
    if active:
        q = q.where(Job.status.in_(ACTIVE))
    return [job_out(j) for j in db.scalars(q.order_by(Job.created_at.desc()).limit(50))]


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    job = _owned_job(db, user, job_id)
    request_cancel(db, job)
    db.refresh(job)
    return job_out(job)


@router.get("/jobs/{job_id}/files/{index}")
def job_file(job_id: str, index: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = _owned_job(db, user, job_id)
    result = job.result if isinstance(job.result, dict) else {}
    files = result.get("_files") or []
    if job.status == "succeeded" and result.get("expired"):
        raise _err(410, "expired", "This download has expired. Render it again.")
    if job.status != "succeeded" or index < 0 or index >= len(files):
        raise _err(404, "not_found", "File not found.")
    try:
        path = storage.abs_path(files[index])
    except ValueError:
        raise _err(404, "not_found", "File not found.")
    if not path.is_file():
        raise _err(404, "not_found", "File no longer exists. Render it again.")
    name = path.name
    public = result.get("files")
    if isinstance(public, list) and index < len(public) and isinstance(public[index], dict) and public[index].get("name"):
        name = public[index]["name"]
    elif isinstance(result.get("file"), dict) and result["file"].get("name"):
        name = result["file"]["name"]
    media_type = {".mp4": "video/mp4", ".webm": "video/webm", ".zip": "application/zip"}.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type, filename=name, headers={"Cache-Control": "private, no-store"})

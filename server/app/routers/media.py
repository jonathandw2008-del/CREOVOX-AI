from __future__ import annotations

import logging
import mimetypes
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.config import settings
from app.db import get_db
from app.models import MediaAsset, Project, User, new_id
from app.routers.projects import asset_referenced, delete_asset
from app.services import storage
from app.services.projects import get_owned_project, log_activity, project_out, save_doc

log = logging.getLogger("creovox.media")
router = APIRouter(prefix="/api/projects", tags=["media"])

VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".ogv", ".mpeg", ".mpg", ".3gp"}
CACHE = {"Cache-Control": "private, max-age=3600"}


def _err(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def _ext(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return ext if ext in VIDEO_EXTS else ".mp4"


def _float(v: str | None) -> float:
    try:
        return max(0.0, float(v)) if v else 0.0
    except ValueError:
        return 0.0


def _source_asset(db: Session, row: Project) -> MediaAsset:
    asset_id = ((row.doc or {}).get("videoFile") or {}).get("assetId")
    asset = db.get(MediaAsset, asset_id) if asset_id else None
    if asset is None or asset.user_id != row.user_id:
        raise _err(404, "no_video", "This project has no uploaded video.")
    return asset


def _finish_upload(db: Session, user: User, project_id: str, asset_id: str, src: Path, filename: str, mime: str, size: int, hdr: dict) -> dict:
    """Probe the uploaded file, capture a poster and attach it to the project (runs in a thread)."""
    from app.services import ffmpeg as ff

    adir = src.parent
    meta: dict = {"filename": filename, "proxy": None, "poster": None}
    if ff.available():
        try:
            info = ff.probe(src)
        except Exception as e:  # FFmpegError or anything unexpected while probing
            storage.remove_tree(adir)
            raise _err(400, "invalid_video", "This file doesn't look like a playable video.") from e
        if not getattr(info, "width", 0) and not getattr(info, "vcodec", None):
            storage.remove_tree(adir)
            raise _err(400, "invalid_video", "This file has no video track.")
        meta.update(
            duration=float(info.duration or 0) or hdr["duration"],
            width=int(info.width or 0) or int(hdr["width"]),
            height=int(info.height or 0) or int(hdr["height"]),
            vcodec=info.vcodec,
            acodec=info.acodec,
            playable=bool(ff.is_browser_playable(info, filename)),
        )
        try:
            poster = adir / "poster.jpg"
            ff.extract_frame(src, min(meta["duration"] * 0.1, 5.0), poster, width=480)
            if poster.exists():
                meta["poster"] = storage.rel_path(poster)
        except Exception:
            log.warning("Poster capture failed for %s", src, exc_info=True)
    else:
        meta.update(duration=hdr["duration"], width=int(hdr["width"]), height=int(hdr["height"]), vcodec=None, acodec=None, playable=True)

    row = get_owned_project(db, user, project_id, for_update=True)
    asset = MediaAsset(id=asset_id, user_id=user.id, kind="source", path=storage.rel_path(src), mime=mime, size=size, meta=meta)
    db.add(asset)

    doc = dict(row.doc or {})
    old_asset_id = (doc.get("videoFile") or {}).get("assetId")
    doc["videoFile"] = {
        "name": filename,
        "size": size,
        "type": mime,
        "duration": meta["duration"],
        "width": meta["width"],
        "height": meta["height"],
        "storageKey": asset_id,
        "assetId": asset_id,
        "persisted": True,
    }
    doc["duration"] = meta["duration"]
    doc["thumbnail"] = f"/api/projects/{project_id}/poster" if meta["poster"] else doc.get("thumbnail")
    steps = [s for s in doc.get("completedSteps", []) if not (old_asset_id and s == "process")]
    if "upload" not in steps:
        steps.insert(0, "upload")
    doc["completedSteps"] = steps
    save_doc(db, row, doc, status="processing", commit=False)
    db.flush()

    if old_asset_id and old_asset_id != asset_id and not asset_referenced(db, user.id, old_asset_id):
        old = db.get(MediaAsset, old_asset_id)
        if old is not None and old.user_id == user.id:
            delete_asset(db, old)
    log_activity(db, user.id, f"Video added to '{row.title}'", "create", row.id, commit=False)
    db.commit()
    return project_out(row)


@router.put("/{project_id}/video")
async def upload_video(project_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    await run_in_threadpool(get_owned_project, db, user, project_id)

    limit = settings.max_upload_bytes
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > limit:
        raise _err(413, "too_large", f"Videos can be at most {limit // (1024 * 1024)} MB.")

    filename = unquote(request.headers.get("x-file-name") or "video.mp4").replace("/", "_").replace("\\", "_")[:200] or "video.mp4"
    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    mime = ctype if ctype.startswith("video/") else (mimetypes.guess_type(filename)[0] or "video/mp4")

    asset_id = new_id()
    adir = storage.asset_dir(user.id, asset_id)
    src = adir / f"source{_ext(filename)}"
    tmp = adir / "upload.part"
    size = 0
    try:
        with tmp.open("wb") as f:
            async for chunk in request.stream():
                if not chunk:
                    continue
                size += len(chunk)
                if size > limit:
                    raise _err(413, "too_large", f"Videos can be at most {limit // (1024 * 1024)} MB.")
                f.write(chunk)
        if size == 0:
            raise _err(400, "empty_upload", "The uploaded file is empty.")
        tmp.replace(src)
    except BaseException:
        storage.remove_tree(adir)
        raise

    hdr = {
        "duration": _float(request.headers.get("x-video-duration")),
        "width": _float(request.headers.get("x-video-width")),
        "height": _float(request.headers.get("x-video-height")),
    }
    try:
        return await run_in_threadpool(_finish_upload, db, user, project_id, asset_id, src, filename, mime, size, hdr)
    except HTTPException:
        storage.remove_tree(adir)
        raise
    except Exception:
        storage.remove_tree(adir)
        log.exception("Upload processing failed")
        raise _err(500, "upload_failed", "Something went wrong while saving the video.")


@router.get("/{project_id}/video")
def stream_video(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_owned_project(db, user, project_id)
    asset = _source_asset(db, row)
    meta = asset.meta or {}
    proxy = meta.get("proxy")
    if proxy:
        try:
            p = storage.abs_path(proxy)
            if p.exists():
                return FileResponse(p, media_type="video/mp4", headers=CACHE)
        except ValueError:
            pass
    path = storage.abs_path(asset.path)
    if not path.exists():
        raise _err(404, "no_video", "The video file is missing on the server.")
    return FileResponse(path, media_type=asset.mime or "video/mp4", headers=CACHE)


@router.get("/{project_id}/poster")
def poster(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_owned_project(db, user, project_id)
    asset = _source_asset(db, row)
    rel = (asset.meta or {}).get("poster")
    if not rel:
        raise _err(404, "not_found", "No poster for this video.")
    p = storage.abs_path(rel)
    if not p.exists():
        raise _err(404, "not_found", "No poster for this video.")
    return FileResponse(p, media_type="image/jpeg", headers=CACHE)


@router.get("/{project_id}/media/{name}")
def media_file(project_id: str, name: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_owned_project(db, user, project_id)
    if not storage.safe_name(name):
        raise _err(404, "not_found", "File not found.")
    base = storage.frames_dir(user.id, row.id)
    p = (base / name).resolve()
    if p.parent != base.resolve() or not p.is_file():
        raise _err(404, "not_found", "File not found.")
    media_type = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
    return FileResponse(p, media_type=media_type, headers=CACHE)

"""DB-backed job queue shared by the API (enqueue/read) and the worker (claim/update)."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import Job, utcnow

ACTIVE = ("queued", "running")
HEAVY_TYPES = ("analyze", "thumbnails", "render", "package")
LIGHT_TYPES = ("translate",)
ALL_TYPES = HEAVY_TYPES + LIGHT_TYPES


def enqueue(db: Session, *, user_id: str, project_id: str | None, type: str, params: dict | None = None, dedupe: bool = False) -> Job:
    """Create a queued job. With dedupe=True an existing active job of the same type/project is returned instead."""
    assert type in ALL_TYPES, type
    if dedupe and project_id:
        existing = db.scalar(
            select(Job).where(Job.project_id == project_id, Job.type == type, Job.status.in_(ACTIVE)).order_by(Job.created_at.desc())
        )
        if existing:
            return existing
    job = Job(user_id=user_id, project_id=project_id, type=type, params=params or {}, status="queued", stage="queued")
    db.add(job)
    db.commit()
    return job


def job_out(job: Job) -> dict:
    """Public JSON shape of a job (what GET /api/jobs/{id} returns)."""
    return {
        "id": job.id,
        "type": job.type,
        "projectId": job.project_id,
        "status": job.status,
        "stage": job.stage,
        "progress": round(job.progress or 0.0, 4),
        "error": job.error,
        # Keys starting with "_" are internal (e.g. storage paths) and never leave the server.
        "result": {k: v for k, v in job.result.items() if not k.startswith("_")} if isinstance(job.result, dict) else job.result,
        "createdAt": job.created_at.isoformat() if job.created_at else None,
        "startedAt": job.started_at.isoformat() if job.started_at else None,
        "finishedAt": job.finished_at.isoformat() if job.finished_at else None,
    }


def claim_next(db: Session, types: tuple[str, ...]) -> Job | None:
    """Atomically move the oldest queued job of the given types to 'running' (FOR UPDATE SKIP LOCKED on Postgres)."""
    job = db.scalar(
        select(Job)
        .where(Job.status == "queued", Job.type.in_(types))
        .order_by(Job.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if job is None:
        db.rollback()
        return None
    now = utcnow()
    job.status = "running"
    job.started_at = now
    job.heartbeat_at = now
    job.attempts = (job.attempts or 0) + 1
    db.commit()
    return job


def requeue_stale(db: Session, *, stale_after: timedelta = timedelta(minutes=3), max_attempts: int = 3) -> int:
    """Recover jobs whose worker died (no heartbeat). Returns how many were touched."""
    cutoff = utcnow() - stale_after
    stale = db.scalars(select(Job).where(Job.status == "running", Job.heartbeat_at < cutoff)).all()
    for job in stale:
        if job.attempts >= max_attempts:
            job.status, job.error, job.finished_at = "failed", "The worker stopped while processing this job.", utcnow()
        else:
            job.status, job.stage = "queued", "queued"
    db.commit()
    return len(stale)


def request_cancel(db: Session, job: Job) -> None:
    if job.status == "queued":
        job.status, job.finished_at, job.stage = "canceled", utcnow(), "canceled"
    elif job.status == "running":
        job.cancel_requested = True
    db.commit()


def mark(db: Session, job_id: str, **values) -> None:
    db.execute(update(Job).where(Job.id == job_id).values(**values))
    db.commit()

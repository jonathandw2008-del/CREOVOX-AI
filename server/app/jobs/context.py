"""Per-job runtime helpers: throttled progress writes, heartbeats and cooperative cancellation."""
from __future__ import annotations

import threading
import time
from collections.abc import Callable

from app.db import SessionLocal
from app.jobs.queue import mark
from app.models import Job, utcnow


class JobCanceled(Exception):
    """Raised inside a handler when the user asked to cancel the job."""


class JobError(Exception):
    """A user-facing job failure (the message is shown in the UI)."""


HEARTBEAT_SECONDS = 15
PROGRESS_MIN_INTERVAL = 0.5


class JobContext:
    def __init__(self, job: Job):
        self.job_id = job.id
        self.user_id = job.user_id
        self.project_id = job.project_id
        self.type = job.type
        self.params: dict = dict(job.params or {})
        self._canceled = threading.Event()
        self._stop = threading.Event()
        self._last_write = 0.0
        self._progress = 0.0
        self._stage = job.stage or ""
        self._hb = threading.Thread(target=self._heartbeat, name=f"hb-{job.id[:8]}", daemon=True)

    # ------------------------------------------------------------ lifecycle
    def __enter__(self) -> JobContext:
        self._hb.start()
        return self

    def __exit__(self, *exc) -> None:
        self._stop.set()
        self._hb.join(timeout=2)

    def _heartbeat(self) -> None:
        while not self._stop.wait(HEARTBEAT_SECONDS):
            self._beat()

    def _beat(self) -> None:
        try:
            with SessionLocal() as db:
                job = db.get(Job, self.job_id)
                if job is None or job.cancel_requested or job.status == "canceled":
                    self._canceled.set()
                    return
                job.heartbeat_at = utcnow()
                db.commit()
        except Exception:  # a missed heartbeat is not fatal
            pass

    # ------------------------------------------------------------ progress
    def stage(self, name: str, progress: float | None = None) -> None:
        self._stage = name
        if progress is not None:
            self._progress = max(self._progress, min(1.0, progress))
        self._write(force=True)
        self.cancel()

    def progress(self, fraction: float) -> None:
        self._progress = max(self._progress, min(0.999, float(fraction)))
        self._write()

    def sub(self, a: float, b: float) -> Callable[[float], None]:
        """A 0–1 progress callback mapped onto the [a, b] slice of the job's progress."""
        return lambda f: self.progress(a + (b - a) * max(0.0, min(1.0, f)))

    def _write(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self._last_write < PROGRESS_MIN_INTERVAL:
            return
        self._last_write = now
        try:
            with SessionLocal() as db:
                mark(db, self.job_id, progress=round(self._progress, 4), stage=self._stage, heartbeat_at=utcnow())
        except Exception:
            pass

    # ------------------------------------------------------------ cancel
    def cancel(self) -> None:
        """Raise JobCanceled if cancellation was requested. Cheap: checks the DB at most every ~2 s."""
        if not self._canceled.is_set() and time.monotonic() - getattr(self, "_last_cancel_check", 0.0) > 2.0:
            self._last_cancel_check = time.monotonic()
            try:
                with SessionLocal() as db:
                    job = db.get(Job, self.job_id)
                    if job is None or job.cancel_requested or job.status == "canceled":
                        self._canceled.set()
            except Exception:
                pass
        if self._canceled.is_set():
            raise JobCanceled()

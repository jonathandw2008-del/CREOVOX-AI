"""Background job worker. Run: uv run python -m app.worker

One thread handles heavy media jobs (analyze, thumbnails, render, package) one at a time;
another handles light AI jobs (translate) so subtitle translation isn't stuck behind a long render.
Several worker processes can run against the same Postgres database (claims use SKIP LOCKED).
"""
from __future__ import annotations

import logging
import signal
import threading
import time

from app.db import SessionLocal
from app.jobs.context import JobCanceled, JobContext, JobError
from app.jobs.handlers import HANDLERS
from app.jobs.queue import HEAVY_TYPES, LIGHT_TYPES, claim_next, mark, requeue_stale
from app.models import Job, utcnow
from app.services.ai import AIError, AIUnavailable
from app.services.ffmpeg import FFmpegError
from app.services.transcribe import TranscriptionError

log = logging.getLogger("creovox.worker")

USER_FACING = (JobError, FFmpegError, TranscriptionError, AIError, AIUnavailable)
POLL_SECONDS = 1.0
STALE_CHECK_SECONDS = 30.0


def run_job(job: Job) -> None:
    """Run one claimed job to completion and record its outcome."""
    handler = HANDLERS.get(job.type)
    started = time.monotonic()
    log.info("job %s (%s) started", job.id, job.type)
    try:
        if handler is None:
            raise JobError(f"Unknown job type: {job.type}")
        with JobContext(job) as ctx:
            result = handler(ctx)
        values = {"status": "succeeded", "stage": "done", "progress": 1.0, "result": result, "error": None}
        log.info("job %s (%s) succeeded in %.1fs", job.id, job.type, time.monotonic() - started)
    except JobCanceled:
        values = {"status": "canceled", "stage": "canceled"}
        log.info("job %s (%s) canceled", job.id, job.type)
    except USER_FACING as e:
        values = {"status": "failed", "error": str(e) or "Processing failed."}
        log.warning("job %s (%s) failed: %s", job.id, job.type, e)
    except Exception:
        log.exception("job %s (%s) crashed", job.id, job.type)
        values = {"status": "failed", "error": "Something went wrong while processing. Please try again."}
    with SessionLocal() as db:
        mark(db, job.id, finished_at=utcnow(), heartbeat_at=utcnow(), **values)


def run_once(types: tuple[str, ...]) -> bool:
    """Claim and run a single job of the given types. Returns False when the queue was empty."""
    with SessionLocal() as db:
        job = claim_next(db, types)
    if job is None:
        return False
    run_job(job)
    return True


def _loop(types: tuple[str, ...], stop: threading.Event, *, recover: bool) -> None:
    last_stale = 0.0
    while not stop.is_set():
        try:
            if recover and time.monotonic() - last_stale > STALE_CHECK_SECONDS:
                last_stale = time.monotonic()
                with SessionLocal() as db:
                    n = requeue_stale(db)
                if n:
                    log.warning("recovered %d stale job(s)", n)
            if not run_once(types):
                stop.wait(POLL_SECONDS)
        except Exception:
            log.exception("worker loop error")
            stop.wait(5)


def start_threads(stop: threading.Event) -> list[threading.Thread]:
    threads = [
        threading.Thread(target=_loop, args=(HEAVY_TYPES, stop), kwargs={"recover": True}, name="worker-heavy", daemon=True),
        threading.Thread(target=_loop, args=(LIGHT_TYPES, stop), kwargs={"recover": False}, name="worker-light", daemon=True),
    ]
    for t in threads:
        t.start()
    return threads


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    from app.config import settings
    from app.services import ffmpeg as ff
    from app.services.ai import provider_name

    log.info(
        "CREOVOX worker starting (ffmpeg: %s, AI: %s, transcription: %s)",
        "yes" if ff.available() else "MISSING",
        provider_name() or "off (heuristics)",
        settings.active_transcriber,
    )
    stop = threading.Event()

    def _shutdown(*_):
        log.info("shutting down after current jobs…")
        stop.set()

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)
    threads = start_threads(stop)
    while any(t.is_alive() for t in threads):
        for t in threads:
            t.join(timeout=0.5)


if __name__ == "__main__":
    main()

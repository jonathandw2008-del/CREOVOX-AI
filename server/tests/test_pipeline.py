"""Upload → analyze → thumbnails → render → package, through the real worker and ffmpeg (transcription is stubbed)."""
from __future__ import annotations

import io
import json
import shutil
import subprocess
import zipfile
from pathlib import Path

import pytest

from app import worker
from app.jobs import handlers
from app.services.transcribe import TranscriptionResult

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")

PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000301010018dd8db40000000049454e44ae426082"
)


@pytest.fixture(scope="module")
def sample_video(tmp_path_factory) -> Path:
    out = tmp_path_factory.mktemp("media") / "sample.mp4"
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=20",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=20",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(out),
        ],  # fmt: skip
        check=True,
    )
    return out


def fake_transcribe(path, *, duration, language=None, progress=lambda f: None, cancel=lambda: None, prompt=None):
    lines = [
        "Welcome to the show.",
        "Today we talk about making great short videos!",
        "The first tip is to start with a strong hook.",
        "The second tip is to keep every clip under a minute.",
        "That's all for today, thanks for watching.",
    ]
    segs, words = [], []
    for i, text in enumerate(lines):
        a, b = i * 4.0, i * 4.0 + 3.8
        segs.append({"id": f"t{i + 1}", "startTime": a, "endTime": b, "text": text, "speaker": "Speaker 1"})
        toks = text.split()
        step = (b - a) / len(toks)
        words += [(a + j * step, a + (j + 1) * step, " " + t) for j, t in enumerate(toks)]
    progress(1.0)
    return TranscriptionResult(segments=segs, words=words, language="en", engine="test")


@pytest.fixture
def project(auth_client, sample_video, monkeypatch):
    monkeypatch.setattr(handlers, "transcribe", fake_transcribe)
    p = auth_client.post("/api/projects", json={"project": {"title": "Pipeline Test"}}).json()
    r = auth_client.put(
        f"/api/projects/{p['id']}/video",
        content=sample_video.read_bytes(),
        headers={"Content-Type": "video/mp4", "X-File-Name": "sample.mp4"},
    )
    assert r.status_code == 200, r.text
    up = r.json()
    assert up["videoFile"]["assetId"]
    assert abs(up["duration"] - 20) < 0.5
    assert up["thumbnail"].endswith("/poster")
    return up


def _run(client, job: dict) -> dict:
    assert worker.run_once((job["type"],)), "no job was claimed"
    done = client.get(f"/api/jobs/{job['id']}").json()
    assert done["status"] == "succeeded", done
    return done


def _analyze(client, pid):
    job = client.post(f"/api/projects/{pid}/analyze", json={}).json()
    assert job["status"] == "queued"
    return _run(client, job)


def test_poster_and_stream(auth_client, project):
    pid = project["id"]
    assert auth_client.get(f"/api/projects/{pid}/poster").headers["content-type"] == "image/jpeg"
    r = auth_client.get(f"/api/projects/{pid}/video", headers={"Range": "bytes=0-99"})
    assert r.status_code == 206
    assert len(r.content) == 100


def test_analyze_builds_workspace(auth_client, project):
    pid = project["id"]
    done = _analyze(auth_client, pid)
    assert done["result"]["segments"] == 5
    assert done["result"]["highlightSource"] == "heuristic"

    p = auth_client.get(f"/api/projects/{pid}").json()
    assert p["status"] == "ready"
    assert "process" in p["completedSteps"]
    assert p["waveformIsReal"] is True and len(p["waveform"]) == 240
    assert len(p["transcript"]) == 5
    assert p["highlights"], "expected at least one highlight"
    assert any(h["selected"] for h in p["highlights"])
    for h in p["highlights"]:
        assert 0 <= h["startTime"] < h["endTime"] <= 20
    en = next(t for t in p["subtitles"] if t["languageCode"] == "en")
    assert en["segments"] and en["language"] == "English"
    assert p["aiSource"] == {"transcript": "test", "highlights": "heuristic"}


def test_analyze_dedupes_active_job(auth_client, project):
    a = auth_client.post(f"/api/projects/{project['id']}/analyze", json={}).json()
    b = auth_client.post(f"/api/projects/{project['id']}/analyze", json={}).json()
    assert a["id"] == b["id"]


def test_cancel_queued_job(auth_client, project):
    job = auth_client.post(f"/api/projects/{project['id']}/analyze", json={}).json()
    c = auth_client.post(f"/api/jobs/{job['id']}/cancel").json()
    assert c["status"] == "canceled"
    assert worker.run_once(("analyze",)) is False


def test_thumbnails_without_ai(auth_client, project):
    pid = project["id"]
    _analyze(auth_client, pid)
    job = auth_client.post(f"/api/projects/{pid}/thumbnails/suggest").json()
    done = _run(auth_client, job)
    designs = done["result"]["designs"]
    assert done["result"]["ai"] is False
    assert 1 <= len(designs) <= 4
    img = auth_client.get(designs[0]["backgroundImage"].removeprefix(""))
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"


def _with_clips(client, pid):
    p = client.get(f"/api/projects/{pid}").json()
    p["clips"] = [
        {"id": "c1", "startTime": 1, "endTime": 4, "title": "Hook", "aspectRatio": "9:16"},
        {"id": "c2", "startTime": 5, "endTime": 8, "title": "Tip", "aspectRatio": "1:1"},
    ]
    r = client.put(f"/api/projects/{pid}", json={"project": p, "version": p["version"]})
    assert r.status_code == 200, r.text
    return r.json()


def _probe(data: bytes, tmp_path: Path) -> dict:
    f = tmp_path / "out.bin"
    f.write_bytes(data)
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(f)], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_render_with_burned_subtitles(auth_client, project, tmp_path):
    pid = project["id"]
    _analyze(auth_client, pid)
    _with_clips(auth_client, pid)
    job = auth_client.post(
        f"/api/projects/{pid}/render",
        json={"clipIds": ["c1", "c2"], "resolution": "480p", "format": "mp4", "burnInSubtitles": True, "subtitleLanguage": "en"},
    ).json()
    done = _run(auth_client, job)
    files = done["result"]["files"]
    assert [f["clipId"] for f in files] == ["c1", "c2"]
    assert "_files" not in done["result"]

    r = auth_client.get(f"/api/jobs/{job['id']}/files/0")
    assert r.status_code == 200 and r.headers["content-type"] == "video/mp4"
    info = _probe(r.content, tmp_path)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (v["width"], v["height"]) == (480, 854)
    assert any(s["codec_type"] == "audio" for s in info["streams"])
    assert abs(float(info["format"]["duration"]) - 3.0) < 0.3
    assert auth_client.get(f"/api/jobs/{job['id']}/files/5").status_code == 404


def test_render_rejects_unknown_clip(auth_client, project):
    r = auth_client.post(f"/api/projects/{project['id']}/render", json={"clipIds": ["nope"]})
    assert r.status_code == 400


def test_package_zip(auth_client, project):
    pid = project["id"]
    _analyze(auth_client, pid)
    _with_clips(auth_client, pid)
    opts = {"includeClips": True, "includeSubtitles": True, "includeThumbnail": True, "includeContent": True, "clipIds": ["c1"], "resolution": "480p", "format": "mp4"}
    r = auth_client.post(
        f"/api/projects/{pid}/package",
        data={"options": json.dumps(opts)},
        files=[("thumbnails", ("pipeline-test-bold.png", PNG_1PX, "image/png"))],
    )
    assert r.status_code == 200, r.text
    done = _run(auth_client, r.json())
    assert done["result"]["file"]["name"] == "pipeline-test.zip"

    z = auth_client.get(f"/api/jobs/{r.json()['id']}/files/0")
    assert z.headers["content-type"] == "application/zip"
    names = set(zipfile.ZipFile(io.BytesIO(z.content)).namelist())
    base = "pipeline-test/"
    assert base + "project.json" in names
    assert base + "README.txt" in names
    assert base + "subtitles/pipeline-test-en.srt" in names
    assert base + "subtitles/pipeline-test-en.vtt" in names
    assert base + "thumbnails/pipeline-test-bold.png" in names
    assert base + "pipeline-test-content.md" in names
    assert any(n.startswith(base + "clips/") and n.endswith(".mp4") for n in names)

    p = auth_client.get(f"/api/projects/{pid}").json()
    assert p["status"] == "completed"
    assert "export" in p["completedSteps"] and p["exportedAt"]


def test_package_rejects_non_png(auth_client, project):
    r = auth_client.post(
        f"/api/projects/{project['id']}/package",
        data={"options": json.dumps({"includeClips": False})},
        files=[("thumbnails", ("x.png", b"not a png", "image/png"))],
    )
    assert r.status_code == 400


def test_failed_job_reports_error(auth_client, project, monkeypatch):
    def boom(*a, **k):
        from app.services.transcribe import TranscriptionError

        raise TranscriptionError("Speech recognition is unavailable right now.")

    monkeypatch.setattr(handlers, "transcribe", boom)
    job = auth_client.post(f"/api/projects/{project['id']}/analyze", json={}).json()
    assert worker.run_once(("analyze",))
    done = auth_client.get(f"/api/jobs/{job['id']}").json()
    assert done["status"] == "failed"
    assert done["error"] == "Speech recognition is unavailable right now."


def test_strict_schema_keeps_fields_named_title():
    """Regression: annotation stripping must not delete real properties called `title`."""
    from app.services.ai import strict_schema
    from app.services.ai_tasks import _HighlightsOut

    item = strict_schema(_HighlightsOut)["properties"]["highlights"]["items"]
    assert "title" in item["properties"]
    assert "title" in item["required"]
    assert "title" not in strict_schema(_HighlightsOut)  # top-level annotation still dropped


def test_thumbnails_with_ai_sends_at_most_three_frames(auth_client, project, monkeypatch):
    from app.services import ai_tasks

    seen = {}

    def fake_suggest(*, title, transcript, highlights, frames, count=4):
        seen["n"] = len(frames)
        return [{"frameIndex": 2, "title": "AI pick", "textOverlay": "Hook them fast", "style": "bold", "textColor": "#FFFFFF", "textPosition": {"x": 50, "y": 50}, "fontFamily": "Inter", "fontSize": 48, "backgroundColor": "#000000", "overlay": 0.4}]

    monkeypatch.setattr(handlers, "ai_enabled", lambda: True)
    monkeypatch.setattr(handlers, "provider_name", lambda: "groq")
    monkeypatch.setattr(ai_tasks, "suggest_thumbnails", fake_suggest)
    pid = project["id"]
    _analyze(auth_client, pid)
    done = _run(auth_client, auth_client.post(f"/api/projects/{pid}/thumbnails/suggest").json())
    assert seen["n"] <= 3
    assert done["result"]["ai"] is True
    d = done["result"]["designs"][0]
    assert d["textOverlay"] == "Hook them fast"
    assert auth_client.get(d["backgroundImage"]).status_code == 200
    # The job must not bump the project version (the browser saves the designs itself).
    before = auth_client.get(f"/api/projects/{pid}").json()["version"]
    _run(auth_client, auth_client.post(f"/api/projects/{pid}/thumbnails/suggest").json())
    assert auth_client.get(f"/api/projects/{pid}").json()["version"] == before


def test_spread_frames_limits_reuse():
    designs = [{"frameIndex": 4} for _ in range(4)]
    handlers._spread_frames(designs, [0, 2, 4])
    counts = {}
    for d in designs:
        counts[d["frameIndex"]] = counts.get(d["frameIndex"], 0) + 1
    assert max(counts.values()) <= 2
    assert len(counts) >= 2


def test_old_outputs_are_pruned(auth_client, project, db):
    from datetime import timedelta

    from app.jobs.queue import prune_outputs
    from app.models import Job

    pid = project["id"]
    _analyze(auth_client, pid)
    _with_clips(auth_client, pid)
    job = auth_client.post(f"/api/projects/{pid}/render", json={"clipIds": ["c1"], "resolution": "480p"}).json()
    _run(auth_client, job)
    assert auth_client.get(f"/api/jobs/{job['id']}/files/0").status_code == 200

    assert prune_outputs(db) == 0  # fresh outputs are kept
    row = db.get(Job, job["id"])
    row.finished_at = row.finished_at - timedelta(hours=25)
    db.commit()
    assert prune_outputs(db) == 1
    r = auth_client.get(f"/api/jobs/{job['id']}/files/0")
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "expired"


def test_failed_rerun_restores_ready_status(auth_client, project, monkeypatch):
    pid = project["id"]
    _analyze(auth_client, pid)

    def boom(*a, **k):
        from app.services.transcribe import TranscriptionError

        raise TranscriptionError("down")

    monkeypatch.setattr(handlers, "transcribe", boom)
    auth_client.post(f"/api/projects/{pid}/analyze", json={})
    assert auth_client.get(f"/api/projects/{pid}").json()["status"] == "processing"
    worker.run_once(("analyze",))
    p = auth_client.get(f"/api/projects/{pid}").json()
    assert p["status"] == "ready"
    assert len(p["transcript"]) == 5  # earlier results untouched

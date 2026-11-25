"""Thin, safe wrappers around ffmpeg / ffprobe (arg lists only, never a shell)."""
from __future__ import annotations

import json
import logging
import math
import os
import shutil
import subprocess
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.config import settings

log = logging.getLogger("creovox.ffmpeg")

ProgressFn = Callable[[float], None]
CancelFn = Callable[[], None]


class FFmpegError(Exception):
    """A user-facing media processing error."""


def available() -> bool:
    return bool(shutil.which(settings.ffmpeg_bin)) and bool(shutil.which(settings.ffprobe_bin))


def _bin(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise FFmpegError("ffmpeg is not installed on the server (install it with `brew install ffmpeg` or `apt-get install ffmpeg`).")
    return path


def ffmpeg_bin() -> str:
    return _bin(settings.ffmpeg_bin)


def ffprobe_bin() -> str:
    return _bin(settings.ffprobe_bin)


# --------------------------------------------------------------------------- probe


@dataclass
class ProbeInfo:
    duration: float
    width: int
    height: int
    vcodec: str | None
    acodec: str | None
    format_name: str
    has_audio: bool
    pix_fmt: str | None = None  # additive: used to detect 10-bit/odd formats browsers can't play


def _rotation(stream: dict) -> int:
    try:
        rot = int(float(stream.get("tags", {}).get("rotate", 0)))
    except (TypeError, ValueError):
        rot = 0
    for sd in stream.get("side_data_list", []) or []:
        if "rotation" in sd:
            try:
                rot = int(float(sd["rotation"]))
            except (TypeError, ValueError):
                pass
    return rot % 360


def probe(path: Path) -> ProbeInfo:
    cmd = [ffprobe_bin(), "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired as e:
        raise FFmpegError("Reading the video file timed out.") from e
    if r.returncode != 0:
        raise FFmpegError("Could not read this video file. It may be corrupt or in an unsupported format.")
    try:
        data = json.loads(r.stdout or "{}")
    except json.JSONDecodeError as e:
        raise FFmpegError("Could not read this video file.") from e

    streams = data.get("streams", []) or []
    video = next(
        (s for s in streams if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")),
        None,
    )
    if video is None:
        raise FFmpegError("No video stream found in this file.")
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    fmt = data.get("format", {}) or {}
    duration = 0.0
    for raw in (fmt.get("duration"), video.get("duration"), (audio or {}).get("duration")):
        try:
            duration = float(raw)
            if math.isfinite(duration) and duration > 0:
                break
        except (TypeError, ValueError):
            continue
    else:
        duration = 0.0

    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    if _rotation(video) in (90, 270):
        width, height = height, width

    return ProbeInfo(
        duration=round(duration, 3),
        width=width,
        height=height,
        vcodec=(video.get("codec_name") or None),
        acodec=(audio.get("codec_name") if audio else None),
        format_name=str(fmt.get("format_name") or ""),
        has_audio=audio is not None,
        pix_fmt=video.get("pix_fmt"),
    )


_OK_PIX = {None, "yuv420p", "yuvj420p"}


def is_browser_playable(info: ProbeInfo, filename: str) -> bool:
    """True when mainstream browsers can play the file directly in a <video> element."""
    ext = Path(filename).suffix.lower()
    fmt = info.format_name
    if info.pix_fmt not in _OK_PIX and info.vcodec == "h264":
        return False
    if ext in (".mp4", ".m4v", ".mov") and ("mp4" in fmt or "mov" in fmt):
        return info.vcodec in {"h264", "av1", "vp9"} and info.acodec in {None, "aac", "mp3", "opus", "flac"}
    if ext == ".webm" and ("webm" in fmt or "matroska" in fmt):
        return info.vcodec in {"vp8", "vp9", "av1"} and info.acodec in {None, "opus", "vorbis"}
    return False


# --------------------------------------------------------------------------- running


def run_ffmpeg(
    args: list[str],
    *,
    duration: float | None = None,
    progress: ProgressFn | None = None,
    cancel: CancelFn | None = None,
    cwd: Path | None = None,
    timeout: float | None = None,
) -> None:
    """Run ffmpeg with `-progress pipe:1`, reporting 0–1 progress and honouring cancellation.

    `cancel()` should raise to abort; the process is killed and the exception re-raised.
    """
    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-progress", "pipe:1", "-nostats", *args]
    log.debug("ffmpeg %s", " ".join(cmd[1:]))
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=str(cwd) if cwd else None)
    err_tail: deque[str] = deque(maxlen=12)

    def _drain_stderr() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            if line.strip():
                err_tail.append(line.rstrip())

    t = threading.Thread(target=_drain_stderr, daemon=True)
    t.start()
    started = time.monotonic()
    last_cancel = 0.0
    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            key, _, value = line.strip().partition("=")
            if key in ("out_time_us", "out_time_ms") and duration and progress:
                try:
                    secs = int(value) / 1_000_000  # both keys are microseconds in practice
                    progress(max(0.0, min(1.0, secs / duration)))
                except ValueError:
                    pass
            now = time.monotonic()
            if cancel and now - last_cancel > 1.0:
                last_cancel = now
                cancel()
            if timeout and now - started > timeout:
                raise FFmpegError("Media processing timed out.")
        rc = proc.wait()
    except BaseException:
        proc.kill()
        proc.wait()
        raise
    finally:
        t.join(timeout=2)
    if rc != 0:
        detail = err_tail[-1] if err_tail else f"exit code {rc}"
        log.error("ffmpeg failed (%s): %s", rc, "\n".join(err_tail))
        raise FFmpegError(f"Video processing failed: {detail}")
    if progress:
        progress(1.0)


def _replace(tmp: Path, out: Path) -> Path:
    os.replace(tmp, out)
    return out


# --------------------------------------------------------------------------- frames


def extract_frame(src: Path, time: float, out: Path, width: int = 480) -> Path:
    """Grab one JPEG frame at `time` seconds, scaled to `width` (aspect kept)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    for t in (max(0.0, time), 0.0):
        cmd = [
            ffmpeg_bin(), "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
            "-ss", f"{t:.3f}", "-i", str(src),
            "-frames:v", "1", "-vf", f"scale={int(width)}:-2", "-q:v", "3", str(out),
        ]  # fmt: skip
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and out.exists() and out.stat().st_size > 0:
            return out
    raise FFmpegError("Could not capture a frame from this video.")


# --------------------------------------------------------------------------- audio


def waveform_peaks(
    src: Path,
    *,
    duration: float,
    buckets: int = 240,
    progress: ProgressFn | None = None,
    cancel: CancelFn | None = None,
) -> list[float] | None:
    """Normalised 0–1 RMS peaks of the audio track, or None if there is no (audible) audio."""
    if duration <= 0:
        return None
    rate = 8000
    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin", "-loglevel", "error", "-i", str(src), "-vn", "-ac", "1", "-ar", str(rate), "-f", "s16le", "pipe:1"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    total = max(1, int(duration * rate))
    per_bucket = max(1, math.ceil(total / buckets))
    sums = np.zeros(buckets, dtype=np.float64)
    counts = np.zeros(buckets, dtype=np.float64)
    offset = 0
    last_cancel = 0.0
    try:
        assert proc.stdout is not None
        chunk_bytes = rate * 2 * 20  # 20 s of audio
        leftover = b""
        while True:
            data = proc.stdout.read(chunk_bytes)
            if not data:
                break
            data = leftover + data
            usable = len(data) - (len(data) % 2)
            leftover = data[usable:]
            x = np.frombuffer(data[:usable], dtype="<i2").astype(np.float64) / 32768.0
            idx = np.minimum((np.arange(offset, offset + x.size) // per_bucket), buckets - 1)
            sums += np.bincount(idx, weights=x * x, minlength=buckets)
            counts += np.bincount(idx, minlength=buckets)
            offset += x.size
            if progress:
                progress(min(1.0, offset / total))
            now = time.monotonic()
            if cancel and now - last_cancel > 1.0:
                last_cancel = now
                cancel()
        proc.wait()
    except BaseException:
        proc.kill()
        proc.wait()
        raise
    if offset == 0:
        return None
    rms = np.sqrt(sums / np.maximum(counts, 1))
    peak = float(rms.max())
    if peak < 1e-4:
        return None  # silent track
    return [math.floor(v / peak * 100 + 0.5) / 100 for v in rms.tolist()]


def extract_audio(src: Path, out: Path, *, bitrate: str = "32k", cancel: CancelFn | None = None, duration: float | None = None, progress: ProgressFn | None = None) -> Path:
    """Mono 16 kHz Opus/OGG: small enough to upload for transcription (~0.24 MB/min at 32 kbps)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.stem + ".part.ogg")
    run_ffmpeg(
        ["-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", bitrate, "-application", "voip", str(tmp)],
        duration=duration,
        progress=progress,
        cancel=cancel,
    )
    return _replace(tmp, out)


def split_audio(src_audio: Path, out_dir: Path, *, chunk_seconds: int = 1200) -> list[tuple[float, Path]]:
    """Split an audio file into ~chunk_seconds pieces. Returns (offset_seconds, path) pairs."""
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "chunk_%03d.ogg"
    run_ffmpeg(["-i", str(src_audio), "-f", "segment", "-segment_time", str(chunk_seconds), "-c", "copy", "-reset_timestamps", "1", str(pattern)])
    chunks = sorted(out_dir.glob("chunk_*.ogg"))
    result: list[tuple[float, Path]] = []
    offset = 0.0
    for c in chunks:
        result.append((offset, c))
        try:
            r = subprocess.run(
                [ffprobe_bin(), "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(c)],
                capture_output=True, text=True, timeout=60,
            )  # fmt: skip
            offset += float(r.stdout.strip() or chunk_seconds)
        except (ValueError, subprocess.TimeoutExpired):
            offset += chunk_seconds
    return result


# --------------------------------------------------------------------------- video


def make_proxy(src: Path, out: Path, *, duration: float, progress: ProgressFn | None = None, cancel: CancelFn | None = None) -> Path:
    """Browser-friendly H.264/AAC MP4 (≤720p) for sources the editor can't play directly."""
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.stem + ".part.mp4")
    run_ffmpeg(
        [
            "-i", str(src), "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", "scale=-2:'min(720,ih)',format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2",
            "-movflags", "+faststart", str(tmp),
        ],  # fmt: skip
        duration=duration,
        progress=progress,
        cancel=cancel,
    )
    return _replace(tmp, out)


RES_HEIGHT = {"1080p": 1080, "720p": 720, "480p": 480}


def _js_round(x: float) -> int:
    return math.floor(x + 0.5)


def output_size(ratio: str, resolution: str) -> tuple[int, int]:
    """Port of outputSize() in src/lib/media.ts (even dimensions)."""
    short = RES_HEIGHT.get(resolution, 720)
    if ratio == "16:9":
        return _js_round(short * 16 / 9 / 2) * 2, short
    if ratio == "9:16":
        return short, _js_round(short * 16 / 9 / 2) * 2
    return short, short


def render_clip(
    src: Path,
    out: Path,
    *,
    start: float,
    end: float,
    width: int,
    height: int,
    fmt: str = "mp4",
    overlay_list: Path | None = None,
    has_audio: bool = True,
    progress: ProgressFn | None = None,
    cancel: CancelFn | None = None,
) -> Path:
    """Cut [start, end), cover-crop to width×height, optionally composite a subtitle overlay track.

    `overlay_list` is an ffconcat file of full-frame transparent PNGs (see services.burnin).
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    dur = max(0.1, end - start)
    ext = ".webm" if fmt == "webm" else ".mp4"
    tmp = out.with_name(out.stem + ".part" + ext)
    base = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1"

    args: list[str] = ["-ss", f"{max(0.0, start):.3f}", "-i", str(src)]
    if overlay_list is not None:
        args += ["-f", "concat", "-safe", "0", "-i", str(overlay_list)]
        graph = f"[0:v]{base}[base];[1:v]format=rgba[subs];[base][subs]overlay=0:0:format=auto:eof_action=repeat,format=yuv420p[v]"
    else:
        graph = f"[0:v]{base},format=yuv420p[v]"
    args += ["-filter_complex", graph, "-map", "[v]"]
    if has_audio:
        args += ["-map", "0:a:0?"]
    args += ["-t", f"{dur:.3f}"]
    if fmt == "webm":
        args += ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "33", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1"]
        if has_audio:
            args += ["-c:a", "libopus", "-b:a", "128k"]
    else:
        args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"]
        if has_audio:
            args += ["-c:a", "aac", "-b:a", "160k", "-ac", "2"]
        args += ["-movflags", "+faststart"]
    args.append(str(tmp))
    run_ffmpeg(args, duration=dur, progress=progress, cancel=cancel, cwd=overlay_list.parent if overlay_list else None)
    return _replace(tmp, out)

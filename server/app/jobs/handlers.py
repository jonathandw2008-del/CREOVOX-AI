"""Job handlers run by the worker. Each takes a JobContext and returns the job's result dict.

Result keys starting with "_" stay on the server (e.g. `_files`: storage paths served by /api/jobs/{id}/files/{i}).
"""
from __future__ import annotations

import json
import logging
import re
import zipfile
from collections.abc import Callable
from pathlib import Path

from app.db import SessionLocal
from app.jobs.context import JobContext, JobError
from app.models import MediaAsset, Project, utcnow
from app.services import ffmpeg as ff
from app.services import heuristics, storage
from app.services import ai_tasks
from app.services.ai import AIError, AIUnavailable, ai_enabled, provider_name
from app.services.burnin import build_overlay_track
from app.services.languages import language_name
from app.services.projects import get_owned_project, log_activity, save_doc
from app.services.subtitles import build_cues, build_srt, build_vtt, cues_from_segments
from app.services.transcribe import transcribe

log = logging.getLogger("creovox.worker")


# --------------------------------------------------------------------------- helpers


def slugify(text: str, fallback: str = "creovox") -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:60].strip("-")
    return s or fallback


def _load(ctx: JobContext) -> tuple[Project, MediaAsset | None]:
    with SessionLocal() as db:
        row = get_owned_project(db, ctx.user_id, ctx.project_id or "")
        asset_id = ((row.doc or {}).get("videoFile") or {}).get("assetId")
        asset = db.get(MediaAsset, asset_id) if asset_id else None
        if asset is not None and asset.user_id != ctx.user_id:
            asset = None
        return row, asset


def _source(ctx: JobContext) -> tuple[Project, MediaAsset, Path]:
    row, asset = _load(ctx)
    if asset is None:
        raise JobError("This project has no uploaded video.")
    src = storage.abs_path(asset.path)
    if not src.is_file():
        raise JobError("The video file is missing on the server. Upload it again.")
    return row, asset, src


def _update_doc(ctx: JobContext, fn: Callable[[dict], None], *, status: str | None = None, activity: str | None = None, kind: str = "process") -> None:
    """Apply `fn` to the latest project doc under a row lock (so concurrent edits from the browser are not lost)."""
    with SessionLocal() as db:
        row = get_owned_project(db, ctx.user_id, ctx.project_id or "", for_update=True)
        doc = json.loads(json.dumps(row.doc or {}))
        fn(doc)
        save_doc(db, row, doc, status=status, commit=False)
        if activity:
            log_activity(db, ctx.user_id, activity, kind, row.id, commit=False)
        db.commit()


def _add_step(doc: dict, step: str) -> None:
    steps = list(doc.get("completedSteps") or [])
    if step not in steps:
        steps.append(step)
    doc["completedSteps"] = steps


def _duration(row: Project, asset: MediaAsset) -> float:
    return float((asset.meta or {}).get("duration") or (row.doc or {}).get("duration") or 0)


def _has_audio(asset: MediaAsset) -> bool:
    meta = asset.meta or {}
    return "acodec" not in meta or meta.get("acodec") is not None


# --------------------------------------------------------------------------- analyze


def analyze(ctx: JobContext) -> dict:
    row, asset, src = _source(ctx)
    duration = _duration(row, asset)
    if duration <= 0:
        duration = ff.probe(src).duration
    work = storage.job_dir(ctx.user_id, ctx.project_id, ctx.job_id)
    meta = dict(asset.meta or {})

    try:
        # 1. waveform (+ a browser-playable proxy when the source can't play in <video>)
        ctx.stage("waveform", 0.0)
        if meta.get("playable") is False and not meta.get("proxy"):
            proxy = storage.abs_path(asset.path).parent / "proxy.mp4"
            ff.make_proxy(src, proxy, duration=duration, progress=ctx.sub(0.0, 0.12), cancel=ctx.cancel)
            with SessionLocal() as db:
                a = db.get(MediaAsset, asset.id)
                if a is not None:
                    a.meta = {**(a.meta or {}), "proxy": storage.rel_path(proxy)}
                    db.commit()
        waveform = ff.waveform_peaks(src, duration=duration, progress=ctx.sub(0.12, 0.2), cancel=ctx.cancel) if _has_audio(asset) else None

        # 2. transcript
        ctx.stage("transcribe", 0.2)
        segments: list[dict] = []
        words: list = []
        language = (ctx.params.get("language") or "en")
        engine = "none"
        if waveform is not None:
            audio = ff.extract_audio(src, work / "audio.ogg", duration=duration, progress=ctx.sub(0.2, 0.3), cancel=ctx.cancel)
            res = transcribe(
                audio, duration=duration, language=ctx.params.get("language"), progress=ctx.sub(0.3, 0.75), cancel=ctx.cancel,
                prompt=f"CREOVOX. {row.title}.",
            )  # fmt: skip
            segments, words, language, engine = res.segments, res.words, res.language, res.engine

        # 3. highlights
        ctx.stage("highlights", 0.75)
        energies = heuristics.segment_energies(segments, waveform, duration)
        target = heuristics.highlight_target(duration, len(segments))
        highlights: list[dict] = []
        hl_source = "heuristic"
        if segments and ai_enabled():
            try:
                highlights = ai_tasks.detect_highlights(title=row.title, duration=duration, transcript=segments, energies=energies, target=target)
                hl_source = provider_name() or "ai"
            except (AIError, AIUnavailable) as e:
                log.warning("AI highlight detection failed, using heuristic: %s", e)
        ctx.cancel()
        if segments and not highlights:
            highlights = heuristics.detect_highlights(segments, duration=duration, energies=energies, target=target)
            hl_source = "heuristic"

        # 4. workspace: subtitle track + save
        ctx.stage("workspace", 0.92)
        cues = build_cues(words) if words else cues_from_segments(segments)
        track = {"id": f"sub-{language}", "language": language_name(language), "languageCode": language, "segments": cues}

        def apply(doc: dict) -> None:
            doc["duration"] = duration
            doc["waveform"] = waveform if waveform is not None else doc.get("waveform")
            doc["waveformIsReal"] = waveform is not None
            doc["transcript"] = segments
            doc["transcriptLanguage"] = language
            doc["highlights"] = highlights
            others = [t for t in doc.get("subtitles") or [] if t.get("languageCode") != language]
            doc["subtitles"] = ([track] if cues else []) + others
            doc["aiSource"] = {**(doc.get("aiSource") or {}), "transcript": engine, "highlights": hl_source}
            _add_step(doc, "process")

        _update_doc(ctx, apply, status="ready", activity=f"Analysis finished for '{row.title}'")
        return {
            "segments": len(segments),
            "highlights": len(highlights),
            "cues": len(cues),
            "language": language,
            "engine": engine,
            "highlightSource": hl_source,
            "hasAudio": waveform is not None,
        }
    finally:
        storage.remove_tree(work)


# --------------------------------------------------------------------------- translate


def translate(ctx: JobContext) -> dict:
    p = ctx.params
    ctx.stage("translating", 0.02)
    segments = ai_tasks.translate_segments(
        segments=p["segments"],
        source_language=p.get("sourceLanguage") or "en",
        target_language=p["targetLanguage"],
        target_language_name=p.get("targetLanguageName") or language_name(p["targetLanguage"]),
        progress=ctx.sub(0.02, 1.0),
    )
    return {"segments": segments, "languageCode": p["targetLanguage"], "language": p.get("targetLanguageName") or language_name(p["targetLanguage"])}


# --------------------------------------------------------------------------- thumbnails

MAX_FRAMES = 5  # candidate frames extracted per suggestion run
AI_MAX_IMAGES = 3  # the Groq vision model accepts at most 3 images per request


def _spread_frames(designs: list[dict], frames: list[int]) -> None:
    """Keep at most two designs on one frame, so the ideas don't all share a background."""
    if len(frames) < 2:
        return
    used: dict[int, int] = {}
    spare = iter([f for f in frames if f not in {d["frameIndex"] for d in designs}] + frames)
    for d in designs:
        n = used.get(d["frameIndex"], 0)
        if n >= 2:
            for f in spare:
                if used.get(f, 0) < 2:
                    d["frameIndex"] = f
                    break
        used[d["frameIndex"]] = used.get(d["frameIndex"], 0) + 1


def thumbnails(ctx: JobContext) -> dict:
    row, asset, src = _source(ctx)
    doc = row.doc or {}
    duration = _duration(row, asset) or ff.probe(src).duration
    highlights = list(doc.get("highlights") or [])
    ranked = sorted(highlights, key=lambda h: -float(h.get("confidence") or 0))[:MAX_FRAMES]
    times = sorted((float(h["startTime"]) + float(h["endTime"])) / 2 for h in ranked)
    if len(times) < MAX_FRAMES:
        extra = [duration * f for f in (0.15, 0.35, 0.5, 0.65, 0.85)]
        times = sorted(times + [t for t in extra if all(abs(t - x) > 3 for x in times)][: MAX_FRAMES - len(times)])
    times = [max(0.0, min(t, max(0.0, duration - 0.2))) for t in times]

    ctx.stage("frames", 0.02)
    fdir = storage.frames_dir(ctx.user_id, row.id)
    frames: list[tuple[float, Path]] = []
    for i, t in enumerate(times):
        ctx.cancel()
        out = fdir / f"frame-{ctx.job_id[:10]}-{i + 1}.jpg"
        try:
            frames.append((t, ff.extract_frame(src, t, out, width=1280)))
        except ff.FFmpegError:
            log.warning("Frame capture failed at %.2fs", t)
        ctx.progress(0.02 + 0.4 * (i + 1) / len(times))
    if not frames:
        raise JobError("No frames could be extracted from this video.")

    designs: list[dict] = []
    used_ai = False
    if ai_enabled():
        ctx.stage("designing", 0.45)
        # Send an evenly spread subset; map the model's frame_index back to the full list.
        step = max(1, len(frames) / AI_MAX_IMAGES)
        picks = sorted({min(len(frames) - 1, int(i * step)) for i in range(min(AI_MAX_IMAGES, len(frames)))})
        try:
            designs = ai_tasks.suggest_thumbnails(
                title=row.title,
                transcript=list(doc.get("transcript") or []),
                highlights=highlights,
                frames=[(frames[i][0], frames[i][1].read_bytes()) for i in picks],
            )
            for d in designs:
                d["frameIndex"] = picks[max(0, min(len(picks) - 1, int(d.get("frameIndex", 0))))]
            _spread_frames(designs, picks)
            used_ai = bool(designs)
        except (AIError, AIUnavailable) as e:
            log.warning("AI thumbnail design failed, using templates: %s", e)
    if not designs:
        designs = heuristics.thumbnail_designs(title=row.title, highlights=highlights, frame_count=len(frames))

    out = []
    for d in designs:
        idx = max(0, min(len(frames) - 1, int(d.pop("frameIndex", 0))))
        out.append({**d, "id": f"th-{ctx.job_id[:6]}-{len(out) + 1}", "backgroundImage": f"/api/projects/{row.id}/media/{frames[idx][1].name}"})
    # No project write here: the browser adds the designs itself, and bumping the version would make its next save conflict.
    return {"designs": out, "ai": used_ai, "provider": (provider_name() or "ai") if used_ai else None}


# --------------------------------------------------------------------------- render


def _render_clips(ctx: JobContext, row: Project, asset: MediaAsset, src: Path, out_dir: Path, opts: dict, progress: Callable[[float], None]) -> list[tuple[dict, Path]]:
    doc = row.doc or {}
    wanted = opts.get("clipIds") or [c["id"] for c in doc.get("clips") or []]
    by_id = {c["id"]: c for c in doc.get("clips") or []}
    clips = [by_id[i] for i in wanted if i in by_id]
    if not clips:
        raise JobError("There are no clips to render. Create clips in the editor first.")
    fmt = "webm" if opts.get("format") == "webm" else "mp4"
    resolution = opts.get("resolution") or "720p"
    track = None
    if opts.get("burnInSubtitles"):
        tracks = doc.get("subtitles") or []
        track = next((t for t in tracks if t.get("languageCode") == opts.get("subtitleLanguage")), tracks[0] if tracks else None)
    style = doc.get("subtitleStyle") or {}
    base = slugify(row.title)
    duration = _duration(row, asset)

    results: list[tuple[dict, Path]] = []
    names: set[str] = set()
    for i, clip in enumerate(clips):
        ctx.cancel()
        start = max(0.0, float(clip["startTime"]))
        end = float(clip["endTime"])
        if duration:
            end = min(end, duration)
        if end - start < 0.2:
            raise JobError(f"Clip '{clip.get('title', i + 1)}' is too short to render.")
        ratio = clip.get("aspectRatio") or "16:9"
        w, h = ff.output_size(ratio, resolution)
        overlay = None
        if track and track.get("segments"):
            overlay = build_overlay_track(track["segments"], style, w, h, out_dir / f"subs-{i + 1}", clip_start=start, clip_end=end)
        name = f"{base}-{slugify(clip.get('title', ''), f'clip-{i + 1}')}-{ratio.replace(':', 'x')}.{fmt}"
        if name in names:
            name = name.replace(f".{fmt}", f"-{i + 1}.{fmt}")
        names.add(name)
        out = out_dir / name
        a, b = i / len(clips), (i + 1) / len(clips)
        ff.render_clip(
            src, out, start=start, end=end, width=w, height=h, fmt=fmt, overlay_list=overlay, has_audio=_has_audio(asset),
            progress=lambda f, a=a, b=b: progress(a + (b - a) * f), cancel=ctx.cancel,
        )  # fmt: skip
        if overlay is not None:
            storage.remove_tree(overlay.parent)
        results.append((clip, out))
    return results


def render(ctx: JobContext) -> dict:
    row, asset, src = _source(ctx)
    out_dir = storage.job_dir(ctx.user_id, ctx.project_id, ctx.job_id)
    ctx.stage("rendering", 0.0)
    try:
        rendered = _render_clips(ctx, row, asset, src, out_dir, ctx.params, ctx.sub(0.0, 1.0))
    except BaseException:
        storage.remove_tree(out_dir)
        raise
    files = [{"index": i, "clipId": c["id"], "name": p.name, "size": p.stat().st_size} for i, (c, p) in enumerate(rendered)]
    with SessionLocal() as db:
        log_activity(db, ctx.user_id, f"Rendered {len(files)} clip{'s' if len(files) != 1 else ''} for '{row.title}'", "export", row.id)
    return {"files": files, "_files": [storage.rel_path(p) for _, p in rendered]}


# --------------------------------------------------------------------------- package


def _clock(t: float) -> str:
    t = max(0, int(t))
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def content_markdown(title: str, doc: dict) -> str:
    lines = [f"# {title}: social content", ""]
    by_platform: dict[str, list[dict]] = {}
    for c in doc.get("content") or []:
        by_platform.setdefault(c.get("platform", "other"), []).append(c)
    if not by_platform:
        lines.append("_No content generated yet._")
    for platform, items in by_platform.items():
        lines += [f"## {platform.title()}", ""]
        for c in items:
            lines += [f"### {str(c.get('type', '')).title()} ({c.get('tone', '')})", "", str(c.get("content", "")), ""]
    hl = doc.get("highlights") or []
    if hl:
        lines += ["## Chapters", ""] + [f"- {_clock(float(h['startTime']))} {h.get('title', '')}" for h in hl] + [""]
    return "\n".join(lines)


def audience_markdown(title: str, doc: dict) -> str:
    lines = [f"# {title}: audience versions", ""]
    vs = doc.get("audienceVariations") or []
    if not vs:
        lines.append("_No audience versions generated yet._")
    for v in vs:
        lines += [
            f"## {str(v.get('audienceType', '')).title()} · {v.get('language', '')} · {v.get('tone', '')}",
            "",
            f"**Title:** {v.get('title', '')}",
            "",
            f"**Description:** {v.get('description', '')}",
            "",
            f"**Caption:** {v.get('caption', '')}",
            "",
            "**Hashtags:** " + " ".join(f"#{str(h).lstrip('#')}" for h in v.get("hashtags") or []),
            "",
        ]
    return "\n".join(lines)


def package(ctx: JobContext) -> dict:
    opts = ctx.params
    thumb_dir = storage.abs_path(opts["thumbnailDir"]) if opts.get("thumbnailDir") else None
    out_dir = storage.job_dir(ctx.user_id, ctx.project_id, ctx.job_id)
    try:
        row, asset = _load(ctx)
        doc = row.doc or {}
        base = slugify(row.title)
        rendered: list[tuple[dict, Path]] = []
        if opts.get("includeClips"):
            if asset is None:
                raise JobError("This project has no uploaded video.")
            src = storage.abs_path(asset.path)
            ctx.stage("rendering", 0.0)
            clip_dir = out_dir / "clips"
            clip_dir.mkdir(parents=True, exist_ok=True)
            rendered = _render_clips(ctx, row, asset, src, clip_dir, opts, ctx.sub(0.0, 0.88))

        ctx.stage("packaging", 0.9)
        zpath = out_dir / f"{base}.zip"
        contents: list[str] = []
        with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED) as z:
            manifest = {k: v for k, v in doc.items() if k not in ("waveform", "thumbnail")}
            manifest["thumbnails"] = [{k: v for k, v in t.items() if k != "backgroundImage"} for t in doc.get("thumbnails") or []]
            data = {"app": "CREOVOX AI", "version": 2, "exportedAt": utcnow().isoformat(), "project": {"id": row.id, "title": row.title, **manifest}}
            z.writestr(f"{base}/project.json", json.dumps(data, indent=2, ensure_ascii=False))
            for clip, p in rendered:
                z.write(p, f"{base}/clips/{p.name}", compress_type=zipfile.ZIP_STORED)
                contents.append(f"clips/{p.name}")
            if opts.get("includeSubtitles"):
                for t in doc.get("subtitles") or []:
                    if t.get("segments"):
                        code = slugify(t.get("languageCode", "xx"), "xx")
                        z.writestr(f"{base}/subtitles/{base}-{code}.srt", build_srt(t["segments"]))
                        z.writestr(f"{base}/subtitles/{base}-{code}.vtt", build_vtt(t["segments"]))
                        contents.append(f"subtitles/{base}-{code}.srt/.vtt")
                if doc.get("transcript"):
                    text = "\n".join(f"[{_clock(float(s['startTime']))}] {s.get('speaker') + ': ' if s.get('speaker') else ''}{s.get('text', '')}" for s in doc["transcript"])
                    z.writestr(f"{base}/{base}-transcript.txt", text + "\n")
                    contents.append(f"{base}-transcript.txt")
            if opts.get("includeThumbnail") and thumb_dir and thumb_dir.is_dir():
                for png in sorted(thumb_dir.glob("*.png")):
                    name = png.name.split("-", 1)[1] if re.match(r"^\d{2}-", png.name) else png.name
                    z.write(png, f"{base}/thumbnails/{name}", compress_type=zipfile.ZIP_STORED)
                    contents.append(f"thumbnails/{name}")
            if opts.get("includeContent"):
                z.writestr(f"{base}/{base}-content.md", content_markdown(row.title, doc))
                z.writestr(f"{base}/{base}-audiences.md", audience_markdown(row.title, doc))
                contents += [f"{base}-content.md", f"{base}-audiences.md"]
            readme = [f"{row.title}", "", "Exported with CREOVOX AI.", "", "Contents:", "- project.json (full project data)"] + [f"- {c}" for c in contents]
            z.writestr(f"{base}/README.txt", "\n".join(readme) + "\n")
        for _, p in rendered:
            p.unlink(missing_ok=True)
        storage.remove_tree(out_dir / "clips")

        def apply(d: dict) -> None:
            d["exportedAt"] = utcnow().isoformat()
            _add_step(d, "export")

        _update_doc(ctx, apply, status="completed", activity=f"Exported '{row.title}' (ZIP package)", kind="export")
        return {"file": {"name": zpath.name, "size": zpath.stat().st_size}, "_files": [storage.rel_path(zpath)]}
    except BaseException:
        storage.remove_tree(out_dir)
        raise
    finally:
        if thumb_dir:
            storage.remove_tree(thumb_dir)


HANDLERS: dict[str, Callable[[JobContext], dict]] = {
    "analyze": analyze,
    "translate": translate,
    "thumbnails": thumbnails,
    "render": render,
    "package": package,
}

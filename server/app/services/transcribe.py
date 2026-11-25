"""Speech-to-text: Groq-hosted Whisper (fast) or faster-whisper running locally."""
from __future__ import annotations

import logging
import os
import re
import shutil
import tempfile
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from app.config import settings
from app.services import ffmpeg

log = logging.getLogger("creovox.transcribe")

Word = tuple[float, float, str]
GROQ_MAX_BYTES = 24 * 1024 * 1024
CHUNK_SECONDS = 20 * 60
NO_SPACE_LANGS = {"zh", "ja", "th", "lo", "my", "km", "yue", "bo"}

# Whisper reports full language names in verbose_json; map them to ISO 639-1.
WHISPER_NAMES = {
    "english": "en", "tamil": "ta", "hindi": "hi", "telugu": "te", "malayalam": "ml", "kannada": "kn", "bengali": "bn",
    "marathi": "mr", "gujarati": "gu", "punjabi": "pa", "urdu": "ur", "nepali": "ne", "sinhala": "si", "spanish": "es",
    "french": "fr", "german": "de", "italian": "it", "portuguese": "pt", "russian": "ru", "japanese": "ja", "korean": "ko",
    "chinese": "zh", "arabic": "ar", "dutch": "nl", "turkish": "tr", "polish": "pl", "ukrainian": "uk", "vietnamese": "vi",
    "thai": "th", "indonesian": "id", "malay": "ms", "persian": "fa", "hebrew": "he", "greek": "el", "swedish": "sv",
    "norwegian": "no", "danish": "da", "finnish": "fi", "czech": "cs", "romanian": "ro", "hungarian": "hu", "tagalog": "tl",
    "swahili": "sw", "cantonese": "yue", "catalan": "ca", "serbian": "sr", "croatian": "hr", "bulgarian": "bg", "slovak": "sk",
}  # fmt: skip


class TranscriptionError(Exception):
    """User-facing transcription failure."""


@dataclass
class RawSegment:
    start: float
    end: float
    text: str
    words: list[Word] = field(default_factory=list)


@dataclass
class TranscriptionResult:
    segments: list[dict]  # frontend TranscriptSegment dicts
    words: list[Word]
    language: str
    engine: str


def normalize_language(value: str | None, fallback: str = "en") -> str:
    if not value:
        return fallback
    v = value.strip().lower()
    if v in WHISPER_NAMES:
        return WHISPER_NAMES[v]
    if re.fullmatch(r"[a-z]{2,3}(-[a-z0-9]+)?", v):
        return v.split("-")[0]
    return fallback


def transcribe(
    path: Path,
    *,
    duration: float,
    language: str | None = None,
    progress: Callable[[float], None] = lambda f: None,
    cancel: Callable[[], None] = lambda: None,
    prompt: str | None = None,
) -> TranscriptionResult:
    """`prompt` is a short vocabulary hint (brand names, title) that helps Whisper spell names correctly."""
    prompt = (prompt or "").strip()[:400] or None
    engine = settings.active_transcriber
    if engine == "groq":
        raw, lang = _transcribe_groq(path, duration=duration, language=language, progress=progress, cancel=cancel, prompt=prompt)
        name = "groq-whisper"
    else:
        raw, lang = _transcribe_local(path, duration=duration, language=language, progress=progress, cancel=cancel, prompt=prompt)
        name = "local-whisper"
    lang = normalize_language(lang, language or "en")
    segments, words = finalize(raw, duration=duration, no_space=lang in NO_SPACE_LANGS)
    progress(1.0)
    return TranscriptionResult(segments=segments, words=words, language=lang, engine=name)


# --------------------------------------------------------------------------- Groq


def _as_dict(obj) -> dict:
    if isinstance(obj, dict):
        return obj
    for attr in ("to_dict", "model_dump"):
        fn = getattr(obj, attr, None)
        if callable(fn):
            try:
                return fn()
            except TypeError:
                continue
    return dict(getattr(obj, "__dict__", {}))


def _groq_client():
    from groq import Groq

    key = settings.groq_api_key or os.environ.get("GROQ_API_KEY")
    if not key:
        raise TranscriptionError("Groq transcription is selected but GROQ_API_KEY is not set.")
    return Groq(api_key=key, max_retries=3, timeout=600)


def _groq_call(client, audio: Path, language: str | None, prompt: str | None = None) -> dict:
    import groq

    kwargs = dict(
        file=(audio.name, audio.read_bytes()),
        model=settings.groq_whisper_model,
        response_format="verbose_json",
        timestamp_granularities=["word", "segment"],
        temperature=0.0,
    )
    if language:
        kwargs["language"] = language
    if prompt:
        kwargs["prompt"] = prompt
    try:
        return _as_dict(client.audio.transcriptions.create(**kwargs))
    except groq.AuthenticationError as e:
        raise TranscriptionError("Groq rejected the API key (check GROQ_API_KEY).") from e
    except groq.RateLimitError as e:
        raise TranscriptionError("Groq's transcription rate limit was reached. Please try again in a few minutes.") from e
    except groq.APIConnectionError as e:
        raise TranscriptionError("Could not reach Groq for transcription. Check the server's internet connection.") from e
    except groq.APIStatusError as e:
        raise TranscriptionError(f"Groq transcription failed ({e.status_code}).") from e


def _parse_groq(data: dict, offset: float) -> tuple[list[RawSegment], str | None]:
    segs = [
        RawSegment(start=float(s.get("start", 0)) + offset, end=float(s.get("end", 0)) + offset, text=str(s.get("text", "")))
        for s in data.get("segments") or []
    ]
    words = [
        (float(w.get("start", 0)) + offset, float(w.get("end", 0)) + offset, str(w.get("word", "")))
        for w in data.get("words") or []
        if str(w.get("word", "")).strip()
    ]
    # Attach words to segments by start time.
    wi = 0
    for i, seg in enumerate(segs):
        limit = segs[i + 1].start if i + 1 < len(segs) else float("inf")
        while wi < len(words) and words[wi][0] < limit:
            if words[wi][0] >= seg.start - 0.25 or not seg.words:
                seg.words.append(words[wi])
            wi += 1
    if not segs and data.get("text"):
        segs = [RawSegment(start=offset, end=offset + float(data.get("duration") or 0), text=str(data["text"]), words=words)]
    return segs, data.get("language")


def _transcribe_groq(path: Path, *, duration: float, language: str | None, progress, cancel, prompt: str | None = None) -> tuple[list[RawSegment], str | None]:
    if not ffmpeg.available():
        raise TranscriptionError("ffmpeg is required to prepare audio for transcription.")
    client = _groq_client()
    tmp = Path(tempfile.mkdtemp(prefix="creovox-stt-"))
    try:
        audio = ffmpeg.extract_audio(path, tmp / "audio.ogg", duration=duration, cancel=cancel, progress=lambda f: progress(0.15 * f))
        chunks = [(0.0, audio)] if audio.stat().st_size <= GROQ_MAX_BYTES else ffmpeg.split_audio(audio, tmp / "chunks", chunk_seconds=CHUNK_SECONDS)
        all_segs: list[RawSegment] = []
        lang: str | None = language
        for i, (offset, chunk) in enumerate(chunks):
            cancel()
            progress(0.15 + 0.85 * i / len(chunks))
            # Network call in a thread so cancellation/heartbeat are still polled.
            box: dict = {}

            def call(chunk: Path = chunk) -> None:
                try:
                    box["data"] = _groq_call(client, chunk, language or (lang if i else None), prompt)
                except BaseException as e:  # noqa: BLE001
                    box["error"] = e

            th = threading.Thread(target=call, daemon=True)
            th.start()
            while th.is_alive():
                th.join(timeout=1.0)
                cancel()
            if "error" in box:
                raise box["error"]
            segs, detected = _parse_groq(box["data"], offset)
            lang = lang or detected
            all_segs.extend(segs)
        progress(1.0)
        return all_segs, lang
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# --------------------------------------------------------------------------- local faster-whisper

_local_model = None
_local_lock = threading.Lock()


def _get_local_model():
    global _local_model
    with _local_lock:
        if _local_model is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError as e:  # pragma: no cover
                raise TranscriptionError("faster-whisper is not installed.") from e
            log.info("Loading Whisper model '%s' (first use downloads it)…", settings.whisper_model)
            _local_model = WhisperModel(settings.whisper_model, device=settings.whisper_device, compute_type=settings.whisper_compute_type)
        return _local_model


def _transcribe_local(path: Path, *, duration: float, language: str | None, progress, cancel, prompt: str | None = None) -> tuple[list[RawSegment], str | None]:
    model = _get_local_model()
    segments, info = model.transcribe(str(path), language=language or None, vad_filter=True, word_timestamps=True, beam_size=5, initial_prompt=prompt)
    out: list[RawSegment] = []
    for seg in segments:  # generator: decoding happens while iterating
        cancel()
        words = [(float(w.start), float(w.end), str(w.word)) for w in (seg.words or [])]
        out.append(RawSegment(start=float(seg.start), end=float(seg.end), text=str(seg.text), words=words))
        if duration > 0:
            progress(min(0.99, float(seg.end) / duration))
    return out, getattr(info, "language", None)


# --------------------------------------------------------------------------- post-processing

_SENT_END = re.compile(r"[.!?…。！？]['\"”’)]*$")


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _join_words(words: list[Word]) -> str:
    return _clean("".join(w[2] for w in words))


def _split_long(seg: RawSegment, max_len: float = 15.0, target: float = 6.0) -> list[RawSegment]:
    if seg.end - seg.start <= max_len or len(seg.words) < 2:
        return [seg]
    parts: list[RawSegment] = []
    cur: list[Word] = []
    for i, w in enumerate(seg.words):
        cur.append(w)
        span = cur[-1][1] - cur[0][0]
        gap = seg.words[i + 1][0] - w[1] if i + 1 < len(seg.words) else 0
        if (span >= target and (_SENT_END.search(w[2].strip()) or gap > 0.6)) or span >= max_len:
            parts.append(RawSegment(cur[0][0], cur[-1][1], _join_words(cur), list(cur)))
            cur = []
    if cur:
        parts.append(RawSegment(cur[0][0], cur[-1][1], _join_words(cur), list(cur)))
    return parts


def _norm(token: str) -> str:
    return re.sub(r"[^\w']", "", token.lower())


def _align_punctuation(words: list[Word], text: str) -> list[Word]:
    """Copy punctuation/casing from the segment text onto word tokens (Groq words come back unpunctuated)."""
    tokens = text.split()
    if not words or not tokens:
        return words
    out = list(words)
    i = j = 0
    while i < len(out) and j < len(tokens):
        w = _norm(out[i][2])
        if w == _norm(tokens[j]):
            out[i] = (out[i][0], out[i][1], " " + tokens[j])
            i += 1
            j += 1
        elif j + 1 < len(tokens) and w == _norm(tokens[j + 1]):
            j += 1
        elif i + 1 < len(out) and _norm(out[i + 1][2]) == _norm(tokens[j]):
            i += 1
        else:
            i += 1
            j += 1
    return out


def finalize(raw: list[RawSegment], *, duration: float, no_space: bool = False) -> tuple[list[dict], list[Word]]:
    """Clean, split long segments, and produce frontend TranscriptSegment dicts + a flat word list."""
    limit = duration if duration and duration > 0 else float("inf")
    segments: list[dict] = []
    words: list[Word] = []
    for seg in raw:
        seg_words = []
        for s, e, t in seg.words:
            token = t.strip()
            if not token:
                continue
            if not no_space and not t.startswith(" "):
                t = " " + token
            elif no_space:
                t = token
            seg_words.append((max(0.0, min(s, limit)), max(0.0, min(e, limit)), t))
        if not no_space:
            seg_words = _align_punctuation(seg_words, seg.text)
        seg = RawSegment(seg.start, seg.end, seg.text, seg_words)
        for part in _split_long(seg):
            text = _clean(part.text) or _join_words(part.words)
            if not text:
                continue
            start = round(max(0.0, min(part.start, limit)), 2)
            end = round(max(start + 0.1, min(part.end, limit)), 2)
            segments.append({"id": f"t{len(segments) + 1}", "startTime": start, "endTime": end, "text": text, "speaker": "Speaker 1"})
            words.extend(part.words)
    return segments, words

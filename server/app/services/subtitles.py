"""Subtitle cue building and SRT/VTT serialisation (ports of src/lib/subtitles.ts)."""
from __future__ import annotations

import math
import re
from collections.abc import Iterable, Sequence

Word = tuple[float, float, str]  # (start, end, token). Tokens may carry a leading space.

_SENTENCE_END = re.compile(r"[.!?…。！？]['\"”’)]*$")
_SOFT_BREAK = re.compile(r"[,;:、，；：]$")


# --------------------------------------------------------------------------- timing


def _split_time(t: float) -> tuple[int, int, int, int]:
    total_ms = max(0, math.floor(t * 1000 + 0.5))
    return total_ms // 3600000, (total_ms % 3600000) // 60000, (total_ms % 60000) // 1000, total_ms % 1000


def to_srt_time(t: float) -> str:
    h, m, s, ms = _split_time(t)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_vtt_time(t: float) -> str:
    h, m, s, ms = _split_time(t)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def _sorted(segments: Iterable[dict]) -> list[dict]:
    return sorted(segments, key=lambda s: s["startTime"])


def build_srt(segments: Iterable[dict]) -> str:
    body = "\n\n".join(
        f"{i + 1}\n{to_srt_time(s['startTime'])} --> {to_srt_time(s['endTime'])}\n{str(s['text']).strip()}" for i, s in enumerate(_sorted(segments))
    )
    return body + "\n"


def build_vtt(segments: Iterable[dict]) -> str:
    body = "\n\n".join(f"{to_vtt_time(s['startTime'])} --> {to_vtt_time(s['endTime'])}\n{str(s['text']).strip()}" for s in _sorted(segments))
    return "WEBVTT\n\n" + body + "\n"


# --------------------------------------------------------------------------- cues


def _clean(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text.replace("\n", " ")).strip()


def wrap_lines(text: str, max_line: int = 42) -> str:
    """Wrap a cue onto two lines at the space nearest the middle (or mid-string for scripts without spaces)."""
    text = _clean(text)
    if len(text) <= max_line:
        return text
    mid = len(text) // 2
    spaces = [i for i, ch in enumerate(text) if ch == " "]
    if spaces:
        cut = min(spaces, key=lambda i: abs(i - mid))
        return text[:cut].rstrip() + "\n" + text[cut + 1 :].lstrip()
    return text[:mid] + "\n" + text[mid:]


def build_cues(
    words: Sequence[Word],
    *,
    max_line: int = 42,
    max_lines: int = 2,
    max_dur: float = 6.0,
    gap_break: float = 0.8,
    min_dur: float = 0.6,
) -> list[dict]:
    """Group word timestamps into readable subtitle cues (≤ max_lines × max_line chars, ≤ max_dur s)."""
    max_chars = max_line * max_lines
    cues: list[dict] = []
    cur: list[Word] = []

    def text_of(ws: Sequence[Word]) -> str:
        return _clean("".join(w[2] for w in ws))

    def flush() -> None:
        if not cur:
            return
        text = text_of(cur)
        if text:
            cues.append({"startTime": cur[0][0], "endTime": cur[-1][1], "text": wrap_lines(text, max_line)})
        cur.clear()

    for w in words:
        start, end, token = float(w[0]), float(w[1]), str(w[2])
        if not token.strip():
            continue
        if end < start:
            end = start
        if cur:
            candidate = text_of([*cur, (start, end, token)])
            if len(candidate) > max_chars or end - cur[0][0] > max_dur or start - cur[-1][1] > gap_break:
                flush()
        cur.append((start, end, token))
        text = text_of(cur)
        if _SENTENCE_END.search(text) and (len(text) >= 18 or end - cur[0][0] >= 1.5):
            flush()
        elif _SOFT_BREAK.search(text) and len(text) >= max_line:
            flush()
    flush()
    return _finalise(cues, min_dur)


def _finalise(cues: list[dict], min_dur: float) -> list[dict]:
    out: list[dict] = []
    for i, c in enumerate(cues):
        start = round(c["startTime"], 3)
        end = round(c["endTime"], 3)
        nxt = cues[i + 1]["startTime"] if i + 1 < len(cues) else None
        if end - start < min_dur:
            end = start + min_dur if nxt is None else min(start + min_dur, max(end, nxt - 0.01))
        if nxt is not None and end > nxt:
            end = max(start + 0.1, nxt - 0.01)
        out.append({"id": f"c{i + 1}", "startTime": round(start, 3), "endTime": round(end, 3), "text": c["text"]})
    return out


def cues_from_segments(segments: Sequence[dict], *, max_line: int = 42, max_lines: int = 2, max_dur: float = 6.0) -> list[dict]:
    """Fallback when there are no word timestamps: split each transcript segment evenly by words."""
    words: list[Word] = []
    for seg in segments:
        tokens = str(seg.get("text", "")).split()
        if not tokens:
            continue
        start, end = float(seg["startTime"]), float(seg["endTime"])
        step = max(0.01, (end - start) / len(tokens))
        for i, tok in enumerate(tokens):
            words.append((start + i * step, start + (i + 1) * step, " " + tok))
    return build_cues(words, max_line=max_line, max_lines=max_lines, max_dur=max_dur)

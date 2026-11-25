"""Deterministic fallbacks used when no AI provider is configured (or the AI call fails)."""
from __future__ import annotations

import re
import secrets

_SENT_END = re.compile(r"[.!?…。！？]['\"”’)]*$")
_STOP = set(
    "a an and are as at be but by for from has have i if in into is it its of on or so that the this to was we were what when which who will with "
    "you your our they them their there here just like really very about can do does don't not no yes okay ok um uh".split()
)


def segment_energies(transcript: list[dict], waveform: list[float] | None, duration: float) -> list[float] | None:
    """Mean waveform level (0–1) during each transcript segment, or None without a real waveform."""
    if not waveform or duration <= 0:
        return None
    n = len(waveform)
    out = []
    for s in transcript:
        a = int(max(0, min(n - 1, float(s["startTime"]) / duration * n)))
        b = int(max(a + 1, min(n, float(s["endTime"]) / duration * n + 1)))
        chunk = waveform[a:b]
        out.append(round(sum(chunk) / len(chunk), 3) if chunk else 0.0)
    return out


def _title_from(text: str, limit: int = 60) -> str:
    words = text.strip().split()
    title = ""
    for w in words[:9]:
        nxt = f"{title} {w}".strip()
        if len(nxt) > limit - 1:
            break
        title = nxt
    title = title.rstrip(",;:.-—") or "Highlight"
    return (title[0].upper() + title[1:]) + ("…" if len(words) > len(title.split()) else "")


def detect_highlights(transcript: list[dict], *, duration: float, energies: list[float] | None, target: int) -> list[dict]:
    """Score sentence-aligned windows of 8–45 s by audio energy and word density, then keep the best non-overlapping ones."""
    n = len(transcript)
    if not n:
        return []
    mean_e = (sum(energies) / len(energies)) if energies else 0.0
    candidates = []
    for a in range(n):
        # Prefer windows that start at a sentence beginning.
        if a > 0 and not _SENT_END.search(str(transcript[a - 1].get("text", "")).strip()):
            continue
        start = float(transcript[a]["startTime"])
        words = 0
        for b in range(a, n):
            end = float(transcript[b]["endTime"])
            span = end - start
            words += len(str(transcript[b].get("text", "")).split())
            if span > 45:
                break
            if span < 8 or not _SENT_END.search(str(transcript[b].get("text", "")).strip()):
                continue
            density = min(1.0, words / max(1.0, span) / 3.0)  # ~3 words/s = lively speech
            energy = (sum(energies[a : b + 1]) / (b - a + 1)) if energies else 0.5
            length_fit = 1.0 - abs(span - 25) / 40  # sweet spot around 25 s
            text = " ".join(str(transcript[i].get("text", "")) for i in range(a, b + 1))
            punch = 0.1 if ("!" in text or "?" in text) else 0.0
            score = 0.45 * energy + 0.3 * density + 0.15 * length_fit + punch
            candidates.append((score, a, b, energy, text))
    if not candidates:  # no sentence boundaries: fall back to fixed chunks
        step = max(1, n // max(1, target))
        for a in range(0, n, step):
            b = min(n - 1, a + step - 1)
            text = " ".join(str(transcript[i].get("text", "")) for i in range(a, b + 1))
            energy = (sum(energies[a : b + 1]) / (b - a + 1)) if energies else 0.5
            candidates.append((0.5 + 0.3 * energy, a, b, energy, text))

    candidates.sort(key=lambda c: -c[0])
    kept: list[tuple] = []
    for c in candidates:
        if len(kept) >= target:
            break
        if all(c[2] < k[1] or c[1] > k[2] for k in kept):
            kept.append(c)
    kept.sort(key=lambda c: c[1])
    if not kept:
        return []

    best = max(k[0] for k in kept) or 1.0
    out = []
    for i, (score, a, b, energy, text) in enumerate(kept, start=1):
        if energies and energy > mean_e * 1.25:
            category = "engagement-peak"
        elif "\"" in text or "“" in text or "!" in text:
            category = "quote"
        elif i == 1 or (a > 0 and float(transcript[a]["startTime"]) - float(transcript[a - 1]["endTime"]) > 1.5):
            category = "topic-change"
        else:
            category = "key-moment"
        first = str(transcript[a].get("text", "")).strip()
        out.append(
            {
                "id": f"h{i}-{secrets.token_hex(2)}",
                "startTime": round(float(transcript[a]["startTime"]), 2),
                "endTime": round(min(float(transcript[b]["endTime"]), duration) if duration else float(transcript[b]["endTime"]), 2),
                "title": _title_from(first),
                "description": first if len(first) <= 220 else first[:217] + "…",
                "confidence": round(min(0.97, 0.55 + 0.4 * score / best), 2),
                "selected": False,
                "category": category,
            }
        )
    top = {h["id"] for h in sorted(out, key=lambda h: -h["confidence"])[: max(1, (len(out) + 1) // 2)]}
    for h in out:
        h["selected"] = h["id"] in top
    return out


def highlight_target(duration: float, segments: int) -> int:
    return max(1, min(segments, 8, max(3, round(duration / 45))))


_TEMPLATES = [
    {"title": "Bold Impact", "fontSize": 44, "fontFamily": "Space Grotesk", "textColor": "#FFFFFF", "textPosition": {"x": 50, "y": 50}, "backgroundColor": "#1A1A2E", "style": "bold", "overlay": 0.45},
    {"title": "Minimal Clean", "fontSize": 34, "fontFamily": "Inter", "textColor": "#F5F2EE", "textPosition": {"x": 25, "y": 75}, "backgroundColor": "#0F0F1A", "style": "minimal", "overlay": 0.35},
    {"title": "Cinematic Warm", "fontSize": 48, "fontFamily": "Space Grotesk", "textColor": "#FFA45E", "textPosition": {"x": 50, "y": 50}, "backgroundColor": "#11151B", "style": "cinematic", "overlay": 0.3},
    {"title": "Editorial Focus", "fontSize": 40, "fontFamily": "Instrument Serif", "textColor": "#F5F2EE", "textPosition": {"x": 25, "y": 50}, "backgroundColor": "#090B0F", "style": "editorial", "overlay": 0.5},
]


def _stem(text: str) -> str:
    return "".join(ch for ch in text.lower() if ch.isalnum())


def thumbnail_designs(*, title: str, highlights: list[dict], frame_count: int) -> list[dict]:
    """Template designs over the extracted frames; overlay text comes from the title or highlight titles."""
    if frame_count <= 0:
        return []
    short = title if len(title) <= 34 else title[:32].rstrip() + "…"
    hl_titles = [h.get("title", "") for h in highlights if h.get("title")]
    designs = []
    for i, tpl in enumerate(_TEMPLATES[: max(1, min(4, frame_count))]):
        text = short if i == 0 or not hl_titles else hl_titles[(i - 1) % len(hl_titles)]
        words = text.split()
        if len(words) > 6:
            text = " ".join(words[:6]) + "…"
        designs.append({**tpl, "textPosition": dict(tpl["textPosition"]), "frameIndex": i % frame_count, "textOverlay": text})
    return designs


def keywords(transcript: list[dict], limit: int = 8) -> list[str]:
    counts: dict[str, int] = {}
    for s in transcript:
        for w in re.findall(r"[A-Za-z][A-Za-z'-]{3,}", str(s.get("text", ""))):
            k = w.lower()
            if k not in _STOP:
                counts[k] = counts.get(k, 0) + 1
    return [k for k, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]]

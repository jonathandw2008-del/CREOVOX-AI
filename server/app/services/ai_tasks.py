"""High-level AI tasks used by the API and the worker. Inputs/outputs are frontend (camelCase) dicts."""
from __future__ import annotations

import json
import re
import secrets
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel

from app.services.ai import AIError, generate_json
from app.services.languages import language_name

MAX_CONTEXT_CHARS = 120_000

HighlightCat = Literal["key-moment", "quote", "topic-change", "engagement-peak"]
ThumbStyle = Literal["bold", "minimal", "cinematic", "editorial"]
AudienceKind = Literal["student", "professional", "general"]

GROUNDING = (
    "Ground everything in the transcript and title you are given. Never invent facts, names, numbers or claims "
    "that are not supported by the source."
)


# --------------------------------------------------------------------------- #
# helpers                                                                      #
# --------------------------------------------------------------------------- #


def fmt_clock(t: float) -> str:
    """m:ss or h:mm:ss (matches the frontend formatDuration style)."""
    t = max(0, int(round(t)))
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def fmt_precise(t: float) -> str:
    t = max(0.0, float(t))
    m, s = divmod(t, 60)
    return f"{int(m):02d}:{s:04.1f}"


def _sample_lines(lines: list[str], cap: int) -> tuple[list[str], bool]:
    """Keep lines under `cap` characters by sampling evenly. Returns (lines, was_sampled)."""
    total = sum(len(x) + 1 for x in lines)
    if total <= cap or not lines:
        return lines, False
    keep_ratio = cap / total
    step = max(1, round(1 / keep_ratio))
    out: list[str] = []
    size = 0
    for i in range(0, len(lines), step):
        if size + len(lines[i]) + 1 > cap:
            break
        out.append(lines[i])
        size += len(lines[i]) + 1
    return out, True


def transcript_block(transcript: list[dict], *, numbered: bool = False, energies: list[float] | None = None, cap: int = MAX_CONTEXT_CHARS) -> str:
    lines = []
    for i, seg in enumerate(transcript):
        text = " ".join(str(seg.get("text", "")).split())
        if not text:
            continue
        span = f"{fmt_precise(seg.get('startTime', 0))}–{fmt_precise(seg.get('endTime', 0))}"
        if numbered:
            energy = f" (energy {energies[i]:.2f})" if energies and i < len(energies) and energies[i] is not None else ""
            lines.append(f"[{i}] {span}{energy} {text}")
        else:
            lines.append(f"[{span}] {text}")
    kept, sampled = _sample_lines(lines, cap)
    note = "(Transcript was long, so lines were sampled evenly.)\n" if sampled else ""
    return note + "\n".join(kept)


def context_block(context: dict, *, cap: int = MAX_CONTEXT_CHARS) -> str:
    parts = [f"Title: {context.get('title', '').strip()}"]
    if context.get("description"):
        parts.append(f"Description: {str(context['description']).strip()[:1000]}")
    parts.append(f"Duration: {fmt_clock(float(context.get('duration') or 0))}")
    if context.get("language"):
        parts.append(f"Spoken language: {language_name(context['language'])}")
    hl = context.get("highlights") or []
    if hl:
        parts.append("Highlights:\n" + "\n".join(f"- {fmt_clock(h.get('startTime', 0))} {h.get('title', '')}: {h.get('description', '')}".rstrip(": ") for h in hl[:30]))
    tr = context.get("transcript") or []
    parts.append("Transcript:\n" + (transcript_block(tr, cap=cap) if tr else "(no transcript available — rely on the title and description only)"))
    return "\n\n".join(parts)


def _hashtag_list(raw: list[str] | str, limit: int) -> list[str]:
    if isinstance(raw, str):
        raw = re.split(r"[\s,]+", raw)
    out: list[str] = []
    seen: set[str] = set()
    for tag in raw:
        cleaned = re.sub(r"[^\w]", "", str(tag).lstrip("#"), flags=re.UNICODE)
        if not cleaned:
            continue
        t = "#" + cleaned
        if t.lower() in seen:
            continue
        seen.add(t.lower())
        out.append(t)
        if len(out) >= limit:
            break
    return out


def _truncate(text: str, limit: int) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut[int(limit * 0.6):]:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,.;:—-") + "…"


# --------------------------------------------------------------------------- #
# highlights                                                                   #
# --------------------------------------------------------------------------- #


class _Highlight(BaseModel):
    start_segment: int
    end_segment: int
    title: str
    description: str
    category: HighlightCat
    confidence: float


class _HighlightsOut(BaseModel):
    highlights: list[_Highlight]


def detect_highlights(*, title: str, duration: float, transcript: list[dict], energies: list[float] | None, target: int) -> list[dict]:
    if not transcript:
        return []
    n = len(transcript)
    target = max(1, min(target, n))
    system = (
        "You are a senior video editor who finds the most engaging, self-contained moments in long-form video "
        "for short social clips. " + GROUNDING
    )
    context = f"Video title: {title}\nDuration: {fmt_clock(duration)}\n\nNumbered transcript (index, time span, audio energy 0–1, text):\n" + transcript_block(
        transcript, numbered=True, energies=energies
    )
    prompt = (
        f"Pick about {target} highlight moments. Each highlight spans consecutive transcript segments "
        "[start_segment..end_segment] (inclusive, using the bracketed indices), ideally 8–60 seconds long, starts at a "
        "natural sentence beginning and ends at a sentence end. Highlights must not overlap.\n"
        "Categories: key-moment (core idea or payoff), quote (a quotable line), topic-change (a new section begins), "
        "engagement-peak (high energy, emotional or surprising — higher audio energy is a hint).\n"
        "title: catchy but accurate, at most 60 characters. description: one sentence on what is said. "
        "confidence: 0–1, how well it works as a standalone clip."
    )
    out = generate_json(system=system, prompt=prompt, schema=_HighlightsOut, context=context, effort="medium", max_tokens=6000)

    items = []
    for h in out.highlights:
        a = max(0, min(n - 1, int(h.start_segment)))
        b = max(0, min(n - 1, int(h.end_segment)))
        if a > b:
            a, b = b, a
        # Keep clips at most ~60s by trimming segments off the end.
        while b > a and float(transcript[b]["endTime"]) - float(transcript[a]["startTime"]) > 60:
            b -= 1
        start, end = float(transcript[a]["startTime"]), float(transcript[b]["endTime"])
        if end <= start:
            continue
        items.append(
            {
                "a": a,
                "b": b,
                "startTime": round(start, 2),
                "endTime": round(min(end, duration) if duration else end, 2),
                "title": _truncate(h.title or "Highlight", 60),
                "description": _truncate(h.description or str(transcript[a].get("text", "")), 220),
                "category": h.category,
                "confidence": round(max(0.0, min(1.0, float(h.confidence))), 2),
            }
        )

    # Drop overlaps, preferring higher confidence.
    items.sort(key=lambda x: -x["confidence"])
    kept: list[dict] = []
    for it in items:
        if all(it["b"] < k["a"] or it["a"] > k["b"] for k in kept):
            kept.append(it)
    kept.sort(key=lambda x: x["startTime"])

    top = sorted(kept, key=lambda x: -x["confidence"])[: max(1, (len(kept) + 1) // 2)]
    top_ids = {id(x) for x in top}
    result = []
    for i, it in enumerate(kept, start=1):
        result.append(
            {
                "id": f"h{i}-{secrets.token_hex(2)}",
                "startTime": it["startTime"],
                "endTime": it["endTime"],
                "title": it["title"],
                "description": it["description"],
                "confidence": it["confidence"],
                "selected": id(it) in top_ids,
                "category": it["category"],
            }
        )
    return result


# --------------------------------------------------------------------------- #
# subtitle translation                                                         #
# --------------------------------------------------------------------------- #


class _Cue(BaseModel):
    id: str
    text: str


class _CuesOut(BaseModel):
    cues: list[_Cue]


CHUNK = 60


def _translate_chunk(cues: list[dict], source_name: str, target_name: str) -> dict[str, str]:
    payload = json.dumps([{"id": c["id"], "text": c["text"]} for c in cues], ensure_ascii=False)
    system = (
        f"You are a professional subtitle translator from {source_name} to {target_name}. "
        "Translate meaning naturally, as people actually speak, not word for word."
    )
    prompt = (
        f"Translate every subtitle cue below into {target_name}. Return each cue id exactly once with its translated text. "
        "Keep each translation about as long as the original so it fits the same on-screen timing. Keep line breaks (\\n) "
        "where natural. Keep names, numbers, URLs and brand names. Do not merge, split, drop or reorder cues.\n\n"
        f"Cues (JSON):\n{payload}"
    )
    out = generate_json(system=system, prompt=prompt, schema=_CuesOut, effort="low", max_tokens=min(16000, 400 + len(payload) * 3))
    return {c.id: c.text for c in out.cues if c.text.strip()}


def translate_segments(
    *,
    segments: list[dict],
    source_language: str,
    target_language: str,
    target_language_name: str,
    progress: Callable[[float], None] | None = None,
) -> list[dict]:
    source_name = language_name(source_language)
    target_name = target_language_name or language_name(target_language)
    result: list[dict] = []
    total = len(segments)
    for start in range(0, total, CHUNK):
        chunk = [s for s in segments[start : start + CHUNK]]
        translated = _translate_chunk(chunk, source_name, target_name)
        missing = [c for c in chunk if c["id"] not in translated]
        if missing:
            try:
                translated.update(_translate_chunk(missing, source_name, target_name))
            except AIError:
                pass
        for c in chunk:
            result.append({**c, "text": translated.get(c["id"], c["text"])})
        if progress:
            progress(min(1.0, (start + len(chunk)) / max(1, total)))
    return result


# --------------------------------------------------------------------------- #
# thumbnails (vision)                                                          #
# --------------------------------------------------------------------------- #


class _Design(BaseModel):
    frame_index: int
    name: str
    text_overlay: str
    style: ThumbStyle
    text_color: str
    background_color: str
    text_position: Literal["center", "left", "top-left", "bottom-left", "bottom-center"]
    font_family: Literal["Inter", "Space Grotesk", "Instrument Serif"]


class _DesignsOut(BaseModel):
    designs: list[_Design]


_POS = {"center": (50, 50), "left": (25, 50), "top-left": (25, 25), "bottom-left": (25, 75), "bottom-center": (50, 78)}
_STYLE_DEFAULTS = {
    "bold": {"fontSize": 48, "overlay": 0.45},
    "minimal": {"fontSize": 34, "overlay": 0.35},
    "cinematic": {"fontSize": 50, "overlay": 0.3},
    "editorial": {"fontSize": 40, "overlay": 0.5},
}
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _hex(value: str, fallback: str) -> str:
    v = (value or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{3}", v):
        v = "#" + "".join(ch * 2 for ch in v[1:])
    return v.upper() if _HEX.match(v) else fallback


def suggest_thumbnails(*, title: str, transcript: list[dict], highlights: list[dict], frames: list[tuple[float, bytes]], count: int = 4) -> list[dict]:
    if not frames:
        return []
    count = max(1, min(count, len(frames) * 2, 6))
    frame_lines = []
    for i, (t, _) in enumerate(frames):
        near = next((h for h in highlights if float(h.get("startTime", 0)) <= t <= float(h.get("endTime", 0))), None)
        frame_lines.append(f"Image {i + 1} = frame_index {i}, at {fmt_clock(t)}" + (f" (during highlight '{near.get('title', '')}')" if near else ""))
    system = "You are an expert YouTube thumbnail designer. You choose the most striking frame and write short, punchy overlay text. " + GROUNDING
    context = f"Video title: {title}\n\nKey moments:\n" + (
        "\n".join(f"- {fmt_clock(h.get('startTime', 0))} {h.get('title', '')}" for h in highlights[:12]) or "(none)"
    ) + "\n\nTranscript excerpt:\n" + transcript_block(transcript, cap=6000)
    prompt = (
        f"The attached images are candidate frames:\n" + "\n".join(frame_lines) + "\n\n"
        f"Design {count} distinct thumbnails. For each: frame_index (choose clear, expressive, well-lit frames; you may reuse a "
        "frame with a different style), name (2–3 words naming the design), text_overlay (at most 5 words, high-curiosity, "
        "accurate to the video), style (bold | minimal | cinematic | editorial — vary them), text_color and background_color as "
        "#RRGGBB with strong contrast, text_position away from faces and busy areas, font_family."
    )
    out = generate_json(
        system=system,
        prompt=prompt,
        schema=_DesignsOut,
        context=context,
        images=[img for _, img in frames],
        effort="medium",
        max_tokens=3000,
    )
    designs = []
    for d in out.designs[:count]:
        idx = max(0, min(len(frames) - 1, int(d.frame_index)))
        x, y = _POS.get(d.text_position, (50, 50))
        style = d.style if d.style in _STYLE_DEFAULTS else "bold"
        words = d.text_overlay.split()
        designs.append(
            {
                "frameIndex": idx,
                "title": _truncate(d.name or style.title(), 40),
                "textOverlay": " ".join(words[:6]) or title[:32],
                "style": style,
                "textColor": _hex(d.text_color, "#FFFFFF"),
                "textPosition": {"x": x, "y": y},
                "fontFamily": d.font_family,
                "fontSize": _STYLE_DEFAULTS[style]["fontSize"],
                "backgroundColor": _hex(d.background_color, "#11151B"),
                "overlay": _STYLE_DEFAULTS[style]["overlay"],
            }
        )
    return designs


# --------------------------------------------------------------------------- #
# content writer                                                               #
# --------------------------------------------------------------------------- #

PLATFORM_RULES = {
    "youtube": "YouTube: title ≤ 70 characters, searchable and specific. description: 2–4 short paragraphs (do NOT add chapters or timestamps — they are appended automatically). caption: a 1–2 sentence community-post hook with a call to watch/subscribe. hashtags: up to 10.",
    "instagram": "Instagram Reels: title ≤ 60 characters (emoji allowed). description: 2–3 short lines. caption: hook first line, emoji welcome, end with a save/share call to action. hashtags: up to 10.",
    "tiktok": "TikTok: title ≤ 60 characters, playful hook (emoji allowed). description: 1–2 lines. caption: very short hook + 'follow for part 2' style CTA. hashtags: up to 10.",
    "twitter": "X (Twitter): title ≤ 90 characters. description ≤ 260 characters. caption ≤ 280 characters including the call to action. hashtags: exactly 3 at most.",
    "linkedin": "LinkedIn: title ≤ 100 characters, professional. description: short paragraphs plus 3–4 '→ ' bullet key points and a closing question. caption: professional hook + discussion prompt. hashtags: at most 5.",
    "facebook": "Facebook: title ≤ 80 characters. description: 1–2 friendly paragraphs. caption: conversational hook + share CTA. hashtags: up to 5.",
}
HASHTAG_LIMIT = {"twitter": 3, "linkedin": 5, "facebook": 5}
TONE_GUIDE = {
    "professional": "professional: clear, credible, concise",
    "casual": "casual: friendly and relaxed, like talking to a friend",
    "educational": "educational: explains clearly, learning-focused",
    "entertaining": "entertaining: playful, high-energy, curiosity-driven",
    "inspirational": "inspirational: uplifting and motivating",
}


class _ContentOut(BaseModel):
    title: str
    description: str
    caption: str
    hashtags: list[str]


def _chapters(highlights: list[dict]) -> str:
    hs = sorted(highlights or [], key=lambda h: float(h.get("startTime", 0)))
    if not hs:
        return ""
    return "\n".join(f"{fmt_clock(float(h.get('startTime', 0)))} — {h.get('title', '')}" for h in hs[:20])


def generate_content(*, context: dict, platform: str, tone: str, types: list[str], variant: int, previous: list[str] | None) -> list[dict]:
    lang = language_name(context.get("language")) if context.get("language") else "English"
    system = "You are a social media copywriter for video creators. You write platform-native copy that is accurate to the video. " + GROUNDING
    avoid = ""
    if previous:
        avoid = "\n\nWrite something clearly different from these earlier versions:\n" + "\n".join(f"- {p[:300]}" for p in previous[:8])
    prompt = (
        f"Write publishing copy for {platform}. Tone — {TONE_GUIDE.get(tone, tone)}. Write in {lang}.\n"
        f"{PLATFORM_RULES.get(platform, '')}\n"
        "Return title, description, caption and hashtags (a list of single-word #Tags in CamelCase, no spaces inside a tag)."
        f" This is variation #{variant + 1}; take a fresh angle.{avoid}"
    )
    out = generate_json(system=system, prompt=prompt, schema=_ContentOut, context=context_block(context), effort="low", max_tokens=4000)

    tags = _hashtag_list(out.hashtags, HASHTAG_LIMIT.get(platform, 10))
    fields = {"title": out.title.strip(), "description": out.description.strip(), "caption": out.caption.strip(), "hashtags": " ".join(tags)}
    if platform == "twitter":
        fields["title"] = _truncate(fields["title"], 90)
        fields["description"] = _truncate(fields["description"], 260)
        fields["caption"] = _truncate(fields["caption"], 280)
    else:
        fields["caption"] = _truncate(fields["caption"], 2200)
    if platform == "youtube":
        fields["title"] = _truncate(fields["title"], 100)
        ch = _chapters(context.get("highlights") or [])
        if ch and "Chapters" not in fields["description"]:
            fields["description"] = f"{fields['description']}\n\n📌 Chapters:\n{ch}"
        fields["description"] = _truncate(fields["description"], 5000)

    return [
        {"id": f"{platform}-{t}", "type": t, "platform": platform, "tone": tone, "variant": variant, "content": fields[t]}
        for t in types
        if t in fields
    ]


# --------------------------------------------------------------------------- #
# audience personalisation                                                     #
# --------------------------------------------------------------------------- #

AUDIENCE_GUIDE = {
    "student": "students and beginners: simple words, no jargon, step-by-step, study-friendly",
    "professional": "working professionals and decision makers: strategic, concise, focused on outcomes and implications",
    "general": "a general audience: accessible, curiosity-driven, why it matters in everyday life",
}


class _Audience(BaseModel):
    audience_type: AudienceKind
    title: str
    description: str
    caption: str
    hashtags: list[str]


class _AudienceOut(BaseModel):
    variations: list[_Audience]


def generate_audience(*, context: dict, audiences: list[dict], language: str, variant: int) -> list[dict]:
    if not audiences:
        return []
    lang = language_name(language) if len(language) <= 3 else language
    wanted = "\n".join(
        f"- audience_type '{a['audienceType']}' for {AUDIENCE_GUIDE.get(a['audienceType'], a['audienceType'])}; tone: {TONE_GUIDE.get(a.get('tone', ''), a.get('tone', ''))}"
        for a in audiences
    )
    system = "You adapt video publishing copy for different audiences and languages. " + GROUNDING
    prompt = (
        f"Write one variation for each audience below, entirely in {lang} (natural, native-sounding {lang}; keep hashtags in "
        f"{lang} or English as creators in that language normally would):\n{wanted}\n\n"
        "For each: title (≤ 80 characters), description (2–3 sentences), caption (1–2 sentences, social-ready), "
        "hashtags (3–6 single-word #Tags). "
        f"This is variation #{variant + 1}; take a fresh angle."
    )
    out = generate_json(system=system, prompt=prompt, schema=_AudienceOut, context=context_block(context), effort="low", max_tokens=5000)
    by_type = {v.audience_type: v for v in out.variations}
    result = []
    for a in audiences:
        v = by_type.get(a["audienceType"])
        if v is None:
            continue
        result.append(
            {
                "id": f"aud-{a['audienceType']}",
                "audienceType": a["audienceType"],
                "language": language,
                "tone": a.get("tone", "professional"),
                "variant": variant,
                "title": _truncate(v.title, 120),
                "description": v.description.strip(),
                "caption": v.caption.strip(),
                "hashtags": _hashtag_list(v.hashtags, 6),
            }
        )
    return result

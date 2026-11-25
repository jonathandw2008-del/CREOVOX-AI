"""Burned-in subtitles without libass.

Each cue is drawn with Pillow onto a full-frame transparent PNG that mirrors drawSubtitle()
in src/lib/media.ts. The PNGs are stitched into one overlay stream with an ffconcat list
(blank frames fill the gaps), so a clip with any number of cues needs a single extra input.
"""
from __future__ import annotations

import logging
import math
import re
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.config import SERVER_DIR

log = logging.getLogger("creovox.burnin")

FONTS_DIR = SERVER_DIR / "assets" / "fonts"
FONT_FILES = {
    "inter": "Inter.ttf",
    "space grotesk": "SpaceGrotesk.ttf",
    "instrument serif": "InstrumentSerif-Regular.ttf",
    "monospace": "JetBrainsMono.ttf",
    "jetbrains mono": "JetBrainsMono.ttf",
}

Color = tuple[int, int, int, int]


# --------------------------------------------------------------------------- colours / fonts


def parse_color(value: str | None, default: Color | None = (255, 255, 255, 255)) -> Color | None:
    """CSS-ish colour → RGBA. Returns None for 'transparent'."""
    if not value:
        return default
    v = value.strip().lower()
    if v in ("transparent", "none"):
        return None
    named = {"white": (255, 255, 255, 255), "black": (0, 0, 0, 255)}
    if v in named:
        return named[v]
    if v.startswith("#"):
        h = v[1:]
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        try:
            if len(h) == 6:
                return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255
            if len(h) == 8:
                return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16)
        except ValueError:
            return default
        return default
    m = re.match(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)", v)
    if m:
        r, g, b = (max(0, min(255, int(float(x)))) for x in m.group(1, 2, 3))
        a_raw = m.group(4)
        if a_raw is None:
            a = 255
        elif a_raw.endswith("%"):
            a = int(max(0.0, min(100.0, float(a_raw[:-1]))) / 100 * 255 + 0.5)
        else:
            a = int(max(0.0, min(1.0, float(a_raw))) * 255 + 0.5)
        return r, g, b, a
    return default


@lru_cache(maxsize=64)
def load_font(family: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    name = FONT_FILES.get((family or "").strip().strip("'\"").lower(), "Inter.ttf")
    path = FONTS_DIR / name
    try:
        font = ImageFont.truetype(str(path), size)
    except OSError:
        log.warning("Font %s missing; using Pillow's default font", path)
        return ImageFont.load_default(size=size)
    # Variable fonts: render at weight ~600 like the browser preview.
    try:
        axes = font.get_variation_axes()
        values = []
        for ax in axes:
            axis_name = ax.get("name", b"")
            axis_name = axis_name.decode() if isinstance(axis_name, bytes) else str(axis_name)
            default = ax.get("default", ax.get("minimum", 0))
            if axis_name.lower().startswith("weight"):
                values.append(max(ax["minimum"], min(ax["maximum"], 600)))
            else:
                values.append(default)
        if values:
            font.set_variation_by_axes(values)
    except (OSError, AttributeError, KeyError):
        pass  # static font
    return font


# --------------------------------------------------------------------------- layout


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        test = f"{line} {word}" if line else word
        if draw.textlength(test, font=font) > max_width and line:
            lines.append(line)
            line = word
        else:
            line = test
    if line:
        lines.append(line)
    # Scripts without spaces (e.g. Chinese/Japanese): break long lines by characters.
    out: list[str] = []
    for ln in lines:
        if draw.textlength(ln, font=font) <= max_width:
            out.append(ln)
            continue
        cur = ""
        for ch in ln:
            if draw.textlength(cur + ch, font=font) > max_width and cur:
                out.append(cur)
                cur = ch
            else:
                cur += ch
        if cur:
            out.append(cur)
    return out


def render_cue_png(text: str, style: dict, width: int, height: int, out: Path) -> Path:
    """Draw one cue like drawSubtitle() (src/lib/media.ts) on a transparent full-frame PNG."""
    font_size = float(style.get("fontSize", 24) or 24)
    size = max(8, math.floor(font_size / 720 * height * 1.25 + 0.5))
    font = load_font(str(style.get("fontFamily", "Inter")), size)
    color = parse_color(style.get("color"), (255, 255, 255, 255)) or (255, 255, 255, 255)
    bg = parse_color(style.get("backgroundColor"), (0, 0, 0, 178))
    position = style.get("position", "bottom")

    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    lines = _wrap(draw, text, font, width * 0.86)
    lh = size * 1.3
    block_h = len(lines) * lh
    if position == "top":
        y0 = height * 0.08
    elif position == "center":
        y0 = (height - block_h) / 2
    else:
        y0 = height * 0.92 - block_h

    stroke = 0 if bg else max(1, size // 16)
    for i, line in enumerate(lines):
        y = y0 + i * lh + lh / 2
        if bg:
            tw = draw.textlength(line, font=font)
            draw.rectangle(
                [round(width / 2 - tw / 2 - size * 0.4), round(y - lh / 2), round(width / 2 + tw / 2 + size * 0.4), round(y + lh / 2)],
                fill=bg,
            )
        draw.text((width / 2, y), line, font=font, fill=color, anchor="mm", stroke_width=stroke, stroke_fill=(0, 0, 0, 170) if stroke else None)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, format="PNG", compress_level=3)
    return out


def build_overlay_track(
    segments: list[dict],
    style: dict,
    width: int,
    height: int,
    work_dir: Path,
    *,
    clip_start: float,
    clip_end: float,
) -> Path | None:
    """Write cue PNGs + an ffconcat list covering [clip_start, clip_end). Returns the list path, or None if no cue overlaps."""
    duration = max(0.1, clip_end - clip_start)
    cues: list[tuple[float, float, str]] = []
    for s in sorted(segments, key=lambda s: float(s["startTime"])):
        a = max(0.0, float(s["startTime"]) - clip_start)
        b = min(duration, float(s["endTime"]) - clip_start)
        text = " ".join(str(s.get("text", "")).split())
        if b - a >= 0.05 and text:
            cues.append((a, b, text))
    if not cues:
        return None
    # Resolve overlaps: a cue ends where the next begins.
    for i in range(len(cues) - 1):
        a, b, t = cues[i]
        if b > cues[i + 1][0]:
            cues[i] = (a, max(a + 0.05, cues[i + 1][0]), t)

    work_dir.mkdir(parents=True, exist_ok=True)
    blank = work_dir / "blank.png"
    Image.new("RGBA", (width, height), (0, 0, 0, 0)).save(blank, format="PNG")

    entries: list[tuple[str, float]] = []
    t = 0.0
    for i, (a, b, text) in enumerate(cues):
        if a > t + 0.001:
            entries.append((blank.name, a - t))
        png = render_cue_png(text, style, width, height, work_dir / f"cue_{i + 1:04d}.png")
        entries.append((png.name, b - max(a, t)))
        t = b
    entries.append((blank.name, max(0.1, duration - t + 1.0)))

    lines = ["ffconcat version 1.0"]
    for name, dur in entries:
        lines += [f"file '{name}'", f"duration {max(0.001, dur):.3f}"]
    lines.append(f"file '{blank.name}'")  # concat demuxer ignores the last entry's duration
    listing = work_dir / "overlay.ffconcat"
    listing.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return listing

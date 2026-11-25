"""Download the OFL fonts used for burned-in subtitles into server/assets/fonts.

Run: uv run python scripts/fetch_fonts.py
Fonts are licensed under the SIL Open Font License (https://openfontlicense.org).
"""
from __future__ import annotations

import sys
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
FONTS = {
    "Inter.ttf": "inter/Inter[opsz,wght].ttf",
    "SpaceGrotesk.ttf": "spacegrotesk/SpaceGrotesk[wght].ttf",
    "InstrumentSerif-Regular.ttf": "instrumentserif/InstrumentSerif-Regular.ttf",
    "JetBrainsMono.ttf": "jetbrainsmono/JetBrainsMono[wght].ttf",
}
OUT = Path(__file__).resolve().parent.parent / "assets" / "fonts"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    failed = 0
    for name, rel in FONTS.items():
        dest = OUT / name
        if dest.exists() and dest.stat().st_size > 10_000:
            print(f"ok      {name} (already present)")
            continue
        url = BASE + urllib.parse.quote(rel)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "creovox-font-fetch"}), timeout=60) as r:
                data = r.read()
            if len(data) < 10_000 or data[:4] not in (b"\x00\x01\x00\x00", b"true", b"OTTO"):
                raise ValueError("not a TrueType/OpenType file")
            dest.write_bytes(data)
            print(f"fetched {name} ({len(data) // 1024} KB)")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"FAILED  {name}: {e}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

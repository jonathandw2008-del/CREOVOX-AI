"""Language codes offered by the studio (keep in sync with LANGUAGES in src/data/mockData.ts)."""
from __future__ import annotations

LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "ta": "Tamil",
    "hi": "Hindi",
    "te": "Telugu",
    "ml": "Malayalam",
    "kn": "Kannada",
    "bn": "Bengali",
    "mr": "Marathi",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
}


def language_name(code: str | None) -> str:
    if not code:
        return "English"
    return LANGUAGE_NAMES.get(code.lower().split("-")[0], code)

"""Request models for AI and job endpoints (mirror src/lib/api.ts)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.project import AudienceType, ContentType, Platform, Tone


class _In(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CtxSegment(_In):
    startTime: float
    endTime: float
    text: str = Field(max_length=5000)


class CtxHighlight(_In):
    startTime: float
    endTime: float
    title: str = Field(max_length=300)
    description: str | None = Field(default=None, max_length=2000)


class AIContextIn(_In):
    title: str = Field(max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    duration: float = 0
    language: str | None = Field(default=None, max_length=20)
    transcript: list[CtxSegment] = Field(default_factory=list, max_length=6000)
    highlights: list[CtxHighlight] = Field(default_factory=list, max_length=200)


class ContentRequest(_In):
    context: AIContextIn
    platform: Platform
    tone: Tone
    types: list[ContentType] = Field(min_length=1, max_length=4)
    variant: int = Field(default=0, ge=0, le=1000)
    previous: list[str] | None = Field(default=None, max_length=20)


class AudienceSpec(_In):
    audienceType: AudienceType
    tone: Tone


class AudienceRequest(_In):
    context: AIContextIn
    audiences: list[AudienceSpec] = Field(min_length=1, max_length=3)
    language: str = Field(default="English", max_length=40)
    variant: int = Field(default=0, ge=0, le=1000)


class SegmentIn(_In):
    id: str = Field(max_length=100)
    startTime: float
    endTime: float
    text: str = Field(max_length=2000)


class TranslateRequest(_In):
    projectId: str | None = None
    segments: list[SegmentIn] = Field(min_length=1, max_length=5000)
    sourceLanguage: str = Field(default="en", max_length=20)
    targetLanguage: str = Field(max_length=20)
    targetLanguageName: str = Field(max_length=60)


class AnalyzeRequest(_In):
    language: str | None = Field(default=None, max_length=20)


class RenderRequest(_In):
    clipIds: list[str] = Field(min_length=1, max_length=100)
    resolution: Literal["1080p", "720p", "480p"] = "720p"
    format: Literal["mp4", "webm"] = "mp4"
    burnInSubtitles: bool = False
    subtitleLanguage: str | None = Field(default=None, max_length=20)


class PackageOptionsIn(_In):
    includeClips: bool = False
    includeSubtitles: bool = True
    includeThumbnail: bool = True
    includeContent: bool = True
    clipIds: list[str] | None = Field(default=None, max_length=100)
    resolution: Literal["1080p", "720p", "480p"] = "720p"
    format: Literal["mp4", "webm"] = "mp4"
    burnInSubtitles: bool = False
    subtitleLanguage: str | None = Field(default=None, max_length=20)


class ActivityIn(_In):
    text: str = Field(min_length=1, max_length=500)
    kind: Literal["create", "process", "edit", "export", "delete"]
    projectId: str | None = Field(default=None, max_length=32)

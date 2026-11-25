"""Pydantic mirror of the frontend `Project` type (src/types/index.ts).

Models are lenient (`extra="allow"`) so newer frontend fields survive a round trip,
but the parts the server relies on are type-checked.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

AspectRatio = Literal["16:9", "9:16", "1:1"]
ProjectStatus = Literal["uploading", "processing", "ready", "completed"]
HighlightCategory = Literal["key-moment", "quote", "topic-change", "engagement-peak"]
ThumbnailStyle = Literal["bold", "minimal", "cinematic", "editorial"]
ContentType = Literal["title", "description", "caption", "hashtags"]
Platform = Literal["youtube", "instagram", "tiktok", "twitter", "linkedin", "facebook"]
Tone = Literal["professional", "casual", "educational", "entertaining", "inspirational"]
AudienceType = Literal["student", "professional", "general"]


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="allow")


class VideoFile(Camel):
    name: str
    size: int
    type: str
    duration: float
    width: int
    height: int
    storage_key: str
    persisted: bool = True
    asset_id: str | None = None


class TranscriptSegment(Camel):
    id: str
    start_time: float
    end_time: float
    text: str
    speaker: str | None = None


class Highlight(Camel):
    id: str
    start_time: float
    end_time: float
    title: str
    description: str = ""
    confidence: float = 0.8
    selected: bool = False
    category: HighlightCategory = "key-moment"


class Clip(Camel):
    id: str
    start_time: float
    end_time: float
    title: str
    description: str = ""
    selected: bool = True
    aspect_ratio: AspectRatio = "16:9"
    highlight_id: str | None = None


class SubtitleSegment(Camel):
    id: str
    start_time: float
    end_time: float
    text: str


class SubtitleTrack(Camel):
    id: str
    language: str
    language_code: str
    segments: list[SubtitleSegment] = Field(default_factory=list)
    simulated: bool | None = None


class SubtitleStyle(Camel):
    font_family: str = "Inter"
    font_size: float = 24
    color: str = "#FFFFFF"
    background_color: str = "rgba(0,0,0,0.7)"
    position: Literal["top", "center", "bottom"] = "bottom"


class TextPosition(BaseModel):
    model_config = ConfigDict(extra="allow")
    x: float
    y: float


class ThumbnailDesign(Camel):
    id: str
    title: str
    text_overlay: str
    font_size: float
    font_family: str
    text_color: str
    text_position: TextPosition
    background_color: str
    style: ThumbnailStyle
    background_image: str | None = None
    overlay: float = 0.4


class ContentOutput(Camel):
    id: str
    type: ContentType
    platform: Platform
    tone: Tone
    content: str
    variant: int = 0


class AudienceVariation(Camel):
    id: str
    audience_type: AudienceType
    language: str
    tone: Tone
    title: str
    description: str
    caption: str
    hashtags: list[str] = Field(default_factory=list)
    variant: int = 0


class ExportConfig(Camel):
    format: Literal["webm", "mp4"] = "mp4"
    resolution: Literal["1080p", "720p", "480p"] = "720p"
    aspect_ratio: AspectRatio = "16:9"
    include_subtitles: bool = True
    burn_in_subtitles: bool = False
    subtitle_language: str = "en"
    include_thumbnail: bool = True
    include_content: bool = True


class ProjectDoc(Camel):
    """Everything about a project except the columns kept on the row (id, title, status, timestamps)."""

    description: str = ""
    duration: float = 0
    video_file: VideoFile | None = None
    thumbnail: str | None = None
    waveform: list[float] | None = None
    waveform_is_real: bool | None = None
    transcript: list[TranscriptSegment] = Field(default_factory=list)
    transcript_language: str | None = None
    highlights: list[Highlight] = Field(default_factory=list)
    clips: list[Clip] = Field(default_factory=list)
    subtitles: list[SubtitleTrack] = Field(default_factory=list)
    subtitle_style: SubtitleStyle = Field(default_factory=SubtitleStyle)
    thumbnails: list[ThumbnailDesign] = Field(default_factory=list)
    active_thumbnail_id: str | None = None
    content: list[ContentOutput] = Field(default_factory=list)
    audience_variations: list[AudienceVariation] = Field(default_factory=list)
    export_config: ExportConfig = Field(default_factory=ExportConfig)
    completed_steps: list[str] = Field(default_factory=list)
    exported_at: str | None = None
    ai_source: dict[str, str] | None = None


# Fields that live on the DB row, or that only the server may set.
ROW_FIELDS = {"id", "title", "status", "createdAt", "updatedAt", "version", "isDemo"}
SERVER_FIELDS = {"videoFile"}


def parse_doc(data: dict) -> dict:
    """Validate a project document and return its canonical JSON form."""
    body = {k: v for k, v in data.items() if k not in ROW_FIELDS}
    return ProjectDoc.model_validate(body).model_dump(by_alias=True, exclude_none=True, mode="json")


class ProjectIn(BaseModel):
    project: dict


class ProjectUpdateIn(BaseModel):
    project: dict
    version: int

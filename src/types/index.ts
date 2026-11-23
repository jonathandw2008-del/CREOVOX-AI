/** ISO-8601 timestamp string (safe to persist in localStorage). */
export type ISODate = string

export type ProjectStatus = 'uploading' | 'processing' | 'ready' | 'completed'

export type WorkflowStep =
  | 'upload'
  | 'process'
  | 'transcript'
  | 'highlights'
  | 'editor'
  | 'subtitles'
  | 'thumbnails'
  | 'content'
  | 'audience'
  | 'export'

export interface Project {
  id: string
  title: string
  description: string
  status: ProjectStatus
  createdAt: ISODate
  updatedAt: ISODate
  /** Seconds. */
  duration: number
  isDemo?: boolean
  videoFile?: VideoFile
  /** Small JPEG data URL captured from the real video (or undefined for demo projects). */
  thumbnail?: string
  /** Normalised 0–1 audio peaks extracted locally with Web Audio. */
  waveform?: number[]
  /** True when the waveform came from the real audio track. */
  waveformIsReal?: boolean
  transcript: TranscriptSegment[]
  highlights: Highlight[]
  clips: Clip[]
  subtitles: SubtitleTrack[]
  subtitleStyle: SubtitleStyle
  thumbnails: ThumbnailDesign[]
  activeThumbnailId?: string
  content: ContentOutput[]
  audienceVariations: AudienceVariation[]
  exportConfig: ExportConfig
  completedSteps: WorkflowStep[]
  exportedAt?: ISODate
}

export interface VideoFile {
  name: string
  size: number
  type: string
  duration: number
  width: number
  height: number
  /** IndexedDB key of the stored Blob. Shared between duplicated projects. */
  storageKey: string
  /** False if the browser refused to persist the file (quota/private mode). */
  persisted: boolean
}

export type AspectRatio = '16:9' | '9:16' | '1:1'

export interface Clip {
  id: string
  startTime: number
  endTime: number
  title: string
  description: string
  selected: boolean
  aspectRatio: AspectRatio
  highlightId?: string
}

export interface TranscriptSegment {
  id: string
  startTime: number
  endTime: number
  text: string
  speaker?: string
}

export type HighlightCategory = 'key-moment' | 'quote' | 'topic-change' | 'engagement-peak'

export interface Highlight {
  id: string
  startTime: number
  endTime: number
  title: string
  description: string
  confidence: number
  selected: boolean
  category: HighlightCategory
}

export interface SubtitleTrack {
  id: string
  language: string
  languageCode: string
  segments: SubtitleSegment[]
  /** Text was not really translated — it is a simulated placeholder. */
  simulated?: boolean
}

export interface SubtitleSegment {
  id: string
  startTime: number
  endTime: number
  text: string
}

export interface SubtitleStyle {
  fontFamily: string
  fontSize: number
  color: string
  backgroundColor: string
  position: 'top' | 'center' | 'bottom'
}

export type ThumbnailStyle = 'bold' | 'minimal' | 'cinematic' | 'editorial'

export interface ThumbnailDesign {
  id: string
  title: string
  textOverlay: string
  fontSize: number
  fontFamily: string
  textColor: string
  textPosition: { x: number; y: number }
  backgroundColor: string
  style: ThumbnailStyle
  /** Optional JPEG data URL of a captured video frame. */
  backgroundImage?: string
  /** Darkening overlay 0–1 applied over the background image. */
  overlay: number
}

export type ContentType = 'title' | 'description' | 'caption' | 'hashtags'

export interface ContentOutput {
  id: string
  type: ContentType
  platform: Platform
  tone: Tone
  content: string
  /** Incremented on regenerate to rotate template variants. */
  variant: number
}

export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'linkedin' | 'facebook'
export type Tone = 'professional' | 'casual' | 'educational' | 'entertaining' | 'inspirational'
export type AudienceType = 'student' | 'professional' | 'general'

export interface AudienceVariation {
  id: string
  audienceType: AudienceType
  language: string
  tone: Tone
  title: string
  description: string
  caption: string
  hashtags: string[]
  variant: number
}

export type ExportFormat = 'webm' | 'mp4'

export interface ExportConfig {
  format: ExportFormat
  resolution: '1080p' | '720p' | '480p'
  aspectRatio: AspectRatio
  includeSubtitles: boolean
  burnInSubtitles: boolean
  subtitleLanguage: string
  includeThumbnail: boolean
  includeContent: boolean
}

export interface ActivityEntry {
  id: string
  text: string
  at: ISODate
  kind: 'create' | 'process' | 'edit' | 'export' | 'delete'
  projectId?: string
}

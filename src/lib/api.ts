/**
 * Typed client for the CREOVOX backend (FastAPI, proxied at /api by Vite).
 * All requests send the httpOnly session cookie. A 401 marks the user signed out.
 */
import type { AudienceType, AudienceVariation, ContentOutput, ContentType, Platform, Project, SubtitleSegment, ThumbnailDesign, Tone } from '@/types'

export interface ApiErrorBody {
  code: string
  message: string
  [k: string]: unknown
}

export class ApiError extends Error {
  status: number
  code: string
  body: ApiErrorBody
  constructor(status: number, body: ApiErrorBody) {
    super(body.message || `Request failed (${status})`)
    this.status = status
    this.code = body.code || 'error'
    this.body = body
  }
}

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null
/** Registered by the auth store so any 401 signs the user out of the UI. */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = { code: 'error', message: res.statusText || 'Request failed' }
  try {
    const data = await res.json()
    if (data?.error) body = data.error
  } catch {
    /* non-JSON */
  }
  return new ApiError(res.status, body)
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new ApiError(0, { code: 'network', message: 'Cannot reach the CREOVOX server. Is the backend running?' })
  }
  if (!res.ok) {
    const err = await parseError(res)
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.()
    throw err
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Upload a raw body with progress (fetch has no upload progress). */
export function uploadWithProgress<T>(path: string, body: Blob, opts: { method?: string; headers?: Record<string, string>; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(opts.method ?? 'PUT', `/api${path}`)
    xhr.withCredentials = true
    Object.entries(opts.headers ?? {}).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total)
    xhr.onload = () => {
      let data: unknown = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T)
      else {
        const body = (data as { error?: ApiErrorBody } | null)?.error ?? { code: 'error', message: `Upload failed (${xhr.status})` }
        if (xhr.status === 401) onUnauthorized?.()
        reject(new ApiError(xhr.status, body))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, { code: 'network', message: 'Upload failed: cannot reach the server.' }))
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    opts.signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(body)
  })
}

/* ------------------------------- auth ------------------------------- */

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  createdAt: string
}
export interface AuthConfig {
  googleClientId: string | null
  googleEnabled: boolean
  emailEnabled: boolean
  devMailer: boolean
}

export const authApi = {
  config: () => api<AuthConfig>('/auth/config'),
  me: () => api<User>('/auth/me'),
  google: (credential: string) => api<User>('/auth/google', { method: 'POST', json: { credential } }),
  emailStart: (email: string) => api<{ ok: true; expiresIn: number; resendIn: number; devMailer: boolean }>('/auth/email/start', { method: 'POST', json: { email } }),
  emailVerify: (email: string, code: string) => api<User>('/auth/email/verify', { method: 'POST', json: { email, code } }),
  logout: () => api<{ ok: true }>('/auth/logout', { method: 'POST' }),
}

/* ----------------------------- projects ----------------------------- */

export const projectsApi = {
  list: () => api<Project[]>('/projects'),
  get: (id: string) => api<Project>(`/projects/${id}`),
  /** Create from a client-built project (blank or imported). Server assigns id/timestamps/version. */
  create: (project: Partial<Project>) => api<Project>('/projects', { method: 'POST', json: { project } }),
  /** Full replace. 409 `version_conflict` (body.project = current server copy) when `version` is stale. */
  update: (project: Project, version: number) => api<Project>(`/projects/${project.id}`, { method: 'PUT', json: { project, version } }),
  remove: (id: string) => api<{ ok: true }>(`/projects/${id}`, { method: 'DELETE' }),
  duplicate: (id: string) => api<Project>(`/projects/${id}/duplicate`, { method: 'POST' }),
  /** Streams the raw file. `meta` (read in the browser) is a fallback for servers without ffprobe. */
  uploadVideo: (id: string, file: File, meta?: { duration: number; width: number; height: number }, onProgress?: (f: number) => void, signal?: AbortSignal) =>
    uploadWithProgress<Project>(`/projects/${id}/video`, file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        ...(meta ? { 'X-Video-Duration': String(meta.duration), 'X-Video-Width': String(meta.width), 'X-Video-Height': String(meta.height) } : {}),
      },
      onProgress,
      signal,
    }),
  videoUrl: (id: string) => `/api/projects/${id}/video`,
}

/* ------------------------------- jobs ------------------------------- */

export type JobType = 'analyze' | 'translate' | 'thumbnails' | 'render' | 'package'
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
export interface Job<R = Record<string, unknown>> {
  id: string
  type: JobType
  projectId: string | null
  status: JobStatus
  /** analyze: waveform | transcribe | highlights | workspace. Others: free text. */
  stage: string
  progress: number
  error: string | null
  result: R | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}
export interface RenderFile {
  index: number
  clipId: string
  name: string
  size: number
}
export interface RenderOptions {
  clipIds: string[]
  resolution: '1080p' | '720p' | '480p'
  format: 'mp4' | 'webm'
  burnInSubtitles: boolean
  subtitleLanguage?: string
}
export interface PackageOptions {
  includeClips: boolean
  includeSubtitles: boolean
  includeThumbnail: boolean
  includeContent: boolean
  clipIds?: string[]
  resolution?: RenderOptions['resolution']
  format?: RenderOptions['format']
  burnInSubtitles?: boolean
  subtitleLanguage?: string
}

export const jobsApi = {
  get: <R = Record<string, unknown>>(id: string) => api<Job<R>>(`/jobs/${id}`),
  listForProject: (projectId: string, activeOnly = false) => api<Job[]>(`/jobs?projectId=${encodeURIComponent(projectId)}${activeOnly ? '&active=1' : ''}`),
  cancel: (id: string) => api<Job>(`/jobs/${id}/cancel`, { method: 'POST' }),
  analyze: (projectId: string, language?: string) => api<Job>(`/projects/${projectId}/analyze`, { method: 'POST', json: { language: language || null } }),
  /** Works for any project (incl. local demos): segments are sent in the body. */
  translate: (body: { projectId?: string | null; segments: SubtitleSegment[]; sourceLanguage: string; targetLanguage: string; targetLanguageName: string }) =>
    api<Job<{ segments: SubtitleSegment[]; languageCode: string; language: string }>>('/jobs/translate', { method: 'POST', json: body }),
  thumbnails: (projectId: string) => api<Job<{ designs: ThumbnailDesign[]; ai: boolean }>>(`/projects/${projectId}/thumbnails/suggest`, { method: 'POST' }),
  render: (projectId: string, opts: RenderOptions) => api<Job<{ files: RenderFile[] }>>(`/projects/${projectId}/render`, { method: 'POST', json: opts }),
  /** multipart: `options` (JSON string) + `thumbnails` (PNG files rendered by the browser canvas). */
  package: (projectId: string, opts: PackageOptions, thumbnails: { name: string; blob: Blob }[]) => {
    const form = new FormData()
    form.append('options', JSON.stringify(opts))
    thumbnails.forEach((t) => form.append('thumbnails', t.blob, t.name))
    return api<Job<{ file: { name: string; size: number } }>>(`/projects/${projectId}/package`, { method: 'POST', body: form })
  },
  /** Download URL for a job output: render → index of `files`, package → 0. */
  fileUrl: (jobId: string, index = 0) => `/api/jobs/${jobId}/files/${index}`,
}

/** Poll a job until it finishes. Resolves on success, rejects with ApiError on failure/cancel. */
export async function pollJob<R>(id: string, onUpdate?: (job: Job<R>) => void, opts: { intervalMs?: number; signal?: AbortSignal } = {}): Promise<Job<R>> {
  const interval = opts.intervalMs ?? 1000
  for (;;) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const job = await jobsApi.get<R>(id)
    onUpdate?.(job)
    if (job.status === 'succeeded') return job
    if (job.status === 'failed') throw new ApiError(500, { code: 'job_failed', message: job.error || 'Processing failed.' })
    if (job.status === 'canceled') throw new ApiError(499, { code: 'job_canceled', message: 'Canceled.' })
    await new Promise((r) => setTimeout(r, interval))
  }
}

/* -------------------------------- AI -------------------------------- */

/** Compact project context sent to stateless AI endpoints (works for demo projects too). */
export interface AIContext {
  title: string
  description?: string
  duration: number
  language?: string
  transcript: { startTime: number; endTime: number; text: string }[]
  highlights: { startTime: number; endTime: number; title: string; description?: string }[]
}

export function aiContext(p: Project): AIContext {
  return {
    title: p.title,
    description: p.description,
    duration: p.duration,
    language: p.transcriptLanguage,
    transcript: p.transcript.map(({ startTime, endTime, text }) => ({ startTime, endTime, text })),
    highlights: p.highlights.map(({ startTime, endTime, title, description }) => ({ startTime, endTime, title, description })),
  }
}

export interface AIStatus {
  enabled: boolean
  provider: string | null
}

export const aiApi = {
  status: () => api<AIStatus>('/ai/status'),
  /** 503 `ai_unavailable` when no AI provider is configured → caller falls back to local templates. */
  content: (body: { context: AIContext; platform: Platform; tone: Tone; types: ContentType[]; variant: number; previous?: string[] }) =>
    api<{ items: ContentOutput[] }>('/ai/content', { method: 'POST', json: body }),
  audience: (body: { context: AIContext; audiences: { audienceType: AudienceType; tone: Tone }[]; language: string; variant: number }) =>
    api<{ variations: AudienceVariation[] }>('/ai/audience', { method: 'POST', json: body }),
}

export const activityApi = {
  list: () => api<{ id: string; text: string; at: string; kind: 'create' | 'process' | 'edit' | 'export' | 'delete'; projectId?: string }[]>('/activity'),
  log: (text: string, kind: string, projectId?: string) => api<{ ok: true }>('/activity', { method: 'POST', json: { text, kind, projectId } }),
}

export const isAiUnavailable = (e: unknown) => e instanceof ApiError && (e.code === 'ai_unavailable' || e.status === 503)

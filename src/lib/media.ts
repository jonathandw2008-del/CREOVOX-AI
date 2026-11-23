/**
 * Genuine browser-side media utilities. Nothing here leaves the device.
 */
import type { AspectRatio, SubtitleSegment, SubtitleStyle } from '@/types'
import { activeSegmentAt } from './subtitles'

/* ------------------------------------------------------------------ */
/* IndexedDB video storage                                             */
/* ------------------------------------------------------------------ */

const DB_NAME = 'creovox-media'
const STORE = 'videos'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.oncomplete = () => db.close()
  })
}

export async function saveVideoBlob(key: string, blob: Blob): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.put(blob, key))
    return true
  } catch {
    return false
  }
}

export async function loadVideoBlob(key: string): Promise<Blob | null> {
  try {
    const res = await tx<Blob | undefined>('readonly', (s) => s.get(key) as IDBRequest<Blob | undefined>)
    return res ?? null
  } catch {
    return null
  }
}

export async function deleteVideoBlob(key: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(key))
  } catch {
    /* ignore */
  }
}

/** Session cache of object URLs so we never create duplicates for one blob. */
const urlCache = new Map<string, string>()
const blobCache = new Map<string, Blob>()

export function getCachedBlob(key: string) {
  return blobCache.get(key)
}

/** Returns the blob from the session cache, falling back to IndexedDB. */
export async function getVideoBlob(key: string): Promise<Blob | null> {
  return blobCache.get(key) ?? (await loadVideoBlob(key))
}

export function cacheVideoUrl(key: string, blob: Blob): string {
  blobCache.set(key, blob)
  const existing = urlCache.get(key)
  if (existing) return existing
  const url = URL.createObjectURL(blob)
  urlCache.set(key, url)
  return url
}

export function getCachedVideoUrl(key: string) {
  return urlCache.get(key)
}

export function forgetVideoUrl(key: string) {
  const u = urlCache.get(key)
  if (u) URL.revokeObjectURL(u)
  urlCache.delete(key)
  blobCache.delete(key)
}

/* ------------------------------------------------------------------ */
/* Metadata, poster frames                                             */
/* ------------------------------------------------------------------ */

export interface VideoMeta {
  duration: number
  width: number
  height: number
}

export function readVideoMeta(url: string): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.playsInline = true
    const done = () => {
      const meta = { duration: v.duration, width: v.videoWidth, height: v.videoHeight }
      v.removeAttribute('src')
      v.load()
      if (!Number.isFinite(meta.duration)) reject(new Error('Could not read video duration.'))
      else resolve(meta)
    }
    v.onloadedmetadata = () => {
      // Some containers (webm from MediaRecorder) report Infinity until seeked.
      if (v.duration === Infinity) {
        v.currentTime = 1e7
        v.ontimeupdate = () => {
          v.ontimeupdate = null
          done()
        }
      } else done()
    }
    v.onerror = () => reject(new Error('This browser cannot decode the selected video.'))
    v.src = url
  })
}

function seek(v: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    const onSeeked = () => {
      v.removeEventListener('seeked', onSeeked)
      resolve()
    }
    v.addEventListener('seeked', onSeeked)
    v.currentTime = time
  })
}

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, dw: number, dh: number) {
  const scale = Math.max(dw / sw, dh / sh)
  const w = sw * scale
  const h = sh * scale
  ctx.drawImage(src, (dw - w) / 2, (dh - h) / 2, w, h)
}

/** Captures one frame from a video element as a JPEG data URL. */
export function captureFrameFromElement(v: HTMLVideoElement, width = 640, height = 360, quality = 0.72): string | null {
  if (!v.videoWidth) return null
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')
  if (!ctx) return null
  drawCover(ctx, v, v.videoWidth, v.videoHeight, width, height)
  try {
    return c.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }
}

/** Opens the video off-screen, seeks to `time`, captures a frame. */
export async function captureFrame(url: string, time: number, width = 640, height = 360): Promise<string | null> {
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve()
    v.onerror = () => reject(new Error('decode failed'))
  }).catch(() => null)
  if (!v.videoWidth) return null
  await seek(v, Math.min(time, Math.max(0, v.duration - 0.1)))
  const out = captureFrameFromElement(v, width, height)
  v.removeAttribute('src')
  v.load()
  return out
}

/* ------------------------------------------------------------------ */
/* Waveform                                                            */
/* ------------------------------------------------------------------ */

const MAX_DECODE_BYTES = 250 * 1024 * 1024

/**
 * Decodes the audio track locally and returns `buckets` normalised RMS peaks.
 * Returns null if the file is too large, has no audio, or can't be decoded.
 */
export async function extractWaveform(blob: Blob, buckets = 240): Promise<number[] | null> {
  if (blob.size > MAX_DECODE_BYTES) return null
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  const ctx = new Ctx()
  try {
    const buf = await blob.arrayBuffer()
    const audio = await new Promise<AudioBuffer>((resolve, reject) => {
      // Callback form for older Safari.
      const p = ctx.decodeAudioData(buf, resolve, reject)
      if (p && typeof p.then === 'function') p.then(resolve, reject)
    })
    const data = audio.getChannelData(0)
    const size = Math.floor(data.length / buckets) || 1
    const peaks: number[] = []
    for (let b = 0; b < buckets; b++) {
      let sum = 0
      const start = b * size
      const end = Math.min(start + size, data.length)
      const step = Math.max(1, Math.floor((end - start) / 2000))
      let n = 0
      for (let i = start; i < end; i += step) {
        sum += data[i] * data[i]
        n++
      }
      peaks.push(Math.sqrt(sum / Math.max(1, n)))
    }
    const max = Math.max(...peaks, 1e-6)
    if (max < 1e-4) return null // silent track
    return peaks.map((p) => Math.round((p / max) * 100) / 100)
  } catch {
    return null
  } finally {
    ctx.close().catch(() => undefined)
  }
}

/** Deterministic pseudo waveform for demo projects that have no audio. */
export function syntheticWaveform(seed: string, buckets = 240): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const rand = () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 1000) / 1000
  }
  const out: number[] = []
  for (let i = 0; i < buckets; i++) {
    const env = 0.45 + 0.35 * Math.sin(i / 9) + 0.2 * Math.sin(i / 3.3)
    out.push(Math.round(Math.min(1, Math.max(0.06, env * (0.55 + rand() * 0.45))) * 100) / 100)
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Clip rendering (MediaRecorder)                                      */
/* ------------------------------------------------------------------ */

export function supportedRecordingTypes(): { format: 'webm' | 'mp4'; mime: string }[] {
  if (typeof MediaRecorder === 'undefined') return []
  const candidates: { format: 'webm' | 'mp4'; mime: string }[] = [
    { format: 'webm', mime: 'video/webm;codecs=vp9,opus' },
    { format: 'webm', mime: 'video/webm;codecs=vp8,opus' },
    { format: 'webm', mime: 'video/webm' },
    { format: 'mp4', mime: 'video/mp4;codecs=avc1,mp4a' },
    { format: 'mp4', mime: 'video/mp4' },
  ]
  const seen = new Set<string>()
  return candidates.filter((c) => {
    if (seen.has(c.format)) return false
    let ok = false
    try {
      ok = MediaRecorder.isTypeSupported(c.mime)
    } catch {
      ok = false
    }
    if (ok) seen.add(c.format)
    return ok
  })
}

export function canRenderClips() {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    supportedRecordingTypes().length > 0
  )
}

const RES_HEIGHT = { '1080p': 1080, '720p': 720, '480p': 480 } as const

export function outputSize(ratio: AspectRatio, resolution: keyof typeof RES_HEIGHT) {
  const short = RES_HEIGHT[resolution]
  if (ratio === '16:9') return { width: Math.round((short * 16) / 9 / 2) * 2, height: short }
  if (ratio === '9:16') return { width: short, height: Math.round((short * 16) / 9 / 2) * 2 }
  return { width: short, height: short }
}

export interface RenderClipOptions {
  url: string
  start: number
  end: number
  aspectRatio: AspectRatio
  resolution: '1080p' | '720p' | '480p'
  format: 'webm' | 'mp4'
  subtitles?: SubtitleSegment[]
  subtitleStyle?: SubtitleStyle
  onProgress?: (p: number) => void
  signal?: AbortSignal
}

function drawSubtitle(ctx: CanvasRenderingContext2D, text: string, style: SubtitleStyle, w: number, h: number) {
  const size = Math.round((style.fontSize / 720) * h * 1.25)
  ctx.font = `600 ${size}px "${style.fontFamily}", Inter, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const maxWidth = w * 0.86
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else line = test
  }
  if (line) lines.push(line)
  const lh = size * 1.3
  const blockH = lines.length * lh
  const y0 = style.position === 'top' ? h * 0.08 : style.position === 'center' ? (h - blockH) / 2 : h * 0.92 - blockH
  lines.forEach((l, i) => {
    const y = y0 + i * lh + lh / 2
    if (style.backgroundColor !== 'transparent') {
      const tw = ctx.measureText(l).width
      ctx.fillStyle = style.backgroundColor
      ctx.fillRect(w / 2 - tw / 2 - size * 0.4, y - lh / 2, tw + size * 0.8, lh)
    }
    ctx.fillStyle = style.color
    ctx.fillText(l, w / 2, y)
  })
}

/**
 * Renders a clip in real time: plays the source through a canvas (crop + optional
 * burned-in subtitles) and records it with MediaRecorder. Output is a real video file.
 */
export async function renderClip(opts: RenderClipOptions): Promise<Blob> {
  const types = supportedRecordingTypes()
  const type = types.find((t) => t.format === opts.format) ?? types[0]
  if (!type) throw new Error('This browser cannot record video (MediaRecorder unsupported).')

  const { width, height } = outputSize(opts.aspectRatio, opts.resolution)
  const v = document.createElement('video')
  v.src = opts.url
  v.playsInline = true
  v.preload = 'auto'
  v.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve()
    v.onerror = () => reject(new Error('Could not load the source video.'))
  })
  await seek(v, opts.start)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const stream = canvas.captureStream(30)

  // Pull the audio track from the element where supported.
  const el = v as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }
  try {
    const src = el.captureStream?.() ?? el.mozCaptureStream?.()
    src?.getAudioTracks().forEach((t) => stream.addTrack(t))
  } catch {
    /* silent clip */
  }

  const recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: height >= 1080 ? 8_000_000 : 4_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const duration = Math.max(0.1, opts.end - opts.start)
  let raf = 0

  const result = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: type.mime.split(';')[0] }))
    recorder.onerror = () => reject(new Error('Recording failed.'))
  })

  const draw = () => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
    drawCover(ctx, v, v.videoWidth, v.videoHeight, width, height)
    if (opts.subtitles && opts.subtitleStyle) {
      const seg = activeSegmentAt(opts.subtitles, v.currentTime)
      if (seg) drawSubtitle(ctx, seg.text, opts.subtitleStyle, width, height)
    }
    opts.onProgress?.(Math.min(1, (v.currentTime - opts.start) / duration))
    if (v.currentTime >= opts.end || v.ended || opts.signal?.aborted) {
      v.pause()
      if (recorder.state !== 'inactive') recorder.stop()
      return
    }
    raf = requestAnimationFrame(draw)
  }

  recorder.start(250)
  try {
    await v.play()
  } catch {
    // Autoplay with sound blocked — retry muted (clip will be silent).
    v.muted = true
    await v.play()
  }
  draw()

  try {
    const blob = await result
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return blob
  } finally {
    cancelAnimationFrame(raf)
    stream.getTracks().forEach((t) => t.stop())
    v.removeAttribute('src')
    v.load()
  }
}

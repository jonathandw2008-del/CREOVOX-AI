import type { SubtitleSegment, TranscriptSegment } from '@/types'
import { generateId } from '@/utils/helpers'

function pad(n: number, len = 2) {
  return String(n).padStart(len, '0')
}

function splitTime(t: number) {
  const totalMs = Math.max(0, Math.round(t * 1000))
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return { h, m, s, ms }
}

export function toSrtTime(t: number) {
  const { h, m, s, ms } = splitTime(t)
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

export function toVttTime(t: number) {
  const { h, m, s, ms } = splitTime(t)
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`
}

const sorted = (segs: SubtitleSegment[]) => [...segs].sort((a, b) => a.startTime - b.startTime)

export function buildSRT(segments: SubtitleSegment[]) {
  return (
    sorted(segments)
      .map((s, i) => `${i + 1}\n${toSrtTime(s.startTime)} --> ${toSrtTime(s.endTime)}\n${s.text.trim()}`)
      .join('\n\n') + '\n'
  )
}

export function buildVTT(segments: SubtitleSegment[]) {
  return (
    'WEBVTT\n\n' +
    sorted(segments)
      .map((s) => `${toVttTime(s.startTime)} --> ${toVttTime(s.endTime)}\n${s.text.trim()}`)
      .join('\n\n') +
    '\n'
  )
}

/** Parses "00:01:02,500", "01:02.500" or "1:02.5" into seconds. */
function parseCueTime(raw: string): number | null {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/)
  if (!m) return null
  const h = Number(m[1] || 0)
  const min = Number(m[2])
  const sec = Number(m[3])
  const ms = m[4] ? Number(m[4].padEnd(3, '0')) : 0
  return h * 3600 + min * 60 + sec + ms / 1000
}

/** Parses SRT or WebVTT text. Throws on files with no valid cues. */
export function parseSubtitleFile(text: string): SubtitleSegment[] {
  const normalised = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '')
  const blocks = normalised.split(/\n{2,}/)
  const out: SubtitleSegment[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '')
    const timingIdx = lines.findIndex((l) => l.includes('-->'))
    if (timingIdx === -1) continue
    const [startRaw, endRawFull] = lines[timingIdx].split('-->')
    const endRaw = endRawFull.trim().split(/\s+/)[0]
    const start = parseCueTime(startRaw)
    const end = parseCueTime(endRaw)
    if (start === null || end === null || end <= start) continue
    const body = lines
      .slice(timingIdx + 1)
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!body) continue
    out.push({ id: generateId(), startTime: start, endTime: end, text: body })
  }
  if (out.length === 0) throw new Error('No valid subtitle cues found in this file.')
  return out
}

export function segmentsFromTranscript(transcript: TranscriptSegment[], prefix = 'sub'): SubtitleSegment[] {
  return transcript.map((t) => ({ id: `${prefix}-${t.id}-${generateId().slice(0, 4)}`, startTime: t.startTime, endTime: t.endTime, text: t.text }))
}

export function activeSegmentAt<T extends { startTime: number; endTime: number }>(segments: T[], time: number): T | undefined {
  return segments.find((s) => time >= s.startTime && time < s.endTime)
}

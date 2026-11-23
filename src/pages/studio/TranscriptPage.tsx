import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Download, Copy, Trash2, RefreshCw, Plus, Crosshair, FileText } from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import VideoStage from '@/components/studio/VideoStage'
import { EmptyState, IconButton, Notice, Panel, SimBadge } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { useProjectPlayer } from '@/hooks/useProjectPlayer'
import { segmentsFromTranscript, activeSegmentAt } from '@/lib/subtitles'
import { toast, copyWithToast } from '@/store/useToast'
import type { Project, TranscriptSegment } from '@/types'
import { cn, copyToClipboard, downloadText, formatDuration, generateId, slugify } from '@/utils/helpers'

function AutoTextarea({ value, onChange, className, ariaLabel }: { value: string; onChange: (v: string) => void; className?: string; ariaLabel: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} aria-label={ariaLabel} rows={1} value={value} onChange={(e) => onChange(e.target.value)} className={cn('w-full resize-none overflow-hidden bg-transparent focus:outline-none', className)} />
}

function Transcript({ project }: { project: Project }) {
  const updateProject = useAppStore((s) => s.updateProject)
  const { video, player } = useProjectPlayer(project)
  const [query, setQuery] = useState('')
  const [follow, setFollow] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const segments = project.transcript
  const active = activeSegmentAt(segments, player.time)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? segments.filter((s) => s.text.toLowerCase().includes(q) || s.speaker?.toLowerCase().includes(q)) : segments
  }, [segments, query])

  useEffect(() => {
    if (!follow || !player.playing || !active) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-seg="${active.id}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active?.id, follow, player.playing]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Updates a transcript line. Text edits also flow into the English subtitle cue with the same
   * timing — unless that cue was edited separately in Subtitle Studio (its text no longer matches).
   */
  const patch = (id: string, upd: Partial<TranscriptSegment>) =>
    updateProject(project.id, (p) => {
      const old = p.transcript.find((s) => s.id === id)
      const transcript = p.transcript.map((s) => (s.id === id ? { ...s, ...upd } : s))
      if (!old || upd.text === undefined) return { transcript }
      const subtitles = p.subtitles.map((t) =>
        t.languageCode !== 'en'
          ? t
          : { ...t, segments: t.segments.map((c) => (Math.abs(c.startTime - old.startTime) < 0.05 && Math.abs(c.endTime - old.endTime) < 0.05 && c.text === old.text ? { ...c, text: upd.text! } : c)) }
      )
      return { transcript, subtitles }
    })
  const remove = (id: string) => updateProject(project.id, (p) => ({ transcript: p.transcript.filter((s) => s.id !== id) }))
  const addAtPlayhead = () => {
    const start = Math.round(player.time * 10) / 10
    const seg: TranscriptSegment = { id: generateId(), startTime: start, endTime: Math.min(project.duration, start + 3), text: 'New line', speaker: segments[0]?.speaker ?? 'Speaker 1' }
    updateProject(project.id, (p) => ({ transcript: [...p.transcript, seg].sort((a, b) => a.startTime - b.startTime) }))
    toast(`Line added at ${formatDuration(start)}`)
  }

  const asText = () => segments.map((s) => `[${formatDuration(s.startTime)}] ${s.speaker ? s.speaker + ': ' : ''}${s.text}`).join('\n')

  const syncSubtitles = () => {
    updateProject(project.id, (p) => {
      const others = p.subtitles.filter((t) => t.languageCode !== 'en')
      return { subtitles: [{ id: 'sub-en', language: 'English', languageCode: 'en', segments: segmentsFromTranscript(p.transcript) }, ...others] }
    })
    toast('English subtitles rebuilt from transcript')
  }

  const words = useMemo(() => segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0), [segments])

  const highlight = (text: string) => {
    const q = query.trim()
    if (!q) return text
    const i = text.toLowerCase().indexOf(q.toLowerCase())
    if (i < 0) return text
    return (
      <>
        {text.slice(0, i)}
        <mark className="rounded bg-brand-primary/30 px-0.5 text-text-primary">{text.slice(i, i + q.length)}</mark>
        {text.slice(i + q.length)}
      </>
    )
  }

  if (!segments.length)
    return (
      <Panel>
        <EmptyState icon={FileText} title="No transcript yet" body="Run the analysis step to generate one, or add lines manually." action={<button className="btn-primary" onClick={addAtPlayhead}><Plus className="h-4 w-4" /> Add first line</button>} />
      </Panel>
    )

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <VideoStage player={player} duration={project.duration} url={video.url} status={video.status} thumbnail={project.thumbnail} maxHeight="48vh" />
        <Panel className="p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Segments', segments.length],
              ['Words', words],
              ['Speakers', new Set(segments.map((s) => s.speaker)).size],
            ].map(([k, v]) => (
              <div key={k} className="glass-inset p-3">
                <p className="text-[11px] text-text-muted">{k}</p>
                <p className="font-heading text-lg font-bold text-text-primary">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary !px-4 !text-sm" onClick={() => downloadText(asText(), `${slugify(project.title)}-transcript.txt`)}>
              <Download className="h-4 w-4" /> TXT
            </button>
            <button
              type="button"
              className="btn-secondary !px-4 !text-sm"
              onClick={() => copyWithToast(asText(), 'Transcript')}
            >
              <Copy className="h-4 w-4" /> Copy
            </button>
            <button type="button" className="btn-secondary !px-4 !text-sm" onClick={syncSubtitles}>
              <RefreshCw className="h-4 w-4" /> Rebuild subtitles
            </button>
          </div>
        </Panel>
        <Notice>
          Transcript text is <strong className="text-status-info">simulated</strong> sample speech timed to your video's length. Edit any line to match what's actually said — changes save
          automatically and can be pushed to the subtitle track.
        </Notice>
      </div>

      <Panel className="flex min-h-[60vh] flex-col overflow-hidden !p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-3">
          <div className="relative min-w-[160px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input type="search" placeholder="Search transcript…" value={query} onChange={(e) => setQuery(e.target.value)} className="input pl-9" aria-label="Search transcript" />
          </div>
          <IconButton label={follow ? 'Auto-scroll on' : 'Auto-scroll off'} active={follow} onClick={() => setFollow((f) => !f)}>
            <Crosshair className="h-4 w-4" />
          </IconButton>
          <IconButton label="Add line at playhead" onClick={addAtPlayhead}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <SimBadge />
        </div>
        <p className="px-4 pt-3 text-xs text-text-muted">
          {filtered.length} of {segments.length} segments{query && ` matching “${query}”`}
        </p>
        <div ref={listRef} className="max-h-[70vh] flex-1 space-y-1 overflow-y-auto p-2 lg:max-h-[calc(100dvh-280px)]">
          {filtered.map((seg) => {
            const isActive = active?.id === seg.id
            return (
              <div
                key={seg.id}
                data-seg={seg.id}
                className={cn('group rounded-2xl border p-3 transition-colors', isActive ? 'border-brand-primary/40 bg-brand-primary/[0.07]' : 'border-transparent hover:bg-white/[0.03]')}
              >
                <div className="mb-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => player.playRange(seg.startTime, seg.endTime)}
                    className="inline-flex min-h-[36px] items-center rounded-lg px-2 font-mono text-xs text-brand-secondary hover:bg-brand-primary/10"
                    aria-label={`Play from ${formatDuration(seg.startTime)}`}
                  >
                    {formatDuration(seg.startTime)}
                  </button>
                  <input
                    value={seg.speaker ?? ''}
                    onChange={(e) => patch(seg.id, { speaker: e.target.value })}
                    aria-label="Speaker"
                    className="min-h-[36px] w-28 rounded-lg bg-transparent px-2 text-xs font-medium text-text-secondary hover:bg-white/[0.04] focus:bg-black/30 focus:outline-none"
                  />
                  <span className="ml-auto text-[11px] text-text-muted">{(seg.endTime - seg.startTime).toFixed(1)}s</span>
                  <IconButton label="Delete line" onClick={() => remove(seg.id)} className="!h-9 !w-9 text-text-muted hover:!text-status-error">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
                {query ? (
                  <p className="cursor-text px-2 text-sm leading-relaxed text-text-primary" onClick={() => setQuery('')}>
                    {highlight(seg.text)}
                  </p>
                ) : (
                  <AutoTextarea ariaLabel="Transcript text" value={seg.text} onChange={(v) => patch(seg.id, { text: v })} className="rounded-lg px-2 py-1 text-sm leading-relaxed text-text-primary focus:bg-black/30" />
                )}
              </div>
            )
          })}
          {filtered.length === 0 && <p className="py-10 text-center text-sm text-text-muted">No lines match “{query}”.</p>}
        </div>
      </Panel>
    </div>
  )
}

export default function TranscriptPage() {
  return (
    <ProjectShell step="transcript" title="Transcription" subtitle="Review, search and correct the timestamped transcript.">
      {(p) => <Transcript project={p} />}
    </ProjectShell>
  )
}

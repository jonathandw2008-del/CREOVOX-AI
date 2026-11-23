import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Scissors, Undo2, Redo2, Trash2, Plus, Play, Copy, ChevronUp, ChevronDown, ZoomIn, ZoomOut,
  RectangleHorizontal, Smartphone, Square, Captions, CaptionsOff, Film, Repeat, ArrowDownUp, Keyboard,
} from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import VideoStage from '@/components/studio/VideoStage'
import { EmptyState, IconButton, Notice, Panel, Segmented } from '@/components/ui'
import TimeInput from '@/components/studio/TimeInput'
import { useAppStore } from '@/store/useAppStore'
import { useProjectPlayer } from '@/hooks/useProjectPlayer'
import { syntheticWaveform } from '@/lib/media'
import { toast } from '@/store/useToast'
import type { AspectRatio, Clip, Project } from '@/types'
import { clamp, cn, formatDuration, formatTimecode, generateId } from '@/utils/helpers'

const RATIOS: { value: AspectRatio; label: string; icon: typeof Square }[] = [
  { value: '16:9', label: '16:9', icon: RectangleHorizontal },
  { value: '9:16', label: '9:16', icon: Smartphone },
  { value: '1:1', label: '1:1', icon: Square },
]
const MIN_LEN = 0.5

type DragMode = 'move' | 'start' | 'end'
interface Drag {
  id: string
  mode: DragMode
  x0: number
  start0: number
  end0: number
  pxPerSec: number
  draft: { start: number; end: number }
}

function Editor({ project }: { project: Project }) {
  const updateProject = useAppStore((s) => s.updateProject)
  const { video, player } = useProjectPlayer(project)
  const D = Math.max(project.duration, 0.1)
  const clips = project.clips
  const [selectedId, setSelectedId] = useState<string | null>(clips[0]?.id ?? null)
  const [zoom, setZoom] = useState(1)
  const [showSubs, setShowSubs] = useState(true)
  const [loop, setLoop] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const past = useRef<Clip[][]>([])
  const future = useRef<Clip[][]>([])
  const [, force] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const selected = clips.find((c) => c.id === selectedId) ?? clips[0] ?? null
  const wf = project.waveform ?? syntheticWaveform(project.id)
  const subs = project.subtitles.find((t) => t.languageCode === 'en')?.segments ?? project.subtitles[0]?.segments

  /* ------------------------------ history ----------------------------- */
  const commit = useCallback(
    (fn: (c: Clip[]) => Clip[]) => {
      past.current.push(project.clips)
      if (past.current.length > 60) past.current.shift()
      future.current = []
      updateProject(project.id, { clips: fn(project.clips) })
      force((n) => n + 1)
    },
    [project.clips, project.id, updateProject]
  )
  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(project.clips)
    updateProject(project.id, { clips: prev })
    force((n) => n + 1)
  }, [project.clips, project.id, updateProject])
  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(project.clips)
    updateProject(project.id, { clips: next })
    force((n) => n + 1)
  }, [project.clips, project.id, updateProject])

  const patchClip = (id: string, upd: Partial<Clip>) => commit((cs) => cs.map((c) => (c.id === id ? { ...c, ...upd } : c)))

  /* ------------------------------ actions ----------------------------- */
  const addClip = () => {
    const start = Math.round(clamp(player.time, 0, D - MIN_LEN) * 10) / 10
    const c: Clip = { id: generateId(), startTime: start, endTime: Math.min(D, Math.round((start + Math.min(10, D * 0.15)) * 10) / 10), title: `Clip ${clips.length + 1}`, description: '', selected: true, aspectRatio: selected?.aspectRatio ?? '16:9' }
    commit((cs) => [...cs, c])
    setSelectedId(c.id)
  }

  const split = () => {
    const t = player.time
    const target = (selected && t > selected.startTime + MIN_LEN && t < selected.endTime - MIN_LEN ? selected : null) ?? clips.find((c) => t > c.startTime + MIN_LEN && t < c.endTime - MIN_LEN)
    if (!target) return toast('Move the playhead inside a clip to split it', 'info')
    const at = Math.round(t * 10) / 10
    const b: Clip = { ...target, id: generateId(), startTime: at, title: `${target.title} (B)`, highlightId: undefined }
    commit((cs) => {
      const i = cs.findIndex((c) => c.id === target.id)
      const copy = [...cs]
      copy.splice(i, 1, { ...target, endTime: at }, b)
      return copy
    })
    setSelectedId(b.id)
    toast(`Split at ${formatTimecode(at)}`)
  }

  const removeClip = (id: string) => {
    commit((cs) => cs.filter((c) => c.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const duplicate = (c: Clip) => {
    const d: Clip = { ...c, id: generateId(), title: `${c.title} (copy)`, highlightId: undefined }
    commit((cs) => {
      const i = cs.findIndex((x) => x.id === c.id)
      const copy = [...cs]
      copy.splice(i + 1, 0, d)
      return copy
    })
    setSelectedId(d.id)
  }

  const move = (id: string, dir: -1 | 1) =>
    commit((cs) => {
      const i = cs.findIndex((c) => c.id === id)
      const j = i + dir
      if (j < 0 || j >= cs.length) return cs
      const copy = [...cs]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  const playClip = (c: Clip) => {
    setSelectedId(c.id)
    player.playRange(c.startTime, c.endTime, loop)
  }

  /* ---------------------------- keyboard ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return
      if (e.code === 'Space') {
        e.preventDefault()
        player.toggle()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey) split()
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) removeClip(selected.id)
      else if (e.key === 'ArrowLeft') player.seek(player.time - (e.shiftKey ? 5 : 1))
      else if (e.key === 'ArrowRight') player.seek(player.time + (e.shiftKey ? 5 : 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ----------------------------- timeline ---------------------------- */
  const pxPerSec = () => (trackRef.current?.getBoundingClientRect().width ?? 1) / D

  const beginDrag = (e: React.PointerEvent, c: Clip, mode: DragMode) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setSelectedId(c.id)
    setDrag({ id: c.id, mode, x0: e.clientX, start0: c.startTime, end0: c.endTime, pxPerSec: pxPerSec(), draft: { start: c.startTime, end: c.endTime } })
  }

  const onDragMove = (e: React.PointerEvent) => {
    if (!drag) return
    const dt = (e.clientX - drag.x0) / drag.pxPerSec
    let { start, end } = { start: drag.start0, end: drag.end0 }
    if (drag.mode === 'move') {
      const len = drag.end0 - drag.start0
      start = clamp(drag.start0 + dt, 0, D - len)
      end = start + len
    } else if (drag.mode === 'start') start = clamp(drag.start0 + dt, 0, drag.end0 - MIN_LEN)
    else end = clamp(drag.end0 + dt, drag.start0 + MIN_LEN, D)
    const r = (n: number) => Math.round(n * 10) / 10
    setDrag({ ...drag, draft: { start: r(start), end: r(end) } })
    player.seek(drag.mode === 'end' ? end : start)
  }

  const endDrag = () => {
    if (!drag) return
    const { start, end } = drag.draft
    if (start !== drag.start0 || end !== drag.end0) patchClip(drag.id, { startTime: start, endTime: end })
    setDrag(null)
  }

  const seekFromTrack = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r) return
    player.seek(clamp((clientX - r.left) / r.width, 0, 1) * D)
  }

  // Keep the playhead visible when zoomed during playback.
  useEffect(() => {
    if (zoom === 1 || !player.playing) return
    const sc = scrollRef.current
    if (!sc) return
    const x = (player.time / D) * sc.scrollWidth
    if (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - 40
  }, [player.time, player.playing, zoom, D])

  const ticks = Math.min(12, Math.max(4, Math.round(6 * zoom)))
  const preview = selected?.aspectRatio ?? '16:9'
  const totalLen = clips.reduce((s, c) => s + (c.endTime - c.startTime), 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Stage + toolbar */}
        <div className="min-w-0 space-y-3">
          <VideoStage
            player={player}
            duration={project.duration}
            url={video.url}
            status={video.status}
            aspect={preview}
            subtitles={showSubs ? subs : undefined}
            subtitleStyle={project.subtitleStyle}
            thumbnail={project.thumbnail}
            maxHeight="52vh"
          />
          <Panel className="flex flex-wrap items-center gap-2 !rounded-2xl p-2">
            <Segmented
              ariaLabel="Aspect ratio for selected clip"
              className="w-full sm:w-auto"
              value={preview}
              onChange={(r) => (selected ? patchClip(selected.id, { aspectRatio: r }) : toast('Select a clip to set its aspect ratio', 'info'))}
              options={RATIOS}
            />
            <div className="flex flex-1 items-center justify-between sm:justify-end sm:gap-0.5">
              <IconButton label="Split at playhead (S)" onClick={split}>
                <Scissors className="h-[18px] w-[18px]" />
              </IconButton>
              <IconButton label="Add clip at playhead" onClick={addClip}>
                <Plus className="h-[18px] w-[18px]" />
              </IconButton>
              <IconButton label="Undo (⌘Z)" onClick={undo} disabled={!past.current.length}>
                <Undo2 className="h-[18px] w-[18px]" />
              </IconButton>
              <IconButton label="Redo (⇧⌘Z)" onClick={redo} disabled={!future.current.length}>
                <Redo2 className="h-[18px] w-[18px]" />
              </IconButton>
              <IconButton label={loop ? 'Loop clip on' : 'Loop clip off'} active={loop} onClick={() => setLoop((l) => !l)}>
                <Repeat className="h-[18px] w-[18px]" />
              </IconButton>
              <IconButton label={showSubs ? 'Hide subtitles' : 'Show subtitles'} active={showSubs} onClick={() => setShowSubs((s) => !s)}>
                {showSubs ? <Captions className="h-[18px] w-[18px]" /> : <CaptionsOff className="h-[18px] w-[18px]" />}
              </IconButton>
            </div>
          </Panel>
        </div>

        {/* Clip list */}
        <Panel className="flex max-h-none flex-col !p-0 xl:max-h-[calc(52vh+130px)]">
          <div className="flex items-center gap-2 border-b border-white/[0.06] p-4">
            <h2 className="font-heading font-semibold text-text-primary">Clips</h2>
            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-medium text-brand-highlight">{clips.length}</span>
            <span className="ml-auto font-mono text-xs text-text-muted">{formatDuration(totalLen)} total</span>
            <IconButton label="Sort clips by time" onClick={() => commit((cs) => [...cs].sort((a, b) => a.startTime - b.startTime))}>
              <ArrowDownUp className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {clips.length === 0 && <EmptyState icon={Film} title="No clips yet" body="Select highlights in the previous step, or add a clip at the playhead." />}
            {clips.map((c, i) => {
              const active = c.id === selected?.id
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn('rounded-2xl border p-3 transition-colors', active ? 'border-brand-primary/50 bg-brand-primary/[0.07]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15')}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-text-muted">{String(i + 1).padStart(2, '0')}</span>
                    <input
                      value={c.title}
                      aria-label="Clip title"
                      onChange={(e) => updateProject(project.id, (p) => ({ clips: p.clips.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)) }))}
                      className="min-h-[36px] min-w-0 flex-1 rounded-lg bg-transparent px-1 text-sm font-medium text-text-primary hover:bg-white/[0.03] focus:bg-black/30 focus:outline-none"
                    />
                    <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary">{c.aspectRatio}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <TimeInput label="Clip start" value={c.startTime} min={0} max={c.endTime - MIN_LEN} onCommit={(v) => patchClip(c.id, { startTime: v })} />
                    <span className="text-text-muted">→</span>
                    <TimeInput label="Clip end" value={c.endTime} min={c.startTime + MIN_LEN} max={D} onCommit={(v) => patchClip(c.id, { endTime: v })} />
                    <span className="font-mono text-[11px] text-text-muted">{(c.endTime - c.startTime).toFixed(1)}s</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1 border-t border-white/[0.05] pt-2">
                    <IconButton label="Play clip" onClick={(e) => (e.stopPropagation(), playClip(c))} className="!h-10 !w-10 text-brand-highlight">
                      <Play className="h-4 w-4" />
                    </IconButton>
                    <div className="flex items-center">
                      <IconButton label="Move up" disabled={i === 0} onClick={(e) => (e.stopPropagation(), move(c.id, -1))} className="!h-10 !w-10">
                        <ChevronUp className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Move down" disabled={i === clips.length - 1} onClick={(e) => (e.stopPropagation(), move(c.id, 1))} className="!h-10 !w-10">
                        <ChevronDown className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Duplicate clip" onClick={(e) => (e.stopPropagation(), duplicate(c))} className="!h-10 !w-10">
                        <Copy className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Delete clip" onClick={(e) => (e.stopPropagation(), removeClip(c.id))} className="!h-10 !w-10 hover:!text-status-error">
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              )
            })}
            <button type="button" onClick={addClip} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 text-sm text-text-muted transition-colors hover:border-brand-primary/40 hover:text-brand-highlight">
              <Plus className="h-4 w-4" /> Add clip at {formatDuration(player.time)}
            </button>
          </div>
        </Panel>
      </div>

      {/* Timeline */}
      <Panel className="p-3 sm:p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-medium text-text-primary">Timeline</h3>
          <span className="font-mono text-xs text-text-muted">{formatTimecode(player.time)}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <IconButton label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
              <ZoomOut className="h-4 w-4" />
            </IconButton>
            <span className="w-10 text-center font-mono text-xs text-text-secondary">{zoom.toFixed(1)}×</span>
            <IconButton label="Zoom in" disabled={zoom >= 8} onClick={() => setZoom((z) => Math.min(8, z * 1.5))}>
              <ZoomIn className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain rounded-2xl border border-white/[0.06] bg-black/30">
          <div className="relative min-w-full select-none" style={{ width: `${zoom * 100}%` }}>
            {/* Ruler */}
            <div
              className="relative h-8 cursor-pointer touch-none border-b border-white/[0.06]"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                seekFromTrack(e.clientX)
              }}
              onPointerMove={(e) => e.buttons === 1 && seekFromTrack(e.clientX)}
            >
              {Array.from({ length: ticks + 1 }, (_, i) => (
                <span key={i} className="absolute top-0 flex h-full flex-col justify-end pb-1 font-mono text-[10px] text-text-muted" style={{ left: `${(i / ticks) * 100}%`, transform: i === ticks ? 'translateX(-100%)' : i ? 'translateX(-50%)' : undefined }}>
                  <span className="px-1">{formatDuration((i / ticks) * D)}</span>
                </span>
              ))}
            </div>

            {/* Waveform */}
            <div className="relative h-12 cursor-pointer px-0.5" onPointerDown={(e) => seekFromTrack(e.clientX)}>
              <div className="flex h-full items-center gap-[1px] opacity-80">
                {wf.map((p, i) => (
                  <span key={i} className={cn('flex-1 rounded-full', i / wf.length <= player.time / D ? 'bg-brand-secondary/70' : 'bg-white/15')} style={{ height: `${Math.max(6, p * 90)}%` }} />
                ))}
              </div>
            </div>

            {/* Clip track */}
            <div ref={trackRef} className="relative h-16 border-t border-white/[0.06]" onPointerDown={(e) => e.target === e.currentTarget && seekFromTrack(e.clientX)} onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
              {clips.map((c, i) => {
                const isDrag = drag?.id === c.id
                const s = isDrag ? drag.draft.start : c.startTime
                const e2 = isDrag ? drag.draft.end : c.endTime
                const active = c.id === selected?.id
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'absolute inset-y-2 flex touch-none items-stretch rounded-xl border text-left',
                      active ? 'z-10 border-brand-primary bg-brand-primary/35 shadow-[0_0_24px_-6px_rgba(255,91,22,0.9)]' : 'border-brand-primary/40 bg-brand-primary/15'
                    )}
                    style={{ left: `${(s / D) * 100}%`, width: `${((e2 - s) / D) * 100}%` }}
                  >
                    <span
                      role="slider"
                      aria-label={`Trim start of ${c.title}`}
                      aria-valuenow={s}
                      className="relative flex w-4 flex-shrink-0 cursor-ew-resize items-center justify-center rounded-l-[11px] bg-brand-primary/40 after:absolute after:-inset-y-2 after:-left-3 after:-right-2 after:content-[''] hover:bg-brand-primary/70 [@media(pointer:coarse)]:w-6"
                      onPointerDown={(e) => beginDrag(e, c, 'start')}
                    >
                      <span className="h-5 w-0.5 rounded bg-white/80" />
                    </span>
                    <span className="flex min-w-0 flex-1 cursor-grab items-center overflow-hidden px-1.5 active:cursor-grabbing" onPointerDown={(e) => beginDrag(e, c, 'move')}>
                      <span className="truncate text-[11px] font-medium text-white">
                        {i + 1}. {c.title}
                      </span>
                    </span>
                    <span
                      role="slider"
                      aria-label={`Trim end of ${c.title}`}
                      aria-valuenow={e2}
                      className="relative flex w-4 flex-shrink-0 cursor-ew-resize items-center justify-center rounded-r-[11px] bg-brand-primary/40 after:absolute after:-inset-y-2 after:-left-2 after:-right-3 after:content-[''] hover:bg-brand-primary/70 [@media(pointer:coarse)]:w-6"
                      onPointerDown={(e) => beginDrag(e, c, 'end')}
                    >
                      <span className="h-5 w-0.5 rounded bg-white/80" />
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Playhead */}
            <div className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" style={{ left: `${(player.time / D) * 100}%` }}>
              <span className="absolute -left-[5px] top-0 h-3 w-3 rotate-45 rounded-sm bg-white" />
            </div>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
          <Keyboard className="hidden h-3.5 w-3.5 sm:block" />
          <span className="hidden sm:inline">Space play · S split · ⌫ delete · ⌘Z undo · ←/→ nudge — </span>Drag clips to move, drag the edges to trim.
        </p>
      </Panel>

      {!video.url && (
        <Notice>
          {video.status === 'missing'
            ? 'The source video for this project is not stored in this browser, so the editor uses a simulated preview. Timeline edits still work and are saved.'
            : 'This demo project has no source video, so playback is simulated. Upload your own video to edit real footage — clip rendering then happens in your browser.'}
        </Notice>
      )}
    </div>
  )
}

export default function EditorPage() {
  return (
    <ProjectShell step="editor" title="Video Editor" subtitle="Trim, split and frame your clips for every platform.">
      {(p) => <Editor project={p} />}
    </ProjectShell>
  )
}

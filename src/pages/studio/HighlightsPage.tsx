import { useMemo, useState } from 'react'
import { Check, Play, Sparkles, Plus, Trash2, ListFilter } from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import VideoStage from '@/components/studio/VideoStage'
import { AIBadge, EmptyState, IconButton, Notice, Panel, RealBadge, SimBadge, Segmented } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { useProjectPlayer } from '@/hooks/useProjectPlayer'
import { syntheticWaveform } from '@/lib/media'
import { toast } from '@/store/useToast'
import type { Clip, Highlight, HighlightCategory, Project } from '@/types'
import { cn, formatDuration, generateId } from '@/utils/helpers'

const CAT_LABEL: Record<HighlightCategory, string> = {
  'key-moment': 'Key moment',
  quote: 'Quote',
  'topic-change': 'Topic change',
  'engagement-peak': 'Engagement peak',
}
const CAT_COLOR: Record<HighlightCategory, string> = {
  'key-moment': 'text-brand-highlight bg-brand-primary/10',
  quote: 'text-status-info bg-status-info/10',
  'topic-change': 'text-status-warning bg-status-warning/10',
  'engagement-peak': 'text-status-success bg-status-success/10',
}

/** Sync project clips with the highlight selection (keeps manual clips & existing edits). */
export function clipsFromHighlights(p: Project): Clip[] {
  const selected = p.highlights.filter((h) => h.selected)
  const kept = p.clips.filter((c) => !c.highlightId || selected.some((h) => h.id === c.highlightId))
  const added = selected
    .filter((h) => !kept.some((c) => c.highlightId === h.id))
    .map<Clip>((h) => ({ id: generateId(), startTime: h.startTime, endTime: h.endTime, title: h.title, description: h.description, selected: true, aspectRatio: p.exportConfig.aspectRatio, highlightId: h.id }))
  return [...kept, ...added].sort((a, b) => a.startTime - b.startTime)
}

function Highlights({ project }: { project: Project }) {
  const updateProject = useAppStore((s) => s.updateProject)
  const { video, player } = useProjectPlayer(project)
  const [filter, setFilter] = useState<'all' | HighlightCategory>('all')
  const [sort, setSort] = useState<'time' | 'score'>('time')
  const wf = project.waveform ?? syntheticWaveform(project.id)
  const D = project.duration || 1

  const list = useMemo(() => {
    let l = project.highlights.filter((h) => filter === 'all' || h.category === filter)
    l = [...l].sort((a, b) => (sort === 'time' ? a.startTime - b.startTime : b.confidence - a.confidence))
    return l
  }, [project.highlights, filter, sort])

  const setHighlights = (fn: (h: Highlight[]) => Highlight[]) => updateProject(project.id, (p) => ({ highlights: fn(p.highlights) }))
  const toggle = (id: string) => setHighlights((hs) => hs.map((h) => (h.id === id ? { ...h, selected: !h.selected } : h)))
  const selectedCount = project.highlights.filter((h) => h.selected).length

  const addManual = () => {
    const start = Math.round(player.time * 10) / 10
    const h: Highlight = { id: generateId(), startTime: start, endTime: Math.min(D, start + 10), title: 'Manual highlight', description: 'Added by you at the playhead.', confidence: 1, selected: true, category: 'key-moment' }
    setHighlights((hs) => [...hs, h])
    toast(`Highlight added at ${formatDuration(start)}`)
  }

  if (!project.highlights.length)
    return (
      <Panel>
        <EmptyState icon={Sparkles} title="No highlights detected" body="Run analysis first, or mark a moment manually." action={<button className="btn-primary" onClick={addManual}><Plus className="h-4 w-4" /> Add highlight</button>} />
      </Panel>
    )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <VideoStage player={player} duration={project.duration} url={video.url} status={video.status} thumbnail={project.thumbnail} maxHeight="46vh" />
        <Panel className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading font-semibold text-text-primary">Detection summary</h2>
            {project.waveformIsReal ? <RealBadge label="Scored with real audio energy" /> : <SimBadge />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-inset p-3">
              <p className="text-[11px] text-text-muted">Selected</p>
              <p className="font-heading text-2xl font-bold text-text-primary">
                {selectedCount}
                <span className="text-sm font-normal text-text-muted"> / {project.highlights.length}</span>
              </p>
            </div>
            <div className="glass-inset p-3">
              <p className="text-[11px] text-text-muted">Selected runtime</p>
              <p className="font-heading text-2xl font-bold text-text-primary">
                {formatDuration(project.highlights.filter((h) => h.selected).reduce((s, h) => s + h.endTime - h.startTime, 0))}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary !px-3.5 !text-sm" onClick={() => setHighlights((hs) => hs.map((h) => ({ ...h, selected: h.confidence >= 0.9 })))}>
              Select ≥ 90%
            </button>
            <button type="button" className="btn-secondary !px-3.5 !text-sm" onClick={() => setHighlights((hs) => hs.map((h) => ({ ...h, selected: true })))}>
              Select all
            </button>
            <button type="button" className="btn-secondary !px-3.5 !text-sm" onClick={() => setHighlights((hs) => hs.map((h) => ({ ...h, selected: false })))}>
              Clear
            </button>
            <button type="button" className="btn-secondary !px-3.5 !text-sm" onClick={addManual}>
              <Plus className="h-4 w-4" /> At playhead
            </button>
          </div>
          <p className="text-xs text-text-muted">Selected highlights become clips in the editor. Tap a region on the timeline below to toggle it.</p>
        </Panel>
      </div>

      {/* Timeline */}
      <Panel className="p-4">
        <div className="relative h-24 overflow-hidden rounded-2xl border border-white/[0.06] bg-black/30">
          <div className="absolute inset-x-2 inset-y-3 opacity-70">
            <div className="flex h-full items-center gap-px">
              {wf.map((p, i) => (
                <span key={i} className="flex-1 rounded-full bg-white/20" style={{ height: `${Math.max(6, p * 100)}%` }} />
              ))}
            </div>
          </div>
          {project.highlights.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-pressed={h.selected}
              aria-label={`${h.title} ${formatDuration(h.startTime)}–${formatDuration(h.endTime)}`}
              onClick={() => toggle(h.id)}
              className={cn(
                'absolute inset-y-1.5 min-w-[12px] rounded-lg border transition-colors',
                h.selected ? 'border-brand-primary/80 bg-brand-primary/30 hover:bg-brand-primary/40' : 'border-white/15 bg-white/[0.05] hover:bg-white/[0.1]'
              )}
              style={{ left: `${(h.startTime / D) * 100}%`, width: `${((h.endTime - h.startTime) / D) * 100}%` }}
            />
          ))}
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_white]" style={{ left: `${(player.time / D) * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-text-muted">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i}>{formatDuration((i / 4) * D)}</span>
          ))}
        </div>
      </Panel>

      {/* List */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="-mx-4 flex-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-2">
            {(['all', ...Object.keys(CAT_LABEL)] as ('all' | HighlightCategory)[]).map((c) => (
              <button key={c} type="button" aria-pressed={filter === c} onClick={() => setFilter(c)} className={cn('chip', filter === c && 'chip-active')}>
                {c === 'all' ? 'All' : CAT_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <Segmented
          ariaLabel="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'time', label: 'Time', icon: ListFilter },
            { value: 'score', label: 'Score' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((h) => (
          <Panel key={h.id} className={cn('flex flex-col !rounded-2xl p-4 transition-colors', h.selected && '!border-brand-primary/40')}>
            <div className="flex items-start gap-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={h.selected}
                aria-label={`Select ${h.title}`}
                onClick={() => toggle(h.id)}
                className="-m-2 flex h-11 w-11 flex-shrink-0 items-center justify-center"
              >
                <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-colors', h.selected ? 'border-brand-primary bg-brand-primary' : 'border-white/20')}>
                  {h.selected && <Check className="h-4 w-4 text-white" />}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <input
                  value={h.title}
                  aria-label="Highlight title"
                  onChange={(e) => setHighlights((hs) => hs.map((x) => (x.id === h.id ? { ...x, title: e.target.value } : x)))}
                  className="min-h-[40px] w-full rounded-lg bg-transparent px-1 font-medium text-text-primary hover:bg-white/[0.03] focus:bg-black/30 focus:outline-none"
                />
                <p className="mt-1 line-clamp-2 text-sm text-text-muted">{h.description}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', CAT_COLOR[h.category])}>{CAT_LABEL[h.category]}</span>
              <span className="font-mono text-xs text-text-secondary">
                {formatDuration(h.startTime)}–{formatDuration(h.endTime)}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <span className="mr-1 rounded-full bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-text-secondary" title="Confidence">
                  {Math.round(h.confidence * 100)}%
                </span>
                <IconButton label="Preview" onClick={() => player.playRange(h.startTime, h.endTime)}>
                  <Play className="h-4 w-4" />
                </IconButton>
                <IconButton label="Delete highlight" className="hover:!text-status-error" onClick={() => setHighlights((hs) => hs.filter((x) => x.id !== h.id))}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-highlight" style={{ width: `${h.confidence * 100}%` }} />
            </div>
          </Panel>
        ))}
      </div>

      {project.aiSource?.highlights === 'groq' || project.aiSource?.highlights === 'anthropic' ? (
        <Notice>
          <AIBadge label="AI-detected highlights" className="mr-1.5 align-middle" /> Titles, categories and scores were chosen by AI ({project.aiSource.highlights}) from your transcript
          {project.waveformIsReal ? ', weighted by the real loudness of your audio track' : ''}. Review them before cutting clips.
        </Notice>
      ) : project.aiSource?.highlights === 'heuristic' ? (
        <Notice>
          <RealBadge label="Detected from audio energy & speech" className="mr-1.5 align-middle" /> These highlights come from loudness peaks, speech density and sentence boundaries in your real
          audio and transcript (AI highlight detection was not available). Rename or re-categorise them freely.
        </Notice>
      ) : (
        <Notice>
          Highlight titles and categories are <strong className="text-status-info">simulated</strong>.{' '}
          {project.waveformIsReal ? 'Confidence scores are weighted by the real loudness of your audio track.' : 'Confidence scores are sample values for this demo project.'}
        </Notice>
      )}
    </div>
  )
}

export default function HighlightsPage() {
  const updateProject = useAppStore((s) => s.updateProject)
  return (
    <ProjectShell
      step="highlights"
      title="Highlight Detection"
      subtitle="Choose the moments worth turning into clips."
      nextLabel="Create clips in Editor"
      onNext={(p) => {
        const clips = clipsFromHighlights(p)
        updateProject(p.id, { clips })
        toast(clips.length ? `${clips.length} clip${clips.length === 1 ? '' : 's'} ready in the editor` : 'No highlights selected — add clips manually in the editor', clips.length ? 'success' : 'info')
      }}
    >
      {(p) => <Highlights project={p} />}
    </ProjectShell>
  )
}

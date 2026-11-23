import { useMemo, useRef, useState } from 'react'
import { Search, Plus, Download, Copy, Upload, Trash2, Languages, Play, X } from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import VideoStage from '@/components/studio/VideoStage'
import TimeInput from '@/components/studio/TimeInput'
import { EmptyState, Field, IconButton, Modal, Notice, Panel, RealBadge, Segmented, SimBadge } from '@/components/ui'
import { useAppStore, DEFAULT_SUBTITLE_STYLE } from '@/store/useAppStore'
import { useProjectPlayer } from '@/hooks/useProjectPlayer'
import { LANGUAGES } from '@/data/mockData'
import { buildSRT, buildVTT, parseSubtitleFile, activeSegmentAt } from '@/lib/subtitles'
import { toast, copyWithToast } from '@/store/useToast'
import type { Project, SubtitleSegment, SubtitleStyle, SubtitleTrack } from '@/types'
import { cn, copyToClipboard, downloadText, generateId, slugify } from '@/utils/helpers'

const TEXT_COLORS = ['#FFFFFF', '#FFE45C', '#FFA45E', '#34D399', '#60A5FA', '#FF5B16']
const BG_PRESETS = [
  { label: 'Dark', value: 'rgba(0,0,0,0.7)' },
  { label: 'Solid', value: 'rgba(0,0,0,0.92)' },
  { label: 'Ember', value: 'rgba(255,91,22,0.85)' },
  { label: 'None', value: 'transparent' },
]
const FONTS = ['Inter', 'Space Grotesk', 'Instrument Serif', 'monospace']

function Subtitles({ project }: { project: Project }) {
  const updateProject = useAppStore((s) => s.updateProject)
  const { video, player } = useProjectPlayer(project)
  const [lang, setLang] = useState(project.subtitles[0]?.languageCode ?? 'en')
  const [query, setQuery] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [newLang, setNewLang] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const tracks = project.subtitles
  const track = tracks.find((t) => t.languageCode === lang) ?? tracks[0]
  const style = project.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE
  const segs = useMemo(() => [...(track?.segments ?? [])].sort((a, b) => a.startTime - b.startTime), [track])
  const filtered = query ? segs.filter((s) => s.text.toLowerCase().includes(query.toLowerCase())) : segs
  const active = activeSegmentAt(segs, player.time)

  const setTrack = (fn: (t: SubtitleTrack) => SubtitleTrack) =>
    track && updateProject(project.id, (p) => ({ subtitles: p.subtitles.map((t) => (t.id === track.id ? fn(t) : t)) }))
  const patchSeg = (id: string, upd: Partial<SubtitleSegment>) => setTrack((t) => ({ ...t, segments: t.segments.map((s) => (s.id === id ? { ...s, ...upd } : s)) }))
  const setStyle = (upd: Partial<SubtitleStyle>) => updateProject(project.id, (p) => ({ subtitleStyle: { ...(p.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE), ...upd } }))

  const addSegment = () => {
    const start = Math.round(player.time * 10) / 10
    const seg: SubtitleSegment = { id: generateId(), startTime: start, endTime: Math.min(project.duration, start + 2.5), text: 'New subtitle' }
    if (!track) {
      updateProject(project.id, { subtitles: [{ id: 'sub-en', language: 'English', languageCode: 'en', segments: [seg] }] })
      setLang('en')
    } else setTrack((t) => ({ ...t, segments: [...t.segments, seg] }))
  }

  const addLanguage = () => {
    const l = LANGUAGES.find((x) => x.code === newLang)
    if (!l) return
    const source = tracks.find((t) => t.languageCode === 'en') ?? tracks[0]
    const nt: SubtitleTrack = {
      id: `sub-${l.code}-${generateId().slice(0, 4)}`,
      language: l.name,
      languageCode: l.code,
      simulated: true,
      segments: (source?.segments ?? []).map((s) => ({ ...s, id: generateId() })),
    }
    updateProject(project.id, (p) => ({ subtitles: [...p.subtitles, nt] }))
    setLang(l.code)
    setAddOpen(false)
    setNewLang('')
    toast(`${l.name} track added — placeholder text needs translating`, 'info')
  }

  const deleteTrack = () => {
    if (!track) return
    updateProject(project.id, (p) => ({ subtitles: p.subtitles.filter((t) => t.id !== track.id) }))
    setLang(tracks.find((t) => t.id !== track.id)?.languageCode ?? 'en')
    setDeleteOpen(false)
    toast(`${track.language} track removed`)
  }

  const onImport = async (f: File) => {
    try {
      const parsed = parseSubtitleFile(await f.text())
      if (track) setTrack((t) => ({ ...t, segments: parsed, simulated: false }))
      else updateProject(project.id, { subtitles: [{ id: 'sub-en', language: 'English', languageCode: 'en', segments: parsed }] })
      toast(`Imported ${parsed.length} cues from ${f.name}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error')
    }
  }

  const base = `${slugify(project.title)}-${track?.languageCode ?? 'en'}`
  const available = LANGUAGES.filter((l) => !tracks.some((t) => t.languageCode === l.code))

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-4">
        {/* Tracks */}
        <div className="flex items-center gap-2">
          <div className="-mx-4 flex-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-2" role="tablist" aria-label="Subtitle languages">
              {tracks.map((t) => (
                <button key={t.id} role="tab" aria-selected={t.languageCode === track?.languageCode} type="button" onClick={() => setLang(t.languageCode)} className={cn('chip', t.languageCode === track?.languageCode && 'chip-active')}>
                  {t.language}
                  <span className="font-mono text-[10px] text-text-muted">{t.segments.length}</span>
                  {t.simulated && <span className="h-1.5 w-1.5 rounded-full bg-status-info" title="Simulated translation" />}
                </button>
              ))}
            </div>
          </div>
          <button type="button" aria-label="Add language" className="btn-secondary !px-3.5 !text-sm" onClick={() => setAddOpen(true)} disabled={!available.length}>
            <Languages className="h-4 w-4" /> <span className="hidden sm:inline">Add language</span>
          </button>
        </div>

        {track?.simulated && (
          <Notice>
            <strong className="text-status-info">Simulated translation.</strong> No translation service is connected — this {track.language} track contains placeholder text with the source timing.
            Edit each line, or import a translated SRT/VTT file.
          </Notice>
        )}

        <Panel className="!p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-3">
            <div className="relative min-w-[150px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input type="search" className="input pl-9" placeholder="Search subtitles…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search subtitles" />
            </div>
            <IconButton label="Add subtitle at playhead" onClick={addSegment}>
              <Plus className="h-4 w-4" />
            </IconButton>
            <IconButton label="Import SRT or VTT" onClick={() => importRef.current?.click()}>
              <Upload className="h-4 w-4" />
            </IconButton>
            {track && track.languageCode !== 'en' && (
              <IconButton label={`Delete ${track.language} track`} className="hover:!text-status-error" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            )}
            <input
              ref={importRef}
              type="file"
              accept=".srt,.vtt,text/vtt,application/x-subrip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onImport(f)
                e.target.value = ''
              }}
            />
          </div>

          {!track || segs.length === 0 ? (
            <EmptyState icon={Languages} title="No subtitles in this track" body="Add a line at the playhead or import an SRT/VTT file." />
          ) : (
            <ul className="max-h-[62vh] divide-y divide-white/[0.05] overflow-y-auto">
              {filtered.map((seg) => (
                <li key={seg.id} className={cn('p-3 transition-colors sm:p-4', active?.id === seg.id && 'bg-brand-primary/[0.07]')}>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <IconButton label="Play subtitle" className="!h-10 !w-10 text-brand-highlight" onClick={() => player.playRange(seg.startTime, seg.endTime)}>
                      <Play className="h-4 w-4" />
                    </IconButton>
                    <TimeInput label="Start" value={seg.startTime} min={0} max={seg.endTime - 0.1} onCommit={(v) => patchSeg(seg.id, { startTime: v })} />
                    <span className="text-text-muted">→</span>
                    <TimeInput label="End" value={seg.endTime} min={seg.startTime + 0.1} max={Math.max(project.duration, seg.endTime)} onCommit={(v) => patchSeg(seg.id, { endTime: v })} />
                    <span className={cn('font-mono text-[11px]', seg.text.length / Math.max(0.1, seg.endTime - seg.startTime) > 21 ? 'text-status-warning' : 'text-text-muted')} title="Characters per second (≤ 21 recommended)">
                      {(seg.text.length / Math.max(0.1, seg.endTime - seg.startTime)).toFixed(0)} cps
                    </span>
                    <IconButton label="Delete subtitle" className="ml-auto !h-10 !w-10 hover:!text-status-error" onClick={() => setTrack((t) => ({ ...t, segments: t.segments.filter((s) => s.id !== seg.id) }))}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <textarea
                    aria-label="Subtitle text"
                    rows={2}
                    value={seg.text}
                    onChange={(e) => patchSeg(seg.id, { text: e.target.value })}
                    className="input resize-y !text-sm leading-relaxed"
                    dir={track.languageCode === 'ar' ? 'rtl' : undefined}
                  />
                </li>
              ))}
              {filtered.length === 0 && <li className="py-10 text-center text-sm text-text-muted">No subtitles match “{query}”.</li>}
            </ul>
          )}
        </Panel>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary !px-4 !text-sm" disabled={!segs.length} onClick={() => (downloadText(buildSRT(segs), `${base}.srt`, 'application/x-subrip'), toast('SRT downloaded'))}>
            <Download className="h-4 w-4" /> Export SRT
          </button>
          <button type="button" className="btn-secondary !px-4 !text-sm" disabled={!segs.length} onClick={() => (downloadText(buildVTT(segs), `${base}.vtt`, 'text/vtt'), toast('VTT downloaded'))}>
            <Download className="h-4 w-4" /> Export VTT
          </button>
          <button type="button" className="btn-secondary !px-4 !text-sm" disabled={!segs.length} onClick={() => copyWithToast(segs.map((s) => s.text).join('\n'), 'Text')}>
            <Copy className="h-4 w-4" /> Copy text
          </button>
          <RealBadge label="Real SRT/VTT files" className="ml-auto" />
        </div>
      </div>

      {/* Preview & style */}
      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <VideoStage player={player} duration={project.duration} url={video.url} status={video.status} subtitles={segs} subtitleStyle={style} thumbnail={project.thumbnail} maxHeight="40vh" compact />
        <Panel className="space-y-5 p-5">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-semibold text-text-primary">Subtitle style</h3>
            <button type="button" className="btn-ghost ml-auto !min-h-[36px] !text-xs" onClick={() => setStyle({ ...DEFAULT_SUBTITLE_STYLE })}>
              Reset
            </button>
          </div>
          <Field label="Font family">
            <select className="select" value={style.fontFamily} onChange={(e) => setStyle({ fontFamily: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Font size" hint={`${style.fontSize}px`}>
            <input type="range" min={14} max={48} value={style.fontSize} style={{ ['--fill' as string]: `${((style.fontSize - 14) / 34) * 100}%` }} onChange={(e) => setStyle({ fontSize: Number(e.target.value) })} className="w-full" />
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-muted">Text colour</p>
            <div className="flex flex-wrap gap-1">
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Text colour ${c}`} aria-pressed={style.color === c} onClick={() => setStyle({ color: c })} className="flex h-11 w-11 items-center justify-center rounded-xl">
                  <span className={cn('h-7 w-7 rounded-lg border-2', style.color === c ? 'border-brand-primary ring-2 ring-brand-primary/30' : 'border-white/15')} style={{ backgroundColor: c }} />
                </button>
              ))}
              <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl" aria-label="Custom text colour">
                <input type="color" value={style.color.startsWith('#') ? style.color : '#ffffff'} onChange={(e) => setStyle({ color: e.target.value })} className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
              </label>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-muted">Background</p>
            <Segmented ariaLabel="Subtitle background" value={BG_PRESETS.find((b) => b.value === style.backgroundColor)?.value ?? ''} onChange={(v) => setStyle({ backgroundColor: v })} options={BG_PRESETS.map((b) => ({ value: b.value, label: b.label }))} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-muted">Position</p>
            <Segmented
              ariaLabel="Subtitle position"
              value={style.position}
              onChange={(v) => setStyle({ position: v })}
              options={[
                { value: 'top', label: 'Top' },
                { value: 'center', label: 'Center' },
                { value: 'bottom', label: 'Bottom' },
              ]}
            />
          </div>
          <p className="text-xs text-text-muted">This style is used for burned-in subtitles when rendering clips in Export Studio.</p>
        </Panel>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <SimBadge label="Translations simulated" /> <span>Timing, editing & file export are real.</span>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} labelledBy="add-lang">
        <div className="flex items-center">
          <h3 id="add-lang" className="font-heading text-lg font-semibold text-text-primary">
            Add subtitle language
          </h3>
          <IconButton label="Close" className="ml-auto" onClick={() => setAddOpen(false)}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <p className="mt-2 text-sm text-text-secondary">A new track is created with the English timing and placeholder text (simulated translation).</p>
        <select className="select mt-4" value={newLang} onChange={(e) => setNewLang(e.target.value)} aria-label="Language">
          <option value="">Choose a language…</option>
          {available.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
        <div className="mt-6 flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={() => setAddOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-primary flex-1" disabled={!newLang} onClick={addLanguage}>
            Add track
          </button>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} labelledBy="del-track">
        <h3 id="del-track" className="font-heading text-lg font-semibold text-text-primary">
          Delete {track?.language} track?
        </h3>
        <p className="mt-2 text-sm text-text-secondary">All {track?.segments.length} lines in this track will be removed.</p>
        <div className="mt-6 flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={() => setDeleteOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn-danger flex-1" onClick={deleteTrack}>
            Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default function SubtitlesPage() {
  return (
    <ProjectShell step="subtitles" title="Subtitle Studio" subtitle="Edit, style and export multilingual subtitles.">
      {(p) => <Subtitles project={p} />}
    </ProjectShell>
  )
}


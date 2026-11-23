import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileVideo, FileText, Image as ImageIcon, Captions, Check, Loader, Package, Film, FileJson, Users, PenTool, Square, PartyPopper } from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import { Notice, Panel, PanelHeader, RealBadge, Segmented, SimBadge, Toggle } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { useProjectVideo } from '@/hooks/useProjectVideo'
import { buildSRT, buildVTT } from '@/lib/subtitles'
import { canRenderClips, outputSize, renderClip, supportedRecordingTypes } from '@/lib/media'
import { renderThumbnailBlob } from '@/lib/thumbnail'
import { contentToMarkdown } from './ContentPage'
import { audienceToMarkdown } from './AudiencePage'
import { toast } from '@/store/useToast'
import type { ExportConfig, Project } from '@/types'
import { cn, downloadBlob, downloadText, formatDuration, formatFileSize, nowISO, slugify, sleep } from '@/utils/helpers'

type RenderState = { status: 'idle' | 'rendering' | 'done' | 'error'; progress: number; blob?: Blob; error?: string }

function Export({ project }: { project: Project }) {
  const { updateProject, markStep, logActivity } = useAppStore()
  const video = useProjectVideo(project)
  const cfg = project.exportConfig
  const setCfg = (u: Partial<ExportConfig>) => updateProject(project.id, (p) => ({ exportConfig: { ...p.exportConfig, ...u } }))
  const [renders, setRenders] = useState<Record<string, RenderState>>({})
  const [packing, setPacking] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const stopAll = useRef(false)

  const recTypes = useMemo(() => supportedRecordingTypes(), [])
  const canRender = canRenderClips() && !!video.url
  const format = recTypes.some((t) => t.format === cfg.format) ? cfg.format : recTypes[0]?.format ?? 'webm'

  useEffect(() => () => abort.current?.abort(), [])

  const base = slugify(project.title)
  const burnTrack = project.subtitles.find((t) => t.languageCode === cfg.subtitleLanguage) ?? project.subtitles[0]

  const render = async (clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId)
    if (!clip || !video.url) return
    abort.current = new AbortController()
    setRenders((r) => ({ ...r, [clipId]: { status: 'rendering', progress: 0 } }))
    try {
      const blob = await renderClip({
        url: video.url,
        start: clip.startTime,
        end: clip.endTime,
        aspectRatio: clip.aspectRatio,
        resolution: cfg.resolution,
        format,
        subtitles: cfg.burnInSubtitles ? burnTrack?.segments : undefined,
        subtitleStyle: project.subtitleStyle,
        signal: abort.current.signal,
        onProgress: (p) => setRenders((r) => ({ ...r, [clipId]: { status: 'rendering', progress: p } })),
      })
      setRenders((r) => ({ ...r, [clipId]: { status: 'done', progress: 1, blob } }))
      downloadBlob(blob, `${base}-${slugify(clip.title)}-${clip.aspectRatio.replace(':', 'x')}.${format}`)
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      setRenders((r) => ({ ...r, [clipId]: { status: aborted ? 'idle' : 'error', progress: 0, error: aborted ? undefined : e instanceof Error ? e.message : 'Render failed' } }))
    }
  }

  const renderAll = async () => {
    stopAll.current = false
    for (const c of project.clips) {
      if (stopAll.current) break
      await render(c.id)
    }
  }
  const anyRendering = Object.values(renders).some((r) => r.status === 'rendering')

  /* -------------------------- asset downloads -------------------------- */
  const subtitlesFiles = () =>
    project.subtitles
      .filter((t) => t.segments.length)
      .flatMap((t) => [
        () => downloadText(buildSRT(t.segments), `${base}-${t.languageCode}.srt`, 'application/x-subrip'),
        () => downloadText(buildVTT(t.segments), `${base}-${t.languageCode}.vtt`, 'text/vtt'),
      ])
  const transcriptFile = () => downloadText(project.transcript.map((s) => `[${formatDuration(s.startTime)}] ${s.speaker ? s.speaker + ': ' : ''}${s.text}`).join('\n'), `${base}-transcript.txt`)
  const thumbnailFiles = () => project.thumbnails.map((d) => async () => downloadBlob(await renderThumbnailBlob(d), `${base}-${slugify(d.title)}.png`))
  const contentFile = () => downloadText(contentToMarkdown(project), `${base}-content.md`, 'text/markdown')
  const audienceFile = () => downloadText(audienceToMarkdown(project), `${base}-audiences.md`, 'text/markdown')
  const manifestFile = () => {
    const { thumbnail: _t, waveform: _w, ...rest } = project
    void _t
    void _w
    const data = { app: 'CREOVOX AI', version: 2, exportedAt: nowISO(), note: 'Video file is not included — it stays on your device.', project: { ...rest, thumbnails: project.thumbnails.map(({ backgroundImage: _b, ...d }) => (void _b, d)) } }
    downloadText(JSON.stringify(data, null, 2), `${base}-project.json`, 'application/json')
  }

  const run = async (label: string, tasks: (() => void | Promise<void>)[]) => {
    setPacking(label)
    for (const t of tasks) {
      await t()
      await sleep(300)
    }
    setPacking(null)
  }

  const exportPackage = async () => {
    const tasks: (() => void | Promise<void>)[] = [manifestFile]
    if (cfg.includeSubtitles) tasks.push(...subtitlesFiles(), transcriptFile)
    if (cfg.includeThumbnail) tasks.push(...thumbnailFiles())
    if (cfg.includeContent) {
      if (project.content.length) tasks.push(contentFile)
      if (project.audienceVariations.length) tasks.push(audienceFile)
    }
    await run('package', tasks)
    updateProject(project.id, { status: 'completed', exportedAt: nowISO() })
    markStep(project.id, 'export')
    logActivity(`Exported '${project.title}' (${tasks.length} files)`, 'export', project.id)
    toast(`${tasks.length} files downloaded`)
  }

  const counts = {
    clips: project.clips.length,
    tracks: project.subtitles.filter((t) => t.segments.length).length,
    thumbs: project.thumbnails.length,
    content: project.content.length,
    audience: project.audienceVariations.length,
  }
  const pkgFiles = 1 + (cfg.includeSubtitles ? counts.tracks * 2 + 1 : 0) + (cfg.includeThumbnail ? counts.thumbs : 0) + (cfg.includeContent ? (counts.content ? 1 : 0) + (counts.audience ? 1 : 0) : 0)

  const assets = [
    { icon: Captions, label: 'Subtitles (SRT + VTT)', meta: `${counts.tracks} track${counts.tracks === 1 ? '' : 's'}`, disabled: !counts.tracks, onClick: () => run('subs', subtitlesFiles()), key: 'subs' },
    { icon: FileText, label: 'Transcript (TXT)', meta: `${project.transcript.length} lines`, disabled: !project.transcript.length, onClick: () => run('tx', [transcriptFile]), key: 'tx' },
    { icon: ImageIcon, label: 'Thumbnails (PNG)', meta: `${counts.thumbs} designs`, disabled: !counts.thumbs, onClick: () => run('thumbs', thumbnailFiles()), key: 'thumbs' },
    { icon: PenTool, label: 'Content package (MD)', meta: `${counts.content} fields`, disabled: !counts.content, onClick: () => run('content', [contentFile]), key: 'content' },
    { icon: Users, label: 'Audience variations (MD)', meta: `${counts.audience} audiences`, disabled: !counts.audience, onClick: () => run('aud', [audienceFile]), key: 'aud' },
    { icon: FileJson, label: 'Project file (JSON)', meta: 'Re-importable', disabled: false, onClick: () => run('json', [manifestFile]), key: 'json' },
  ]

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        {/* Clip rendering */}
        <Panel className="p-5">
          <PanelHeader icon={FileVideo} title="Render video clips" sub="Re-encoded in real time in your browser with MediaRecorder" right={canRender ? <RealBadge label="Real rendering" /> : undefined} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-muted">Format</p>
              <Segmented
                ariaLabel="Format"
                value={format}
                onChange={(v) => setCfg({ format: v })}
                options={(['webm', 'mp4'] as const).filter((f) => recTypes.some((t) => t.format === f)).map((f) => ({ value: f, label: f.toUpperCase() }))}
              />
              {!recTypes.some((t) => t.format === 'mp4') && <p className="mt-1.5 text-[11px] text-text-muted">MP4 recording isn't supported by this browser.</p>}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-muted">Resolution (short side)</p>
              <Segmented ariaLabel="Resolution" value={cfg.resolution} onChange={(v) => setCfg({ resolution: v })} options={(['1080p', '720p', '480p'] as const).map((r) => ({ value: r, label: r }))} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Burn in subtitles</p>
              <p className="text-xs text-text-muted">Uses your Subtitle Studio style</p>
            </div>
            <div className="flex items-center gap-2">
              {cfg.burnInSubtitles && project.subtitles.length > 0 && (
                <select className="select !min-h-[40px] w-36" aria-label="Burn-in language" value={burnTrack?.languageCode} onChange={(e) => setCfg({ subtitleLanguage: e.target.value })}>
                  {project.subtitles.map((t) => (
                    <option key={t.id} value={t.languageCode}>
                      {t.language}
                    </option>
                  ))}
                </select>
              )}
              <Toggle label="Burn in subtitles" checked={cfg.burnInSubtitles} onChange={(v) => setCfg({ burnInSubtitles: v })} />
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {project.clips.length === 0 && <li className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-text-muted">No clips — add some in the Video Editor.</li>}
            {project.clips.map((c, i) => {
              const r = renders[c.id] ?? { status: 'idle', progress: 0 }
              const size = outputSize(c.aspectRatio, cfg.resolution)
              return (
                <li key={c.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.04] font-mono text-xs text-text-secondary">{String(i + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{c.title}</p>
                      <p className="font-mono text-[11px] text-text-muted">
                        {formatDuration(c.startTime)}–{formatDuration(c.endTime)} · {c.aspectRatio} · {size.width}×{size.height}
                      </p>
                    </div>
                    {r.status === 'done' && r.blob ? (
                      <button type="button" className="btn-secondary !px-3.5 !text-sm" onClick={() => downloadBlob(r.blob!, `${base}-${slugify(c.title)}.${format}`)}>
                        <Check className="h-4 w-4 text-status-success" /> {formatFileSize(r.blob.size)}
                      </button>
                    ) : r.status === 'rendering' ? (
                      <button type="button" className="btn-secondary !px-3.5 !text-sm" onClick={() => ((stopAll.current = true), abort.current?.abort())}>
                        <Square className="h-3.5 w-3.5" /> Stop
                      </button>
                    ) : (
                      <button type="button" className="btn-secondary !px-3.5 !text-sm" disabled={!canRender || anyRendering} onClick={() => render(c.id)}>
                        <Film className="h-4 w-4" /> Render
                      </button>
                    )}
                  </div>
                  {r.status === 'rendering' && (
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary" style={{ width: `${r.progress * 100}%` }} />
                    </div>
                  )}
                  {r.status === 'error' && <p className="mt-2 text-xs text-status-error">{r.error}</p>}
                </li>
              )
            })}
          </ul>

          {project.clips.length > 1 && (
            <button type="button" className="btn-primary mt-4 w-full sm:w-auto" disabled={!canRender || anyRendering} onClick={renderAll}>
              {anyRendering ? <Loader className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />} Render all {project.clips.length} clips
            </button>
          )}

          {!canRender && (
            <Notice className="mt-4" tone="warn">
              {!video.url
                ? project.videoFile
                  ? 'The source video is not stored in this browser, so clips cannot be rendered here. All other assets can still be exported.'
                  : 'This demo project has no source video, so clip rendering is unavailable. Upload your own video to render real clips.'
                : 'This browser does not support MediaRecorder canvas capture. Try a recent Chrome, Edge or Firefox.'}
            </Notice>
          )}
          {canRender && <p className="mt-3 text-xs text-text-muted">Rendering plays each clip in real time — a 30-second clip takes about 30 seconds. Keep this tab open.</p>}
        </Panel>

        {/* Assets */}
        <Panel className="p-5">
          <PanelHeader icon={Package} title="Assets" sub="Real files generated from your project data" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {assets.map(({ icon: Icon, label, meta, disabled, onClick, key }) => (
              <button key={key} type="button" disabled={disabled || !!packing} onClick={onClick} className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-brand-primary/30 disabled:opacity-40">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  {packing === key ? <Loader className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">{label}</span>
                  <span className="block text-xs text-text-muted">{meta}</span>
                </span>
                <Download className="h-4 w-4 text-text-muted" />
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* Package summary */}
      <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Panel className="p-5">
          <PanelHeader icon={Package} title="Export package" />
          <div className="space-y-1">
            {(
              [
                ['includeSubtitles', 'Subtitles & transcript', `${counts.tracks * 2 + 1} files`],
                ['includeThumbnail', 'Thumbnails', `${counts.thumbs} PNG`],
                ['includeContent', 'Written content', `${(counts.content ? 1 : 0) + (counts.audience ? 1 : 0)} MD`],
              ] as const
            ).map(([k, label, meta]) => (
              <div key={k} className="flex items-center gap-3 py-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">{label}</p>
                  <p className="text-xs text-text-muted">{meta}</p>
                </div>
                <Toggle label={label} checked={cfg[k]} onChange={(v) => setCfg({ [k]: v } as Partial<ExportConfig>)} />
              </div>
            ))}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1">
                <p className="text-sm text-text-primary">Project file</p>
                <p className="text-xs text-text-muted">Always included</p>
              </div>
              <Check className="mr-3 h-5 w-5 text-status-success" />
            </div>
          </div>
          <button type="button" className="btn-primary mt-5 w-full !min-h-[52px] text-base" disabled={!!packing} onClick={exportPackage}>
            {packing === 'package' ? <Loader className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            {packing === 'package' ? 'Preparing files…' : `Download ${pkgFiles} files`}
          </button>
          <p className="mt-2 text-center text-[11px] text-text-muted">Your browser may ask permission to download multiple files.</p>
          {project.exportedAt && (
            <p className={cn('mt-4 flex items-center justify-center gap-2 rounded-xl bg-status-success/10 p-2 text-xs text-status-success')}>
              <PartyPopper className="h-4 w-4" /> Last exported {new Date(project.exportedAt).toLocaleString()}
            </p>
          )}
        </Panel>
        <Notice>
          Every download here is a genuine file built in your browser. Written copy and translations inside them come from the <SimBadge className="mx-1 align-middle" /> modules and should be
          reviewed before publishing.
        </Notice>
      </div>
    </div>
  )
}

export default function ExportPage() {
  const markStep = useAppStore((s) => s.markStep)
  return (
    <ProjectShell step="export" title="Export Studio" subtitle="Render clips and download your complete content package." nextLabel="Finish & open library" onNext={(p) => markStep(p.id, 'export')}>
      {(p) => <Export project={p} />}
    </ProjectShell>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileVideo, FileText, Image as ImageIcon, Captions, Check, Loader, Package, Film, FileJson, Users, PenTool, Square, PartyPopper } from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import { Notice, Panel, PanelHeader, RealBadge, Segmented, SimBadge, Toggle } from '@/components/ui'
import { useAppStore, isServerProject } from '@/store/useAppStore'
import { ApiError, jobsApi, pollJob, type RenderFile } from '@/lib/api'
import { useProjectVideo } from '@/hooks/useProjectVideo'
import { buildSRT, buildVTT } from '@/lib/subtitles'
import { canRenderClips, outputSize, renderClip, supportedRecordingTypes } from '@/lib/media'
import { renderThumbnailBlob } from '@/lib/thumbnail'
import { contentToMarkdown } from './ContentPage'
import { audienceToMarkdown } from './AudiencePage'
import { toast } from '@/store/useToast'
import type { ExportConfig, Project } from '@/types'
import { cn, downloadBlob, downloadText, formatDuration, formatFileSize, nowISO, slugify, sleep } from '@/utils/helpers'

type RenderState = {
  status: 'idle' | 'rendering' | 'done' | 'error'
  progress: number
  /** Browser render output (legacy local projects). */
  blob?: Blob
  error?: string
  /** Server render output. */
  jobId?: string
  fileIndex?: number
  size?: number
  fileName?: string
}

/** Same-origin download of a server file (the session cookie authorises it). */
function downloadUrl(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Progress of clip `i` of `n` when a single job renders clips sequentially. */
const clipProgress = (overall: number, i: number, n: number) => Math.min(1, Math.max(0, overall * n - i))

function Export({ project }: { project: Project }) {
  const { updateProject, markStep, logActivity, flushProject, refreshProject } = useAppStore()
  const video = useProjectVideo(project)
  /** Server project with an uploaded video → clips and the ZIP package are built by server jobs. */
  const server = isServerProject(project)
  const serverVideo = server && !!project.videoFile?.assetId
  const [includeClips, setIncludeClips] = useState(project.clips.length > 0)
  const [pkgProgress, setPkgProgress] = useState<number | null>(null)
  const activeJob = useRef<string | null>(null)
  const cfg = project.exportConfig
  const setCfg = (u: Partial<ExportConfig>) => updateProject(project.id, (p) => ({ exportConfig: { ...p.exportConfig, ...u } }))
  const [renders, setRenders] = useState<Record<string, RenderState>>({})
  const [packing, setPacking] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const stopAll = useRef(false)

  const recTypes = useMemo(() => supportedRecordingTypes(), [])
  const canRender = serverVideo || (!server && canRenderClips() && !!video.url)
  const format = serverVideo ? cfg.format : recTypes.some((t) => t.format === cfg.format) ? cfg.format : recTypes[0]?.format ?? 'webm'
  const formatOptions = serverVideo ? (['mp4', 'webm'] as const) : (['webm', 'mp4'] as const).filter((f) => recTypes.some((t) => t.format === f))

  useEffect(() => () => abort.current?.abort(), [])

  const base = slugify(project.title)
  const burnTrack = project.subtitles.find((t) => t.languageCode === cfg.subtitleLanguage) ?? project.subtitles[0]

  /** Render clips with one server job, then download each output. */
  const renderOnServer = async (clipIds: string[]) => {
    const setAll = (fn: (id: string, i: number) => RenderState) => setRenders((r) => ({ ...r, ...Object.fromEntries(clipIds.map((id, i) => [id, fn(id, i)])) }))
    setAll(() => ({ status: 'rendering', progress: 0 }))
    try {
      await flushProject(project.id)
      const job = await jobsApi.render(project.id, {
        clipIds,
        resolution: cfg.resolution,
        format,
        burnInSubtitles: cfg.burnInSubtitles,
        subtitleLanguage: burnTrack?.languageCode,
      })
      activeJob.current = job.id
      const done = await pollJob<{ files: RenderFile[] }>(job.id, (j) => setAll((_, i) => ({ status: 'rendering', progress: clipProgress(j.progress, i, clipIds.length) })))
      const files = done.result?.files ?? []
      setAll((id) => {
        const f = files.find((x) => x.clipId === id)
        return f ? { status: 'done', progress: 1, jobId: job.id, fileIndex: f.index, size: f.size, fileName: f.name } : { status: 'error', progress: 0, error: 'This clip was not rendered.' }
      })
      for (const f of files) {
        downloadUrl(jobsApi.fileUrl(job.id, f.index), f.name)
        if (files.length > 1) await sleep(700)
      }
      if (files.length) logActivity(`Rendered ${files.length} clip${files.length === 1 ? '' : 's'} for '${project.title}'`, 'export', project.id)
    } catch (e) {
      const canceled = e instanceof ApiError && e.code === 'job_canceled'
      setAll(() => (canceled ? { status: 'idle', progress: 0 } : { status: 'error', progress: 0, error: e instanceof Error ? e.message : 'Render failed' }))
      if (canceled) toast('Rendering canceled', 'info')
    } finally {
      activeJob.current = null
    }
  }

  const stopRendering = () => {
    stopAll.current = true
    if (activeJob.current) void jobsApi.cancel(activeJob.current).catch(() => undefined)
    abort.current?.abort()
  }

  const render = async (clipId: string) => {
    if (serverVideo) return renderOnServer([clipId])
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
    if (serverVideo) return renderOnServer(project.clips.map((c) => c.id))
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
    const note = server ? 'Video file is not included — it stays in your private CREOVOX workspace.' : 'Video file is not included.'
    const data = { app: 'CREOVOX AI', version: 2, exportedAt: nowISO(), note, project: { ...rest, thumbnails: project.thumbnails.map(({ backgroundImage: _b, ...d }) => (void _b, d)) } }
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

  /** Server project: build one ZIP on the server (thumbnails are rendered here so they match the preview). */
  const exportPackageOnServer = async () => {
    setPacking('package')
    setPkgProgress(0)
    try {
      await flushProject(project.id)
      const used = new Set<string>()
      const thumbs = cfg.includeThumbnail
        ? await Promise.all(
            project.thumbnails.map(async (d, i) => {
              let name = `${base}-${slugify(d.title) || 'thumbnail'}.png`
              if (used.has(name)) name = `${base}-${slugify(d.title) || 'thumbnail'}-${i + 1}.png`
              used.add(name)
              return { name, blob: await renderThumbnailBlob(d) }
            })
          )
        : []
      const withClips = includeClips && project.clips.length > 0
      const job = await jobsApi.package(
        project.id,
        {
          includeClips: withClips,
          includeSubtitles: cfg.includeSubtitles,
          includeThumbnail: cfg.includeThumbnail,
          includeContent: cfg.includeContent,
          clipIds: withClips ? project.clips.map((c) => c.id) : [],
          resolution: cfg.resolution,
          format,
          burnInSubtitles: cfg.burnInSubtitles,
          subtitleLanguage: burnTrack?.languageCode,
        },
        thumbs
      )
      activeJob.current = job.id
      const done = await pollJob<{ file: { name: string; size: number } }>(job.id, (j) => setPkgProgress(j.progress))
      downloadUrl(jobsApi.fileUrl(job.id, 0), done.result?.file?.name ?? `${base}.zip`)
      await refreshProject(project.id)
      markStep(project.id, 'export')
      logActivity(`Exported '${project.title}' (ZIP package)`, 'export', project.id)
      toast(`Package ready${done.result?.file?.size ? ` (${formatFileSize(done.result.file.size)})` : ''}`)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'job_canceled') toast('Export canceled', 'info')
      else toast(e instanceof Error ? e.message : 'Export failed', 'error')
    } finally {
      activeJob.current = null
      setPacking(null)
      setPkgProgress(null)
    }
  }

  const exportPackage = async () => {
    if (server) return exportPackageOnServer()
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
          <PanelHeader
            icon={FileVideo}
            title="Render video clips"
            sub={serverVideo ? 'Cut, reframed and encoded on the server with ffmpeg' : 'Re-encoded in real time in your browser with MediaRecorder'}
            right={canRender ? <RealBadge label={serverVideo ? 'Server rendering' : 'Real rendering'} /> : undefined}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-muted">Format</p>
              <Segmented
                ariaLabel="Format"
                value={format}
                onChange={(v) => setCfg({ format: v })}
                options={formatOptions.map((f) => ({ value: f, label: f.toUpperCase() }))}
              />
              {serverVideo ? (
                <p className="mt-1.5 text-[11px] text-text-muted">MP4 (H.264) plays everywhere; WebM (VP9) is smaller but slower to encode.</p>
              ) : (
                !recTypes.some((t) => t.format === 'mp4') && <p className="mt-1.5 text-[11px] text-text-muted">MP4 recording isn't supported by this browser.</p>
              )}
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
                    {r.status === 'done' && r.jobId !== undefined && r.fileIndex !== undefined ? (
                      <button type="button" className="btn-secondary !px-3.5 !text-sm" onClick={() => downloadUrl(jobsApi.fileUrl(r.jobId!, r.fileIndex), r.fileName ?? `${base}-${slugify(c.title)}.${format}`)}>
                        <Check className="h-4 w-4 text-status-success" /> {r.size ? formatFileSize(r.size) : 'Download'}
                      </button>
                    ) : r.status === 'done' && r.blob ? (
                      <button type="button" className="btn-secondary !px-3.5 !text-sm" onClick={() => downloadBlob(r.blob!, `${base}-${slugify(c.title)}.${format}`)}>
                        <Check className="h-4 w-4 text-status-success" /> {formatFileSize(r.blob.size)}
                      </button>
                    ) : r.status === 'rendering' ? (
                      <button type="button" className="btn-secondary !px-3.5 !text-sm" onClick={stopRendering}>
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
              {project.isDemo
                ? 'This demo project has no source video, so clip rendering is unavailable. Upload your own video to render real clips.'
                : server
                  ? 'This project has no source video yet, so clips cannot be rendered. All other assets can still be exported.'
                  : !video.url
                    ? project.videoFile
                      ? 'The source video is not stored in this browser, so clips cannot be rendered here. All other assets can still be exported.'
                      : 'This project has no source video, so clip rendering is unavailable.'
                    : 'This browser does not support MediaRecorder canvas capture. Try a recent Chrome, Edge or Firefox.'}
            </Notice>
          )}
          {canRender && (
            <p className="mt-3 text-xs text-text-muted">
              {serverVideo
                ? 'Clips render on the server and download automatically when ready — you can keep working in other modules.'
                : 'Rendering plays each clip in real time — a 30-second clip takes about 30 seconds. Keep this tab open.'}
            </p>
          )}
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
            {server && (
              <div className="flex items-center gap-3 py-1">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">Rendered clips</p>
                  <p className="text-xs text-text-muted">{project.clips.length ? `${project.clips.length} ${format.toUpperCase()} · ${cfg.resolution}` : 'No clips yet'}</p>
                </div>
                <Toggle label="Rendered clips" checked={includeClips && project.clips.length > 0} onChange={(v) => setIncludeClips(v)} />
              </div>
            )}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1">
                <p className="text-sm text-text-primary">Project file</p>
                <p className="text-xs text-text-muted">Always included</p>
              </div>
              <Check className="mr-3 h-5 w-5 text-status-success" />
            </div>
          </div>
          <button type="button" className="btn-primary mt-5 w-full !min-h-[52px] text-base" disabled={!!packing || anyRendering} onClick={exportPackage}>
            {packing === 'package' ? <Loader className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            {packing === 'package'
              ? pkgProgress !== null
                ? `Building package… ${Math.round(pkgProgress * 100)}%`
                : 'Preparing files…'
              : server
                ? 'Download ZIP package'
                : `Download ${pkgFiles} files`}
          </button>
          {packing === 'package' && pkgProgress !== null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-[width] duration-300" style={{ width: `${Math.max(3, pkgProgress * 100)}%` }} />
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-text-muted">
            {server ? `One .zip with ${pkgFiles + (includeClips ? project.clips.length : 0)} files, built on the server.` : 'Your browser may ask permission to download multiple files.'}
          </p>
          {project.exportedAt && (
            <p className={cn('mt-4 flex items-center justify-center gap-2 rounded-xl bg-status-success/10 p-2 text-xs text-status-success')}>
              <PartyPopper className="h-4 w-4" /> Last exported {new Date(project.exportedAt).toLocaleString()}
            </p>
          )}
        </Panel>
        {server ? (
          <Notice>
            Clips and the ZIP package are built on the server; single assets download straight from your browser. Review AI-written copy and translations before publishing.
          </Notice>
        ) : (
          <Notice>
            Every download here is a genuine file built in your browser. Written copy and translations inside demo projects come from the <SimBadge className="mx-1 align-middle" /> modules and
            should be reviewed before publishing.
          </Notice>
        )}
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

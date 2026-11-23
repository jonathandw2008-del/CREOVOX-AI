import { useEffect, useRef, useState } from 'react'
import { Download, Plus, Copy, Trash2, Camera, ImagePlus, X, Star, RotateCcw, Loader } from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import { Field, IconButton, Notice, Panel, RealBadge, Segmented } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { useProjectVideo } from '@/hooks/useProjectVideo'
import { drawThumbnail, loadImage, renderThumbnailBlob, THUMB_H, THUMB_W } from '@/lib/thumbnail'
import { captureFrameFromElement } from '@/lib/media'
import { defaultThumbnails } from '@/lib/generators'
import { toast } from '@/store/useToast'
import type { Project, ThumbnailDesign, ThumbnailStyle } from '@/types'
import { clamp, cn, downloadBlob, formatDuration, generateId, slugify, sleep } from '@/utils/helpers'

const FONTS = ['Space Grotesk', 'Inter', 'Instrument Serif']
const TEXT_COLORS = ['#FFFFFF', '#F5F2EE', '#FF5B16', '#FFA45E', '#FBBF24', '#34D399', '#60A5FA', '#090B0F']
const BG_COLORS = ['#090B0F', '#11151B', '#1a1a2e', '#0f0f1a', '#2a1006', '#0a1a12']
const POSITIONS = [25, 50, 75].flatMap((y) => [25, 50, 75].map((x) => ({ x, y })))

function ThumbCanvas({ design, className }: { design: ThumbnailDesign; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    const draw = async () => {
      const ctx = ref.current?.getContext('2d')
      if (!ctx) return
      const img = design.backgroundImage ? await loadImage(design.backgroundImage).catch(() => null) : null
      if (!cancelled) drawThumbnail(ctx, design, img)
    }
    void draw()
    // Re-draw once web fonts finish loading so canvas text uses the right face.
    document.fonts?.ready.then(() => {
      if (!cancelled) void draw()
    })
    return () => {
      cancelled = true
    }
  }, [design])
  return <canvas ref={ref} width={THUMB_W} height={THUMB_H} className={cn('block h-auto w-full', className)} />
}

async function imageFileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const c = document.createElement('canvas')
    c.width = 960
    c.height = 540
    const ctx = c.getContext('2d')!
    const s = Math.max(960 / img.width, 540 / img.height)
    ctx.drawImage(img, (960 - img.width * s) / 2, (540 - img.height * s) / 2, img.width * s, img.height * s)
    return c.toDataURL('image/jpeg', 0.72)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function Thumbnails({ project }: { project: Project }) {
  const updateProject = useAppStore((s) => s.updateProject)
  const video = useProjectVideo(project)
  const designs = project.thumbnails.length ? project.thumbnails : defaultThumbnails(project.title)
  const activeId = designs.some((d) => d.id === project.activeThumbnailId) ? project.activeThumbnailId! : designs[0].id
  const active = designs.find((d) => d.id === activeId)!
  const [frameTime, setFrameTime] = useState(Math.min(project.duration * 0.2, 10))
  const [busy, setBusy] = useState(false)
  const frameVideo = useRef<HTMLVideoElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  // Persist generated defaults the first time.
  useEffect(() => {
    if (!project.thumbnails.length) updateProject(project.id, { thumbnails: designs, activeThumbnailId: designs[0].id })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (frameVideo.current && Number.isFinite(frameTime)) frameVideo.current.currentTime = frameTime
  }, [frameTime, video.url])

  const setDesigns = (fn: (d: ThumbnailDesign[]) => ThumbnailDesign[]) => updateProject(project.id, (p) => ({ thumbnails: fn(p.thumbnails.length ? p.thumbnails : designs) }))
  const update = (upd: Partial<ThumbnailDesign>) => setDesigns((ds) => ds.map((d) => (d.id === activeId ? { ...d, ...upd } : d)))
  const select = (id: string) => updateProject(project.id, { activeThumbnailId: id })

  const add = () => {
    const d: ThumbnailDesign = { ...defaultThumbnails(project.title)[0], id: generateId(), title: `Design ${designs.length + 1}`, style: 'minimal' }
    setDesigns((ds) => [...ds, d])
    select(d.id)
  }
  const duplicate = () => {
    const d = { ...active, id: generateId(), title: `${active.title} copy` }
    setDesigns((ds) => [...ds, d])
    select(d.id)
  }
  const remove = () => {
    if (designs.length <= 1) return toast('Keep at least one design', 'info')
    const rest = designs.filter((d) => d.id !== activeId)
    updateProject(project.id, { thumbnails: rest, activeThumbnailId: rest[0].id })
  }
  const resetToTemplate = () => {
    const tpl = defaultThumbnails(project.title).find((t) => t.style === active.style) ?? defaultThumbnails(project.title)[0]
    update({ ...tpl, id: active.id, title: active.title, backgroundImage: active.backgroundImage })
  }

  const captureFrame = () => {
    const v = frameVideo.current
    if (!v) return
    const url = captureFrameFromElement(v, 960, 540, 0.72)
    if (!url) return toast('Could not capture this frame', 'error')
    update({ backgroundImage: url })
    toast(`Frame at ${formatDuration(frameTime)} applied`)
  }

  const downloadPng = async (d: ThumbnailDesign) => {
    const blob = await renderThumbnailBlob(d)
    downloadBlob(blob, `${slugify(project.title)}-${slugify(d.title)}.png`)
  }

  const downloadAll = async () => {
    setBusy(true)
    for (const d of designs) {
      await downloadPng(d)
      await sleep(350)
    }
    setBusy(false)
    toast(`${designs.length} PNGs downloaded`)
  }

  const setCover = async () => {
    const blob = await renderThumbnailBlob(active)
    const img = await loadImage(URL.createObjectURL(blob))
    const c = document.createElement('canvas')
    c.width = 480
    c.height = 270
    c.getContext('2d')!.drawImage(img, 0, 0, 480, 270)
    updateProject(project.id, { thumbnail: c.toDataURL('image/jpeg', 0.75) })
    URL.revokeObjectURL(img.src)
    toast('Set as project cover')
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <div className="overflow-hidden rounded-section border border-white/[0.07] shadow-2xl shadow-black/60">
          <ThumbCanvas design={active} />
        </div>

        <div className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
          <div className="flex gap-3 sm:grid sm:grid-cols-4 lg:grid-cols-5">
            {designs.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => select(d.id)}
                aria-pressed={d.id === activeId}
                className={cn('relative w-36 flex-shrink-0 overflow-hidden rounded-2xl border-2 text-left transition-all sm:w-auto', d.id === activeId ? 'border-brand-primary ring-4 ring-brand-primary/15' : 'border-white/10 hover:border-white/25')}
              >
                <ThumbCanvas design={d} />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-4 text-[11px] font-medium text-white/90">{d.title}</span>
              </button>
            ))}
            <button type="button" onClick={add} className="flex aspect-video w-36 flex-shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-white/10 text-text-muted transition-colors hover:border-brand-primary/40 hover:text-brand-highlight sm:w-auto" aria-label="New design">
              <Plus className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary !px-4 !text-sm" onClick={() => void downloadPng(active).then(() => toast('PNG downloaded'))}>
            <Download className="h-4 w-4" /> Download PNG
          </button>
          <button type="button" className="btn-secondary !px-4 !text-sm" onClick={downloadAll} disabled={busy}>
            {busy ? <Loader className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} All ({designs.length})
          </button>
          <button type="button" className="btn-secondary !px-4 !text-sm" onClick={setCover}>
            <Star className="h-4 w-4" /> Set as cover
          </button>
          <div className="ml-auto flex">
            <IconButton label="Duplicate design" onClick={duplicate}>
              <Copy className="h-4 w-4" />
            </IconButton>
            <IconButton label="Reset to template" onClick={resetToTemplate}>
              <RotateCcw className="h-4 w-4" />
            </IconButton>
            <IconButton label="Delete design" className="hover:!text-status-error" onClick={remove}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        {/* Background source */}
        <Panel className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h3 className="font-heading font-semibold text-text-primary">Background image</h3>
            <RealBadge label="Captured locally" />
          </div>
          {video.url ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr] sm:items-center">
              <video ref={frameVideo} src={video.url} muted playsInline preload="auto" className="aspect-video w-full rounded-xl border border-white/10 bg-black object-cover" />
              <div className="space-y-3">
                <Field label="Frame" hint={formatDuration(frameTime)}>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, project.duration - 0.1)}
                    step={0.1}
                    value={frameTime}
                    style={{ ['--fill' as string]: `${(frameTime / Math.max(0.1, project.duration)) * 100}%` }}
                    onChange={(e) => setFrameTime(Number(e.target.value))}
                    className="w-full"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary !px-4 !text-sm" onClick={captureFrame}>
                    <Camera className="h-4 w-4" /> Use this frame
                  </button>
                  <button type="button" className="btn-secondary !px-4 !text-sm" onClick={() => imageRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" /> Upload image
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-sm text-text-muted">{project.videoFile ? 'Source video is not stored in this browser.' : 'This demo project has no video to capture frames from.'} You can upload an image instead.</p>
              <button type="button" className="btn-secondary !px-4 !text-sm" onClick={() => imageRef.current?.click()}>
                <ImagePlus className="h-4 w-4" /> Upload image
              </button>
            </div>
          )}
          {active.backgroundImage && (
            <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-white/[0.06] pt-4">
              <Field label="Darken overlay" hint={`${Math.round(active.overlay * 100)}%`} className="min-w-[200px] flex-1">
                <input type="range" min={0} max={0.85} step={0.05} value={active.overlay} style={{ ['--fill' as string]: `${(active.overlay / 0.85) * 100}%` }} onChange={(e) => update({ overlay: Number(e.target.value) })} className="w-full" />
              </Field>
              <button type="button" className="btn-ghost !text-sm" onClick={() => update({ backgroundImage: undefined })}>
                <X className="h-4 w-4" /> Remove image
              </button>
            </div>
          )}
          <input
            ref={imageRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                update({ backgroundImage: await imageFileToDataUrl(f) })
              } catch {
                toast('Could not read that image', 'error')
              }
            }}
          />
        </Panel>
      </div>

      {/* Controls */}
      <Panel className="space-y-5 p-5 xl:sticky xl:top-24 xl:self-start">
        <Field label="Design name">
          <input className="input" value={active.title} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <Field label="Headline text" hint={`${active.textOverlay.length}`}>
          <textarea className="input min-h-[84px] resize-y" value={active.textOverlay} onChange={(e) => update({ textOverlay: e.target.value })} />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-muted">Style preset</p>
          <Segmented<ThumbnailStyle>
            ariaLabel="Style preset"
            className="grid grid-cols-2"
            value={active.style}
            onChange={(style) => update({ style })}
            options={(['bold', 'minimal', 'cinematic', 'editorial'] as const).map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Font">
            <select className="select" value={active.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Size" hint={`${active.fontSize}`}>
            <input type="range" min={20} max={80} value={active.fontSize} style={{ ['--fill' as string]: `${((active.fontSize - 20) / 60) * 100}%` }} onChange={(e) => update({ fontSize: Number(e.target.value) })} className="w-full" />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-muted">Text colour</p>
          <div className="flex flex-wrap">
            {TEXT_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Text colour ${c}`} aria-pressed={active.textColor === c} onClick={() => update({ textColor: c })} className="flex h-11 w-11 items-center justify-center">
                <span className={cn('h-7 w-7 rounded-lg border-2', active.textColor === c ? 'border-brand-primary ring-2 ring-brand-primary/30' : 'border-white/15')} style={{ backgroundColor: c }} />
              </button>
            ))}
            <label className="flex h-11 w-11 cursor-pointer items-center justify-center" aria-label="Custom text colour">
              <input type="color" value={active.textColor} onChange={(e) => update({ textColor: e.target.value })} className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
            </label>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-muted">Background colour</p>
          <div className="flex flex-wrap">
            {BG_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Background ${c}`} aria-pressed={active.backgroundColor === c} onClick={() => update({ backgroundColor: c })} className="flex h-11 w-11 items-center justify-center">
                <span className={cn('h-7 w-7 rounded-lg border-2', active.backgroundColor === c ? 'border-brand-primary ring-2 ring-brand-primary/30' : 'border-white/15')} style={{ backgroundColor: c }} />
              </button>
            ))}
            <label className="flex h-11 w-11 cursor-pointer items-center justify-center" aria-label="Custom background colour">
              <input type="color" value={active.backgroundColor} onChange={(e) => update({ backgroundColor: e.target.value })} className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
            </label>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-text-muted">Text position</p>
          <div className="flex items-start gap-4">
            <div className="grid w-fit grid-cols-3 gap-1">
              {POSITIONS.map((pos) => {
                const on = active.textPosition.x === pos.x && active.textPosition.y === pos.y
                return (
                  <button key={`${pos.x}-${pos.y}`} type="button" aria-label={`Position ${pos.x}%, ${pos.y}%`} aria-pressed={on} onClick={() => update({ textPosition: pos })} className={cn('flex h-11 w-11 items-center justify-center rounded-xl border transition-colors', on ? 'border-brand-primary bg-brand-primary/10' : 'border-white/10 hover:border-white/25')}>
                    <span className={cn('h-2.5 w-2.5 rounded-full', on ? 'bg-brand-primary' : 'bg-text-muted')} />
                  </button>
                )
              })}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Field label="Vertical" hint={`${active.textPosition.y}%`}>
                <input type="range" min={10} max={90} value={active.textPosition.y} style={{ ['--fill' as string]: `${((active.textPosition.y - 10) / 80) * 100}%` }} onChange={(e) => update({ textPosition: { ...active.textPosition, y: clamp(Number(e.target.value), 10, 90) } })} className="w-full" />
              </Field>
            </div>
          </div>
        </div>
        <Notice>Thumbnails are composed on a canvas in your browser — the PNG you download matches the preview pixel for pixel. No image-generation AI is used.</Notice>
      </Panel>
    </div>
  )
}

export default function ThumbnailsPage() {
  return (
    <ProjectShell step="thumbnails" title="Thumbnail Studio" subtitle="Design scroll-stopping covers from real video frames.">
      {(p) => <Thumbnails project={p} />}
    </ProjectShell>
  )
}

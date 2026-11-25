import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, File as FileIcon, X, ArrowRight, AlertCircle, HardDrive, Clock, Monitor, Loader, FileJson, Play, ShieldCheck } from 'lucide-react'
import { useAppStore, blankProject } from '@/store/useAppStore'
import { formatFileSize, formatDuration, generateId } from '@/utils/helpers'
import { readVideoMeta, type VideoMeta } from '@/lib/media'
import { ApiError, projectsApi } from '@/lib/api'
import { Field, Notice, Panel, RealBadge } from '@/components/ui'
import { toast } from '@/store/useToast'
import type { Project } from '@/types'

const SUPPORTED = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/ogg']
const MAX_SIZE = 2 * 1024 * 1024 * 1024

type Stage = 'idle' | 'reading' | 'ready' | 'saving'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [saveStep, setSaveStep] = useState('')
  const [uploadPct, setUploadPct] = useState(0)
  /** False when the browser can't decode the file (e.g. MKV/AVI); the server still reads it with ffprobe. */
  const [previewable, setPreviewable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { addProject, createProject: createServerProject, replaceProject, deleteProject } = useAppStore()
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])
  useEffect(() => () => abortRef.current?.abort(), [])

  const validate = (f: File): string | null => {
    if (!SUPPORTED.includes(f.type) && !/\.(mp4|webm|mov|avi|mkv|ogv|m4v)$/i.test(f.name)) return 'Unsupported file format. Please choose MP4, WebM, MOV, AVI or MKV.'
    if (f.size > MAX_SIZE) return 'File size exceeds the 2 GB limit.'
    return null
  }

  const handleFile = useCallback(async (f: File) => {
    setError(null)
    const err = validate(f)
    if (err) return setError(err)
    setFile(f)
    setTitle((t) => t || f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
    setStage('reading')
    const url = URL.createObjectURL(f)
    setObjectUrl(url)
    try {
      const m = await readVideoMeta(url)
      setMeta(m)
      setPreviewable(true)
    } catch {
      // The browser can't decode it; the server will probe it and make a playable copy.
      setMeta({ duration: 0, width: 0, height: 0 } as VideoMeta)
      setPreviewable(false)
    }
    setStage('ready')
  }, [])

  const reset = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setFile(null)
    setObjectUrl(null)
    setMeta(null)
    setPreviewable(true)
    setStage('idle')
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const createProject = async () => {
    if (!file || !meta) return
    if (!title.trim()) return setError('Give your project a title.')
    setStage('saving')
    setError(null)
    setUploadPct(0)
    let projectId: string | null = null
    try {
      setSaveStep('Creating project…')
      projectId = await createServerProject(title.trim(), description.trim() || `Created from ${file.name}`)
      setSaveStep('Uploading video…')
      abortRef.current = new AbortController()
      const saved = await projectsApi.uploadVideo(
        projectId,
        file,
        meta.duration ? { duration: meta.duration, width: meta.width, height: meta.height } : undefined,
        (f) => {
          setUploadPct(f)
          if (f >= 1) setSaveStep('Reading the video on the server…')
        },
        abortRef.current.signal
      )
      replaceProject(saved)
      navigate(`/studio/process/${saved.id}`)
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      // Don't leave an empty project behind when the upload didn't make it.
      if (projectId) await deleteProject(projectId).catch(() => undefined)
      setStage('ready')
      if (aborted) toast('Upload canceled', 'info')
      else setError(e instanceof ApiError ? e.message : 'Upload failed. Please try again.')
    } finally {
      abortRef.current = null
    }
  }

  const importProject = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      const raw: Partial<Project> = data.project ?? data
      if (!raw.title || !Array.isArray(raw.transcript)) throw new Error('bad')
      const base = blankProject(raw.title)
      const p: Project = { ...base, ...raw, id: generateId(), isDemo: false, videoFile: undefined, version: undefined, createdAt: base.createdAt, updatedAt: base.updatedAt }
      const id = await addProject(p)
      toast(`Imported '${p.title}'`)
      navigate(`/studio/transcript/${id}`)
    } catch (e) {
      setError(e instanceof ApiError ? `Import failed: ${e.message}` : 'That file is not a CREOVOX project export (.json).')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <p className="eyebrow">Step 01 · New project</p>
        <h1 className="mt-2 font-heading text-2xl font-bold text-text-primary sm:text-3xl">
          Bring in your <span className="serif-accent text-brand-highlight">footage</span>
        </h1>
        <p className="mt-1 text-text-secondary">Your video is uploaded to your private workspace, then transcribed and analysed on the server.</p>
      </motion.div>

      <AnimatePresence mode="wait">
        {stage === 'idle' && (
          <motion.div key="drop" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">
            <button
              type="button"
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) void handleFile(f)
              }}
              onClick={() => inputRef.current?.click()}
              className={`glass-panel group relative block w-full overflow-hidden border-2 border-dashed !p-0 text-center transition-all ${
                isDragging ? '!border-brand-primary bg-brand-primary/5' : '!border-white/10 hover:!border-brand-primary/40'
              }`}
            >
              <div className="ambient-orb left-1/2 top-0 h-64 w-64 -translate-x-1/2 opacity-40 transition-opacity group-hover:opacity-70" />
              <div className="relative px-6 py-14 sm:py-20">
                <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_0_40px_-10px_rgba(255,91,22,0.8)]">
                  <UploadCloud className={`h-8 w-8 transition-colors ${isDragging ? 'text-brand-primary' : 'text-brand-highlight'}`} />
                </span>
                <span className="block font-heading text-lg font-semibold text-text-primary sm:text-xl">
                  <span className="hidden sm:inline">Drag and drop your video, or </span>
                  <span className="text-brand-highlight">browse files</span>
                </span>
                <span className="mt-3 block text-sm text-text-muted">MP4, WebM, MOV, AVI, MKV — up to 2 GB</span>
              </div>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="video/*,.mkv,.avi,.mov"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link to="/studio/editor/demo-1" className="glass-panel card-interactive flex min-h-[64px] items-center gap-3 !rounded-2xl p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <Play className="h-5 w-5" />
                </span>
                <span className="text-left">
                  <span className="block text-sm font-medium text-text-primary">Explore the demo project</span>
                  <span className="block text-xs text-text-muted">Pre-filled with sample data</span>
                </span>
              </Link>
              <button type="button" onClick={() => importRef.current?.click()} className="glass-panel card-interactive flex min-h-[64px] items-center gap-3 !rounded-2xl p-4 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-text-secondary">
                  <FileJson className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-text-primary">Import a project file</span>
                  <span className="block text-xs text-text-muted">.json exported from Export Studio</span>
                </span>
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importProject(f)
                  e.target.value = ''
                }}
              />
            </div>
          </motion.div>
        )}

        {stage === 'reading' && (
          <motion.div key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Panel className="flex items-center gap-4 p-6">
              <Loader className="h-6 w-6 animate-spin text-brand-primary" />
              <div className="min-w-0">
                <p className="truncate font-medium text-text-primary">{file?.name}</p>
                <p className="text-sm text-text-muted">Reading video details…</p>
              </div>
            </Panel>
          </motion.div>
        )}

        {(stage === 'ready' || stage === 'saving') && file && meta && objectUrl && (
          <motion.div key="preview" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="overflow-hidden rounded-section border border-white/[0.07] bg-black">
              {previewable ? (
                <video src={objectUrl} controls playsInline className="max-h-[56vh] w-full bg-black object-contain" />
              ) : (
                <div className="flex aspect-video max-h-[56vh] w-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <FileIcon className="h-8 w-8 text-text-muted" />
                  <p className="text-sm text-text-secondary">Your browser can't preview this format.</p>
                  <p className="text-xs text-text-muted">That's fine: the server converts it to a playable copy after upload.</p>
                </div>
              )}
            </div>

            <Panel className="p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="font-heading font-semibold text-text-primary">File details</h2>
                {previewable && <RealBadge label="Read in your browser" />}
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  { icon: FileIcon, label: 'File name', value: file.name },
                  { icon: HardDrive, label: 'Size', value: formatFileSize(file.size) },
                  { icon: Clock, label: 'Duration', value: meta.duration ? formatDuration(meta.duration) : 'Read after upload' },
                  { icon: Monitor, label: 'Resolution', value: meta.width ? `${meta.width}×${meta.height}` : previewable ? 'Audio only' : 'Read after upload' },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="min-w-0">
                    <div className="mb-1 flex items-center gap-1.5 text-xs text-text-muted">
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </div>
                    <p className="truncate text-sm font-medium text-text-primary" title={value}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="space-y-4 p-5">
              <Field label="Project title">
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Weekly podcast — Ep. 12" />
              </Field>
              <Field label="Description (optional)">
                <textarea className="input min-h-[80px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} />
              </Field>
            </Panel>

            {stage === 'saving' ? (
              <Panel className="space-y-3 p-5">
                <div className="flex items-center gap-3">
                  <Loader className="h-5 w-5 animate-spin text-brand-primary" />
                  <span className="flex-1 text-sm text-text-secondary">{saveStep}</span>
                  <span className="font-mono text-xs text-text-muted">{Math.round(uploadPct * 100)}%</span>
                  {uploadPct < 1 && (
                    <button type="button" className="btn-ghost !min-h-[36px] !text-sm" onClick={() => abortRef.current?.abort()}>
                      Cancel
                    </button>
                  )}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(uploadPct * 100)} aria-label="Upload progress">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-[width] duration-200" style={{ width: `${uploadPct * 100}%` }} />
                </div>
              </Panel>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={reset} className="btn-secondary">
                  <X className="h-4 w-4" /> Replace file
                </button>
                <button type="button" onClick={createProject} className="btn-primary flex-1">
                  Create project & analyse <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="flex items-start gap-3 rounded-2xl border border-status-error/30 bg-status-error/10 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-status-error" />
            <p className="flex-1 text-sm text-status-error">{error}</p>
            <button type="button" className="icon-btn !h-8 !w-8" aria-label="Dismiss error" onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Notice>
        <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
          <ShieldCheck className="h-4 w-4 text-status-success" /> Private to your account
        </span>
        <br />
        Only you can see your uploads. After upload the server transcribes the speech with Whisper, finds highlights, builds subtitles and renders clips with ffmpeg. You can
        delete a project and its video at any time from the Project Library.
      </Notice>
    </div>
  )
}

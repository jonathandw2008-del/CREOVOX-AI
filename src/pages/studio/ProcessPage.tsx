import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AudioWaveform, FileText, Sparkles, Captions, CheckCircle2, Loader, RefreshCw } from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import { Modal, Notice, Panel, RealBadge, SimBadge, Waveform } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { extractWaveform, getVideoBlob, syntheticWaveform } from '@/lib/media'
import { simulateHighlights, simulateTranscript } from '@/lib/generators'
import { segmentsFromTranscript } from '@/lib/subtitles'
import type { Project } from '@/types'
import { cn, sleep } from '@/utils/helpers'
import { toast } from '@/store/useToast'

const STEPS = [
  { icon: AudioWaveform, label: 'Extracting audio waveform', done: 'Waveform extracted' },
  { icon: FileText, label: 'Transcribing speech', done: 'Transcript generated' },
  { icon: Sparkles, label: 'Detecting highlights', done: 'Highlights detected' },
  { icon: Captions, label: 'Building subtitles & workspace', done: 'Workspace ready' },
]

/** Prevents duplicate runs across StrictMode remounts and navigation. */
const running = new Set<string>()

function Analysis({ project }: { project: Project }) {
  const updateProject = useAppStore((s) => s.updateProject)
  const markStep = useAppStore((s) => s.markStep)
  const logActivity = useAppStore((s) => s.logActivity)
  const alreadyDone = project.completedSteps.includes('process') && project.transcript.length > 0
  const [current, setCurrent] = useState(alreadyDone ? STEPS.length : -1)
  const [progress, setProgress] = useState(0)
  const [realWave, setRealWave] = useState<boolean | null>(alreadyDone ? !!project.waveformIsReal : null)
  const [confirm, setConfirm] = useState(false)
  const projectRef = useRef(project)
  projectRef.current = project

  const run = useCallback(async () => {
    const p = projectRef.current
    if (running.has(p.id)) return
    running.add(p.id)
    updateProject(p.id, { status: 'processing' })
    const animate = async (ms: number) => {
      const t0 = performance.now()
      while (performance.now() - t0 < ms) {
        setProgress(Math.min(100, ((performance.now() - t0) / ms) * 100))
        await sleep(50)
      }
      setProgress(100)
    }
    try {
      // 1 — waveform (real when a local file exists)
      setCurrent(0)
      setProgress(0)
      let waveform: number[] | null = null
      if (p.videoFile) {
        const blob = await getVideoBlob(p.videoFile.storageKey)
        const [wf] = await Promise.all([blob ? extractWaveform(blob) : Promise.resolve(null), animate(900)])
        waveform = wf
      } else await animate(900)
      const isReal = !!waveform
      setRealWave(isReal)
      const wf = waveform ?? syntheticWaveform(p.id)

      // 2 — transcript (simulated)
      setCurrent(1)
      setProgress(0)
      await animate(1300)
      const transcript = p.transcript.length && p.isDemo ? p.transcript : simulateTranscript(p.duration)

      // 3 — highlights
      setCurrent(2)
      setProgress(0)
      await animate(1100)
      const highlights = simulateHighlights(transcript, p.duration, isReal ? wf : undefined, p.id)

      // 4 — subtitles
      setCurrent(3)
      setProgress(0)
      await animate(700)
      updateProject(p.id, (prev) => ({
        status: 'ready',
        waveform: wf,
        waveformIsReal: isReal,
        transcript,
        highlights,
        subtitles: [{ id: 'sub-en', language: 'English', languageCode: 'en', segments: segmentsFromTranscript(transcript) }, ...prev.subtitles.filter((t) => t.languageCode !== 'en')],
      }))
      markStep(p.id, 'process')
      logActivity(`Analysis finished for '${p.title}'`, 'process', p.id)
      setCurrent(STEPS.length)
    } finally {
      running.delete(p.id)
    }
  }, [updateProject, markStep, logActivity])

  useEffect(() => {
    if (!alreadyDone) void run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const complete = current >= STEPS.length
  const wf = project.waveform ?? syntheticWaveform(project.id)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Panel className="p-5 sm:p-6">
        <div className="mb-6 h-20 overflow-hidden rounded-2xl border border-white/[0.06] bg-black/30 px-3 py-3">
          <Waveform peaks={complete || current > 0 ? wf : wf.map((x) => x * 0.25)} progress={complete ? 1 : current === 0 ? progress / 100 : current > 0 ? 1 : 0} bars={160} />
        </div>
        <ol className="space-y-1">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = index === current
            const isDone = index < current
            return (
              <motion.li key={step.label} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }} className="flex items-center gap-4 rounded-2xl px-2 py-3">
                <span
                  className={cn(
                    'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-all',
                    isDone ? 'bg-status-success/10' : isActive ? 'bg-brand-primary/15 shadow-[0_0_24px_-6px_rgba(255,91,22,0.8)]' : 'bg-white/[0.04]'
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-5 w-5 text-status-success" /> : isActive ? <Loader className="h-5 w-5 animate-spin text-brand-primary" /> : <Icon className="h-5 w-5 text-text-muted" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('text-sm font-medium', isDone ? 'text-status-success' : isActive ? 'text-text-primary' : 'text-text-muted')}>{isDone ? step.done : step.label}</p>
                    {index === 0 && realWave !== null && (realWave ? <RealBadge label="Real audio analysis" /> : <SimBadge label="Synthetic waveform" />)}
                    {(index === 1 || index === 2) && <SimBadge />}
                  </div>
                  {isActive && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-[width] duration-100" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
              </motion.li>
            )
          })}
        </ol>
      </Panel>

      <div className="space-y-4">
        {complete ? (
          <Panel className="p-6 text-center">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-status-success/10">
              <CheckCircle2 className="h-7 w-7 text-status-success" />
            </span>
            <h2 className="font-heading text-xl font-bold text-text-primary">Analysis complete</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                ['Segments', project.transcript.length],
                ['Highlights', project.highlights.length],
                ['Tracks', project.subtitles.length],
              ].map(([k, v]) => (
                <div key={k} className="glass-inset p-3">
                  <dt className="text-[11px] text-text-muted">{k}</dt>
                  <dd className="font-heading text-xl font-bold text-text-primary">{v}</dd>
                </div>
              ))}
            </dl>
            <button type="button" onClick={() => setConfirm(true)} className="btn-ghost mt-4 w-full">
              <RefreshCw className="h-4 w-4" /> Re-run analysis
            </button>
          </Panel>
        ) : (
          <Panel className="p-6">
            <p className="text-sm text-text-secondary">You can leave this page — analysis keeps running and results are saved to the project.</p>
          </Panel>
        )}
        <Notice>
          <strong className="text-text-primary">What's real here?</strong> The waveform is decoded from your file with the Web Audio API and used to weight highlight scores. Transcription and
          highlight labels are <strong className="text-status-info">simulated</strong> placeholders you can edit in the next steps.
        </Notice>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} labelledBy="rerun-title">
        <h3 id="rerun-title" className="font-heading text-lg font-semibold text-text-primary">
          Re-run analysis?
        </h3>
        <p className="mt-2 text-sm text-text-secondary">This replaces the transcript, highlights and English subtitle track with fresh results. Edits to them will be lost.</p>
        <div className="mt-6 flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={() => setConfirm(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => {
              setConfirm(false)
              void run()
            }}
          >
            Re-run
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default function ProcessPage() {
  return (
    <ProjectShell
      step="process"
      title="AI Analysis"
      subtitle="Preparing transcript, highlights and subtitles for your video."
      onNext={(p) => {
        if (p.transcript.length > 0 && p.completedSteps.includes('process')) return
        toast('Analysis is still running — hang tight.', 'info')
        return false
      }}
    >
      {(p) => <Analysis project={p} />}
    </ProjectShell>
  )
}

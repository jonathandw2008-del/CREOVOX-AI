import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Upload, Cpu, Wand2, Download, ArrowRight } from 'lucide-react'
import { SectionHeading } from './SectionHeading'
import { ExportMini, HighlightsMini, SubtitlesMini, TranscriptMini, EditorMini } from './FeatureVisuals'

interface Step {
  n: string
  title: string
  body: string
  icon: typeof Upload
  bullets: string[]
  visual: ReactNode
}

export const STEPS: Step[] = [
  {
    n: '01',
    title: 'Drop in your video',
    body: 'MP4, WebM or MOV up to 2 GB. CREOVOX reads it locally, captures a poster frame and stores it in your browser — nothing is uploaded.',
    icon: Upload,
    bullets: ['Drag & drop or browse', 'Instant metadata & preview', 'Survives page reloads'],
    visual: (
      <div className="glass-inset flex aspect-[16/10] flex-col items-center justify-center gap-3 border-dashed p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/15 shadow-[0_0_40px_-8px_rgba(255,91,22,0.9)]">
          <Upload className="h-7 w-7 text-brand-highlight" />
        </span>
        <p className="font-mono text-xs text-text-secondary">keynote_final.mp4 · 1.2 GB · 42:18</p>
        <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-highlight" initial={{ width: '0%' }} whileInView={{ width: '100%' }} viewport={{ once: true }} transition={{ duration: 1.8, ease: 'easeInOut' }} />
        </div>
      </div>
    ),
  },
  {
    n: '02',
    title: 'Analyse the footage',
    body: 'The real audio waveform is decoded on-device and used to score highlight candidates. A simulated transcript gives you an editable starting point.',
    icon: Cpu,
    bullets: ['Real Web Audio waveform', 'Simulated transcript & labels', 'Editable timestamps'],
    visual: (
      <div className="space-y-3">
        <HighlightsMini />
        <TranscriptMini />
      </div>
    ),
  },
  {
    n: '03',
    title: 'Shape every asset',
    body: 'Trim clips for each aspect ratio, style multilingual subtitles, design thumbnails from real frames and generate platform copy.',
    icon: Wand2,
    bullets: ['Touch-friendly timeline', 'Subtitle styling & import', 'Content for six platforms'],
    visual: (
      <div className="space-y-3">
        <EditorMini />
        <SubtitlesMini />
      </div>
    ),
  },
  {
    n: '04',
    title: 'Export & publish',
    body: 'Render real clips with MediaRecorder, then download SRT/VTT, PNG thumbnails, Markdown copy and a re-importable project file.',
    icon: Download,
    bullets: ['WebM / MP4 clip rendering', 'Burned-in subtitles', 'One-click content package'],
    visual: <ExportMini />,
  },
]

export default function HowItWorksSection({ hideLink = false }: { hideLink?: boolean }) {
  return (
    <section id="workflow" className="section-padding relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Workflow" title={<>From raw footage to <span className="serif-accent text-brand-highlight">publish-ready</span>.</>} body="Four steps, one continuous project. Each card stacks as you scroll — just like the pipeline it describes." />

        <div className="mt-16 space-y-6 md:space-y-0">
          {STEPS.map((s, i) => (
            <div key={s.n} className="md:sticky md:pb-10" style={{ top: `calc(96px + ${i * 22}px)` }}>
              <motion.article
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="glass-panel relative grid gap-8 overflow-hidden p-6 !bg-[#11151b]/95 sm:p-8 md:grid-cols-2 md:items-center md:p-10"
              >
                <div className="ambient-orb -left-20 -top-24 h-64 w-64 opacity-30" />
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-brand-secondary">{s.n}</span>
                    <span className="h-px w-10 bg-brand-secondary/40" />
                    <s.icon className="h-5 w-5 text-text-muted" />
                  </div>
                  <h3 className="mt-5 font-heading text-2xl font-bold text-text-primary sm:text-3xl">{s.title}</h3>
                  <p className="mt-3 leading-relaxed text-text-secondary">{s.body}</p>
                  <ul className="mt-5 space-y-2">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2.5 text-sm text-text-secondary">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(255,91,22,0.9)]" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="relative">{s.visual}</div>
              </motion.article>
            </div>
          ))}
        </div>

        {!hideLink && (
          <div className="mt-10 flex justify-center">
            <Link to="/how-it-works" className="btn-secondary">
              Explore the full workflow <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

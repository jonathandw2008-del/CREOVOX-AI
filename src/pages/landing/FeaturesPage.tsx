import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Check, Film, FileText, Sparkles, Captions, Image, PenTool, Users, Download, ArrowRight, FlaskConical, Cpu } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { SectionHeading } from '@/components/marketing/SectionHeading'
import { AudienceMini, EditorMini, ExportMini, HighlightsMini, SubtitlesMini, ThumbnailsMini, TranscriptMini, WriterMini } from '@/components/marketing/FeatureVisuals'
import CTASection from '@/components/marketing/CTASection'
import { cn } from '@/utils/helpers'

const features: { icon: typeof Film; title: string; body: string; bullets: string[]; visual: ReactNode; ai: boolean; to: string }[] = [
  { icon: Film, title: 'Smart video editor', body: 'A timeline built for thumbs and trackpads. Drag clips, trim edges, split at the playhead and preview each clip in its own aspect ratio.', bullets: ['Zoomable, touch-draggable timeline', 'Split, duplicate, reorder, undo/redo', 'Per-clip 16:9, 9:16 or 1:1 framing', 'Keyboard shortcuts on desktop'], visual: <EditorMini />, ai: false, to: '/studio/editor' },
  { icon: FileText, title: 'Transcription', body: 'Whisper transcribes your speech with word-level timing and detects the language. Correct any line, then push it straight into your subtitle track.', bullets: ['Whisper with word timestamps', 'Automatic language detection', 'Click any timestamp to play', 'Search, TXT export & copy'], visual: <TranscriptMini />, ai: true, to: '/studio/transcript' },
  { icon: Sparkles, title: 'Highlight detection', body: 'AI reads your transcript and audio energy to find self-contained moments that work as clips, each with a title, category and confidence score.', bullets: ['AI picks sentence-aligned moments', 'Weighted by real audio energy', 'Category filters & scoring', 'Add manual highlights'], visual: <HighlightsMini />, ai: true, to: '/studio/highlights' },
  { icon: Captions, title: 'Subtitle Studio', body: 'Subtitle cues built from word timings, AI translation into other languages, readability hints and full typographic control.', bullets: ['AI translation, incl. Tamil & Hindi', 'Import & export SRT / VTT', 'Live styled preview', 'Characters-per-second warnings'], visual: <SubtitlesMini />, ai: true, to: '/studio/subtitles' },
  { icon: Image, title: 'Thumbnail Studio', body: 'A vision model picks the strongest frames from your video and writes punchy overlay text. Fine-tune any design; the PNG matches the preview exactly.', bullets: ['AI frame picks & headlines', 'Bold, minimal, cinematic & editorial', 'Custom colours & positioning', '1280×720 PNG export'], visual: <ThumbnailsMini />, ai: true, to: '/studio/thumbnails' },
  { icon: PenTool, title: 'AI Content Writer', body: 'Titles, descriptions with chapters, captions and hashtags for six platforms, in five tones — with live character limits.', bullets: ['Grounded in your transcript', 'YouTube chapters from highlights', 'Platform character limits', 'Per-field regenerate'], visual: <WriterMini />, ai: true, to: '/studio/content' },
  { icon: Users, title: 'Audience Personalization', body: 'Compare student, professional and general-audience versions side by side and fine-tune each one.', bullets: ['Three audience presets', 'Written in the language you choose', 'Compare or focus layouts', 'Editable hashtags'], visual: <AudienceMini />, ai: true, to: '/studio/audience' },
  { icon: Download, title: 'Export Studio', body: 'The server renders MP4 or WebM clips with ffmpeg and bundles every asset into one ZIP, including a re-importable project file.', bullets: ['ffmpeg MP4 / WebM rendering', 'Burned-in styled subtitles', 'One-click ZIP package', 'SRT, VTT, PNG, MD, JSON'], visual: <ExportMini />, ai: false, to: '/studio/export' },
]

export default function FeaturesPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-brand-bg">
      <Navbar />
      <main>
        <section className="noise section-padding relative overflow-hidden pb-16 pt-36 sm:pt-44">
          <div className="grid-fade pointer-events-none absolute inset-0" aria-hidden />
          <div className="ambient-orb left-1/2 top-0 h-[420px] w-[min(800px,120vw)] -translate-x-1/2 opacity-60" aria-hidden />
          <div className="relative">
            <SectionHeading
              eyebrow="Features"
              title={<>Everything you need to <span className="serif-accent text-brand-highlight">create, repurpose</span> and publish.</>}
              body="Eight production modules share one project, saved to your account. Look for the badges: they show which modules use AI and which are hands-on editing tools."
            />
            <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-status-success/30 bg-status-success/10 px-3 py-1.5 text-status-success">
                <Cpu className="h-3.5 w-3.5" /> Editing tool
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-status-info/30 bg-status-info/10 px-3 py-1.5 text-status-info">
                <FlaskConical className="h-3.5 w-3.5" /> AI-powered
              </span>
            </div>
          </div>
        </section>

        <section className="section-padding pb-12">
          <div className="mx-auto max-w-6xl space-y-6">
            {features.map((f, i) => (
              <motion.article
                key={f.title}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="glass-panel grid items-center gap-8 overflow-hidden p-6 sm:p-8 md:grid-cols-2 md:p-10"
              >
                <div className={cn(i % 2 === 1 && 'md:order-2')}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                      <f.icon className="h-5 w-5" />
                    </span>
                    <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium', f.ai ? 'border-status-info/30 bg-status-info/10 text-status-info' : 'border-status-success/30 bg-status-success/10 text-status-success')}>{f.ai ? 'AI-powered' : 'Editing tool'}</span>
                  </div>
                  <h2 className="mt-5 font-heading text-2xl font-bold text-text-primary sm:text-3xl">{f.title}</h2>
                  <p className="mt-3 leading-relaxed text-text-secondary">{f.body}</p>
                  <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-text-secondary">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-success" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Link to={f.to} className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand-highlight hover:text-brand-secondary">
                    Open {f.title} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className={cn('relative', i % 2 === 1 && 'md:order-1')}>
                  <div className="ambient-orb left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 opacity-40" />
                  <div className="relative">{f.visual}</div>
                </div>
              </motion.article>
            ))}
          </div>
        </section>
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}

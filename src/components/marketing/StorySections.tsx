import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useScroll, useTransform, useReducedMotion, AnimatePresence, type MotionValue } from 'framer-motion'
import { Plus, Youtube, Instagram, Music2, Linkedin, Twitter, Facebook, Mic, GraduationCap, Podcast, Clapperboard } from 'lucide-react'
import { SectionHeading } from './SectionHeading'
import { cn } from '@/utils/helpers'

/* ------------------------------ Marquee ------------------------------ */

const PLATFORMS = [
  { icon: Youtube, label: 'YouTube' },
  { icon: Music2, label: 'TikTok' },
  { icon: Instagram, label: 'Reels' },
  { icon: Linkedin, label: 'LinkedIn' },
  { icon: Twitter, label: 'X' },
  { icon: Facebook, label: 'Facebook' },
  { icon: Podcast, label: 'Podcasts' },
  { icon: GraduationCap, label: 'Lectures' },
  { icon: Mic, label: 'Interviews' },
  { icon: Clapperboard, label: 'Keynotes' },
]

export function PlatformMarquee() {
  return (
    <section aria-label="Built for every platform" className="relative border-y border-white/[0.05] py-8">
      <p className="mb-5 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-text-muted">Repurpose once — publish everywhere</p>
      <div className="mask-fade-x overflow-hidden">
        <div className="animate-marquee flex w-max gap-12 pr-12">
          {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
            <span key={i} className="flex items-center gap-2.5 text-text-muted" aria-hidden={i >= PLATFORMS.length}>
              <p.icon className="h-5 w-5" />
              <span className="font-heading text-lg font-medium tracking-tight">{p.label}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------- Scroll-filled statement ------------------------- */

const STATEMENT = 'Most of your best moments are buried inside long videos. CREOVOX finds them, frames them, captions them and writes the words around them — so one recording becomes a week of content.'

function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.16, 1])
  return (
    <motion.span style={{ opacity }} className="mr-[0.25em] inline-block">
      {children}
    </motion.span>
  )
}

export function StatementSection() {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 45%'] })
  const words = STATEMENT.split(' ')
  return (
    <section className="section-padding py-24 md:py-36">
      <p ref={ref} className="text-balance mx-auto max-w-5xl font-heading text-[clamp(1.6rem,4.2vw,3.4rem)] font-medium leading-[1.15] tracking-[-0.02em] text-text-primary">
        {words.map((w, i) => (
          <Word key={i} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
            {w}
          </Word>
        ))}
      </p>
    </section>
  )
}

/* -------------------------------- Stats -------------------------------- */

function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? to : 0)
  useEffect(() => {
    if (!inView || reduce) return
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400)
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [inView, reduce, to])
  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  )
}

const STATS = [
  { value: 10, label: 'Connected modules', sub: 'One shared project state' },
  { value: 10, label: 'Subtitle languages', sub: 'Real SRT & VTT export' },
  { value: 6, label: 'Platforms', sub: 'Copy tuned for each' },
  { value: 0, label: 'Servers', sub: 'Everything runs locally', suffix: '' },
]

export function StatsSection() {
  return (
    <section className="section-padding relative py-20">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none text-center font-heading text-[clamp(8rem,30vw,22rem)] font-bold leading-none tracking-[-0.06em] text-white/[0.025]" aria-hidden>
        local
      </div>
      <div className="relative mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-section border border-white/[0.06] bg-white/[0.06] lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="bg-brand-bg/85 p-6 backdrop-blur sm:p-8">
            <p className="font-heading text-5xl font-bold tracking-tight text-text-primary sm:text-6xl">
              <Counter to={s.value} suffix={s.suffix} />
              <span className="text-brand-primary">.</span>
            </p>
            <p className="mt-3 text-sm font-medium text-text-primary">{s.label}</p>
            <p className="text-xs text-text-muted">{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* --------------------------------- FAQ --------------------------------- */

const FAQS = [
  {
    q: 'Is the AI in CREOVOX real?',
    a: 'Partly — and we label which parts. Waveform analysis, frame capture, subtitle files, thumbnail rendering and clip rendering genuinely run in your browser. Transcription, highlight labels, translations and written copy are simulated from templates and sample data, marked with a “Simulated AI” badge everywhere they appear.',
  },
  { q: 'Do my videos get uploaded anywhere?', a: 'No. There is no backend. Your file is read by the browser and stored in IndexedDB on this device so it survives a reload. Project data lives in localStorage.' },
  { q: 'Can I export real video clips?', a: 'Yes. Export Studio re-encodes each clip in real time with the MediaRecorder API — cropped to 16:9, 9:16 or 1:1, optionally with burned-in subtitles. Output is WebM (and MP4 where the browser supports it).' },
  { q: 'Do I need an account?', a: 'No sign-up, no login. Open the studio and start creating. Use the project JSON export to move work between browsers.' },
  { q: 'Does it work on my phone?', a: 'Yes. The studio is fully responsive with 44px touch targets, a touch-draggable timeline and a bottom action bar. Rendering long clips is best on a desktop browser.' },
]

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="section-padding scroll-mt-24 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.4fr]">
        <SectionHeading align="left" eyebrow="FAQ" title={<>Honest answers, <span className="serif-accent text-brand-highlight">no fine print.</span></>} body="CREOVOX is a frontend-only concept studio. Here's exactly what it does — and doesn't — do." />
        <ul className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i
            return (
              <li key={f.q} className={cn('glass-panel overflow-hidden !rounded-2xl transition-colors', isOpen && '!border-brand-primary/25')}>
                <h3>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)} className="flex min-h-[60px] w-full items-center gap-4 px-5 text-left">
                    <span className="flex-1 font-heading text-base font-medium text-text-primary sm:text-lg">{f.q}</span>
                    <Plus className={cn('h-5 w-5 flex-shrink-0 text-brand-highlight transition-transform duration-300', isOpen && 'rotate-45')} />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                      <p className="px-5 pb-5 text-sm leading-relaxed text-text-secondary sm:text-base">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

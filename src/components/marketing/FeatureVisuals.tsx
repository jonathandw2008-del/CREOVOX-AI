import { useEffect, useId, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { useRef } from 'react'
import { FileVideo, Captions, Image as ImageIcon, FileJson, Check, GraduationCap, Briefcase, Users } from 'lucide-react'

function useTicker(n: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-10% 0px' })
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!inView || reduce) return
    const t = setInterval(() => setI((x) => (x + 1) % n), ms)
    return () => clearInterval(t)
  }, [inView, reduce, n, ms])
  return { ref, i, inView }
}

const BARS = Array.from({ length: 48 }, (_, i) => 0.2 + Math.abs(Math.sin(i * 0.5) * 0.55 + Math.sin(i * 0.13) * 0.3))

export function EditorMini() {
  const reduce = useReducedMotion()
  return (
    <div className="glass-inset relative overflow-hidden p-3">
      <div className="flex h-10 items-center gap-[2px]">
        {BARS.map((h, i) => (
          <span key={i} className="flex-1 rounded-full bg-white/15" style={{ height: `${h * 100}%` }} />
        ))}
      </div>
      <div className="relative mt-2 h-7">
        {[
          [3, 20, '16:9'],
          [28, 16, '9:16'],
          [50, 24, '1:1'],
          [80, 16, '9:16'],
        ].map(([l, w, r], i) => (
          <span key={i} className={`absolute inset-y-0 flex items-center justify-center rounded-lg border font-mono text-[9px] ${i === 1 ? 'border-brand-primary bg-brand-primary/35 text-white' : 'border-brand-primary/40 bg-brand-primary/15 text-brand-highlight'}`} style={{ left: `${l}%`, width: `${w}%` }}>
            {r}
          </span>
        ))}
      </div>
      <motion.span className="absolute bottom-2 top-2 w-0.5 bg-white shadow-[0_0_8px_white]" animate={reduce ? undefined : { left: ['6%', '94%'] }} transition={{ duration: 7, repeat: Infinity, ease: 'linear' }} style={{ left: '35%' }} />
    </div>
  )
}

export function HighlightsMini() {
  const { ref, i } = useTicker(3, 1800)
  const regions = [
    [8, 18],
    [42, 16],
    [70, 20],
  ]
  return (
    <div ref={ref} className="glass-inset relative overflow-hidden p-3">
      <div className="relative flex h-16 items-center gap-[2px]">
        {BARS.map((h, k) => {
          const pos = (k / BARS.length) * 100
          const inR = regions.some(([l, w]) => pos >= l && pos <= l + w)
          return <span key={k} className={`flex-1 rounded-full transition-colors duration-500 ${inR ? 'bg-brand-secondary' : 'bg-white/15'}`} style={{ height: `${h * 100}%` }} />
        })}
        {regions.map(([l, w], k) => (
          <span key={k} className={`absolute inset-y-0 rounded-lg border transition-all duration-500 ${k === i ? 'border-brand-primary bg-brand-primary/15 shadow-[0_0_24px_-4px_rgba(255,91,22,0.8)]' : 'border-white/10'}`} style={{ left: `${l}%`, width: `${w}%` }} />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px]">
        {['94%', '88%', '91%'].map((s, k) => (
          <span key={k} className={k === i ? 'text-brand-highlight' : 'text-text-muted'}>
            {['Hook', 'Quote', 'Takeaway'][k]} · {s}
          </span>
        ))}
      </div>
    </div>
  )
}

const LANGS = [
  ['EN', 'Welcome back to the future of video.'],
  ['ES', 'Bienvenidos al futuro del video.'],
  ['JA', 'ビデオの未来へようこそ。'],
  ['HI', 'वीडियो के भविष्य में आपका स्वागत है।'],
  ['FR', 'Bienvenue dans le futur de la vidéo.'],
]

export function SubtitlesMini() {
  const { ref, i } = useTicker(LANGS.length, 1700)
  return (
    <div ref={ref} className="glass-inset space-y-3 p-3">
      <div className="flex flex-wrap gap-1">
        {LANGS.map(([l], k) => (
          <span key={l} className={`rounded-md px-2 py-0.5 font-mono text-[10px] transition-colors ${k === i ? 'bg-brand-primary text-white' : 'bg-white/[0.05] text-text-muted'}`}>
            {l}
          </span>
        ))}
      </div>
      <div className="relative flex aspect-[16/6] items-end justify-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_30%_30%,rgba(255,91,22,0.3),transparent_60%),linear-gradient(160deg,#18202b,#07080b)] p-3">
        <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded bg-black/70 px-2 py-0.5 text-center text-[11px] font-semibold text-white">
          {LANGS[i][1]}
        </motion.span>
      </div>
      <p className="font-mono text-[10px] text-text-muted">00:00:01,200 → 00:00:04,800</p>
    </div>
  )
}

export function ThumbnailsMini() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  const cards = [
    { bg: 'bg-[#1a1a2e]', text: '5 AI TRENDS', cls: 'font-black uppercase', rot: -8, x: -30 },
    { bg: 'bg-[#2a1006]', text: 'Five trends every creator needs', cls: 'serif-accent text-brand-highlight', rot: 0, x: 0 },
    { bg: 'bg-[#0f0f1a]', text: 'The Future of Video', cls: 'font-medium', rot: 8, x: 30 },
  ]
  return (
    <div ref={ref} className="relative flex h-36 items-center justify-center" style={{ perspective: 800 }}>
      {cards.map((c, k) => (
        <motion.div
          key={k}
          initial={{ rotate: 0, x: 0, y: 10, opacity: 0 }}
          animate={inView ? { rotate: c.rot, x: `${c.x}%`, y: k === 1 ? -6 : 6, opacity: 1 } : undefined}
          transition={{ delay: 0.1 * k, type: 'spring', stiffness: 120, damping: 16 }}
          className={`absolute aspect-video w-[48%] overflow-hidden rounded-xl border border-white/10 shadow-2xl shadow-black/60 ${c.bg}`}
          style={{ zIndex: k === 1 ? 3 : 1 }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(255,91,22,0.45),transparent_60%)]" />
          <span className={`absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-[11px] leading-tight text-white ${c.cls}`}>{c.text}</span>
          {k === 0 && <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-primary" />}
        </motion.div>
      ))}
    </div>
  )
}

const COPY = '5 AI Trends That Are Changing Video Production — and how to use them today.'

export function WriterMini() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-10% 0px' })
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? COPY.length : 0)
  useEffect(() => {
    if (!inView || reduce) return
    const t = setInterval(() => setN((x) => (x >= COPY.length + 24 ? 0 : x + 1)), 45)
    return () => clearInterval(t)
  }, [inView, reduce])
  return (
    <div ref={ref} className="glass-inset space-y-2 p-3">
      <div className="flex gap-1">
        {['YouTube', 'TikTok', 'LinkedIn'].map((p, k) => (
          <span key={p} className={`rounded-md px-2 py-0.5 text-[10px] ${k === 0 ? 'bg-brand-primary/15 text-brand-highlight' : 'bg-white/[0.04] text-text-muted'}`}>
            {p}
          </span>
        ))}
      </div>
      <p className="min-h-[3.2em] text-sm leading-snug text-text-primary">
        {COPY.slice(0, Math.min(n, COPY.length))}
        <span className="animate-blink ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-brand-primary" />
      </p>
      <div className="flex flex-wrap gap-1">
        {['#AIVideo', '#CreatorTips', '#Shorts'].map((h) => (
          <span key={h} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-text-secondary">
            {h}
          </span>
        ))}
      </div>
    </div>
  )
}

const PERSONAS = [
  { icon: GraduationCap, label: 'Students', line: 'A beginner-friendly guide to AI video tools.' },
  { icon: Briefcase, label: 'Pros', line: 'Strategic briefing: AI-driven content operations.' },
  { icon: Users, label: 'Everyone', line: '5 cool ways AI is changing how we make videos.' },
]

export function AudienceMini() {
  const { ref, i } = useTicker(PERSONAS.length, 2000)
  return (
    <div ref={ref} className="glass-inset p-3">
      <div className="grid grid-cols-3 gap-1.5">
        {PERSONAS.map((p, k) => (
          <span key={p.label} className={`flex flex-col items-center gap-1 rounded-xl border py-2 transition-all duration-500 ${k === i ? 'border-brand-primary/50 bg-brand-primary/10 text-brand-highlight' : 'border-white/[0.06] text-text-muted'}`}>
            <p.icon className="h-4 w-4" />
            <span className="text-[10px]">{p.label}</span>
          </span>
        ))}
      </div>
      <motion.p key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-sm text-text-primary">
        {PERSONAS[i].line}
      </motion.p>
    </div>
  )
}

export function ExportMini() {
  const gid = `eg-${useId().replace(/:/g, '')}`
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const files = [
    { icon: FileVideo, name: 'hook_9x16.webm' },
    { icon: Captions, name: 'subtitles_es.srt' },
    { icon: ImageIcon, name: 'thumbnail_bold.png' },
    { icon: FileJson, name: 'project.json' },
  ]
  return (
    <div ref={ref} className="glass-inset flex items-center gap-4 p-3">
      <svg viewBox="0 0 44 44" className="h-16 w-16 flex-shrink-0 -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <motion.circle cx="22" cy="22" r="18" fill="none" stroke={`url(#${gid})`} strokeWidth="4" strokeLinecap="round" initial={{ pathLength: 0 }} animate={inView ? { pathLength: 1 } : undefined} transition={{ duration: 2.2, ease: 'easeInOut' }} />
        <defs>
          <linearGradient id={gid}>
            <stop stopColor="#FF5B16" />
            <stop offset="1" stopColor="#FFA45E" />
          </linearGradient>
        </defs>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1">
        {files.map((f, k) => (
          <motion.li key={f.name} initial={{ opacity: 0, x: 8 }} animate={inView ? { opacity: 1, x: 0 } : undefined} transition={{ delay: 0.4 + k * 0.4 }} className="flex items-center gap-2 text-[11px] text-text-secondary">
            <f.icon className="h-3.5 w-3.5 flex-shrink-0 text-brand-highlight" />
            <span className="truncate font-mono">{f.name}</span>
            <Check className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-status-success" />
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

const LINES = ['Welcome back to another episode.', "Today we're exploring AI in video.", 'Let me show you five key trends.', 'The first is video summarisation.']

export function TranscriptMini() {
  const { ref, i } = useTicker(LINES.length, 1500)
  return (
    <div ref={ref} className="glass-inset space-y-1 p-2">
      {LINES.map((l, k) => (
        <div key={k} className={`flex gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors duration-300 ${k === i ? 'bg-brand-primary/10 text-text-primary' : 'text-text-muted'}`}>
          <span className="font-mono text-brand-secondary">0:{String(k * 4).padStart(2, '0')}</span>
          <span className="truncate">{l}</span>
        </div>
      ))}
    </div>
  )
}

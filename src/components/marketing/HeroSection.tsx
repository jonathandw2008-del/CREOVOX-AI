import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Play } from 'lucide-react'
import HeroEditor3D from './HeroEditor3D'

const ease = [0.22, 1, 0.36, 1] as const

function Words({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <span
          key={i}
          // overflow-hidden powers the slide-up reveal; padding (cancelled by negative margins) gives
          // descenders and italic overhangs room so they are never clipped.
          className="-mx-[0.08em] -mb-[0.2em] inline-block overflow-hidden px-[0.08em] pb-[0.28em] align-bottom"
        >
          <motion.span className={`inline-block ${className ?? ''}`} initial={{ y: '110%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }} transition={{ delay: delay + i * 0.08, duration: 0.9, ease }}>
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </>
  )
}

const TELEMETRY = [
  ['Modules', '10 connected'],
  ['Subtitles', 'SRT · VTT'],
  ['Formats', '16:9 · 9:16 · 1:1'],
  ['Processing', 'On-device'],
]

export default function HeroSection() {
  return (
    <section className="noise relative overflow-hidden pb-24 pt-32 sm:pt-40 md:pb-36">
      {/* Ambient lighting */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="grid-fade absolute inset-0" />
        <div className="ambient-orb left-1/2 top-[-10%] h-[520px] w-[min(900px,120vw)] -translate-x-1/2 opacity-70" />
        <div className="ambient-orb right-[-10%] top-[40%] h-[380px] w-[380px] opacity-30" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-brand-bg" />
      </div>

      <div className="section-padding relative z-10 mx-auto flex max-w-7xl flex-col items-center text-center">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="glass-nav inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-text-secondary sm:text-sm"
        >
          <span className="rounded-full bg-brand-primary px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-white">New</span>
          One video in. A whole content kit out.
        </motion.span>

        <h1 className="mt-8 max-w-5xl font-heading text-[clamp(2.6rem,8.5vw,6.5rem)] font-bold leading-[0.95] tracking-[-0.04em] text-text-primary">
          <Words text="Create beyond" delay={0.15} />
          <br />
          <Words text="imagination." delay={0.4} className="serif-accent -mb-[0.16em] bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-highlight bg-clip-text pb-[0.16em] pr-2 text-transparent" />
        </h1>

        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.8, ease }} className="text-pretty mt-6 max-w-2xl text-base text-text-secondary sm:text-lg">
          CREOVOX turns long-form video into clips, multilingual subtitles, thumbnails and platform-ready copy — in one cinematic studio that runs right in your browser.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.8, ease }} className="mt-9 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Link to="/studio/upload" className="btn-primary group !min-h-[52px] !px-7 text-base">
            Create a project
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link to="/studio/editor/demo-1" className="btn-secondary !min-h-[52px] !px-7 text-base">
            <Play className="h-4 w-4" /> Explore the demo
          </Link>
        </motion.div>

        <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 1 }} className="mt-12 grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-4">
          {TELEMETRY.map(([k, v]) => (
            <div key={k} className="bg-brand-bg/80 px-4 py-3 text-left backdrop-blur">
              <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">{k}</dt>
              <dd className="mt-1 text-sm font-medium text-text-primary">{v}</dd>
            </div>
          ))}
        </motion.dl>
      </div>

      <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 1.2, ease }} className="relative z-10 mt-16 sm:mt-20">
        <HeroEditor3D />
      </motion.div>
    </section>
  )
}

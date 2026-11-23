import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useScroll, useSpring, useTransform, useReducedMotion } from 'framer-motion'
import { Captions, Image as ImageIcon, Sparkles, Film, PenTool, Users, Download, Scissors, Play, Languages, FileText } from 'lucide-react'

const SUBS = [
  { lang: 'EN', text: 'AI is transforming how we tell stories.' },
  { lang: 'ES', text: 'La IA está transformando cómo contamos historias.' },
  { lang: 'HI', text: 'AI कहानियाँ कहने का तरीका बदल रहा है।' },
  { lang: 'FR', text: "L'IA transforme notre façon de raconter." },
]

const WAVE = Array.from({ length: 64 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.55) * 0.5 + Math.sin(i * 0.17) * 0.3))

function useCycle(n: number, ms: number) {
  const [i, setI] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) return
    const t = setInterval(() => setI((x) => (x + 1) % n), ms)
    return () => clearInterval(t)
  }, [n, ms, reduce])
  return i
}

/** Card floating on its own Z layer. */
function Float({ z, className, delay = 0, children }: { z: number; className: string; delay?: number; children: React.ReactNode }) {
  return (
    <div className={`absolute ${className}`} style={{ transform: `translateZ(${z}px)`, transformStyle: 'preserve-3d' }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 + delay, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
        <div className="animate-float" style={{ animationDelay: `${delay * 2}s` }}>
          {children}
        </div>
      </motion.div>
    </div>
  )
}

const glassCard = 'rounded-2xl border border-white/10 bg-[#141920]/80 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.06)_inset] backdrop-blur-xl'

export default function HeroEditor3D() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const sub = useCycle(SUBS.length, 2600)

  // Scroll: the console tilts back to flat as it enters view.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] })
  const rotateXScroll = useTransform(scrollYProgress, [0, 1], [22, 6])
  const scaleScroll = useTransform(scrollYProgress, [0, 1], [0.92, 1])

  // Pointer parallax (fine pointers only — touch devices get gentle float instead).
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [4, -4]), { stiffness: 120, damping: 20 })
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), { stiffness: 120, damping: 20 })
  const rotateX = useTransform([rotateXScroll, rx], ([a, b]: number[]) => a + b)

  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== 'mouse') return
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    mx.set((e.clientX - r.left) / r.width - 0.5)
    my.set((e.clientY - r.top) / r.height - 0.5)
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => (mx.set(0), my.set(0))}
      className="relative mx-auto w-full max-w-6xl px-2 sm:px-6"
      style={{ perspective: '1800px' }}
    >
      {/* Under-glow */}
      <div className="pointer-events-none absolute inset-x-[10%] -bottom-10 top-1/3 rounded-full bg-brand-primary/25 blur-[90px]" aria-hidden />

      <motion.div style={{ rotateX: reduce ? 8 : rotateX, rotateY: reduce ? 0 : ry, scale: reduce ? 1 : scaleScroll, transformStyle: 'preserve-3d' }} className="relative" aria-hidden>
        {/* ======================= Main window ======================= */}
        <div className={`${glassCard} relative overflow-hidden !rounded-[22px] bg-[#0f1318]/90`} style={{ transform: 'translateZ(0px)' }}>
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 sm:px-4">
            <span className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
            </span>
            <span className="ml-2 truncate font-mono text-[10px] text-text-muted sm:text-[11px]">keynote_2026_final.mp4</span>
            <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-2 py-0.5 font-mono text-[10px] text-brand-highlight sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-primary" /> 6 highlights
            </span>
          </div>

          <div className="flex">
            {/* Module rail */}
            <div className="hidden flex-col gap-1 border-r border-white/[0.06] p-2 sm:flex">
              {[Film, FileText, Sparkles, Captions, ImageIcon, PenTool, Users, Download].map((Icon, i) => (
                <span key={i} className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === 0 ? 'bg-brand-primary/15 text-brand-highlight' : 'text-text-muted'}`}>
                  <Icon className="h-4 w-4" />
                </span>
              ))}
            </div>

            <div className="min-w-0 flex-1 p-2.5 sm:p-4">
              <div className="flex gap-3">
                {/* Preview */}
                <div className="relative aspect-video min-w-0 flex-1 overflow-hidden rounded-xl bg-[#07080b]">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_35%,rgba(255,91,22,0.45),transparent_55%),radial-gradient(ellipse_at_85%_80%,rgba(96,165,250,0.14),transparent_50%),linear-gradient(160deg,#18202b,#07080b)]" />
                  <div className="absolute bottom-0 left-[38%] h-[64%] w-[24%] rounded-t-[45%] bg-gradient-to-b from-[#28303c] to-[#0d1014]" />
                  <div className="absolute bottom-[54%] left-[44%] h-[22%] w-[12%] rounded-full bg-gradient-to-b from-[#323b48] to-[#161b22]" />
                  <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black/40 to-transparent" />
                  <span className="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-white/80 backdrop-blur sm:text-[10px]">00:14:22</span>
                  <div className="absolute inset-x-0 bottom-[10%] flex justify-center px-4">
                    <motion.span key={sub} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-md bg-black/70 px-2 py-0.5 text-center text-[9px] font-semibold text-white sm:text-xs">
                      {SUBS[sub].text}
                    </motion.span>
                  </div>
                  <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur sm:h-12 sm:w-12">
                    <Play className="ml-0.5 h-4 w-4 fill-white text-white sm:h-5 sm:w-5" />
                  </span>
                </div>

                {/* Clip list */}
                <div className="hidden w-[30%] flex-col gap-2 md:flex">
                  {[
                    ['Opening hook', '0:00', '94'],
                    ['Key takeaway', '2:14', '91'],
                    ['Quotable moment', '5:48', '88'],
                  ].map(([t, at, s], i) => (
                    <div key={t} className={`rounded-xl border p-2.5 ${i === 0 ? 'border-brand-primary/40 bg-brand-primary/10' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[11px] font-medium text-text-primary">{t}</span>
                        <span className="font-mono text-[10px] text-brand-highlight">{s}%</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="font-mono text-[10px] text-text-muted">{at}</span>
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                          <span className="block h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-highlight" style={{ width: `${Number(s) - 10}%` }} />
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="mt-auto flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                    <Scissors className="h-3.5 w-3.5 text-text-muted" />
                    <span className="text-[10px] text-text-muted">Split · Trim · 9:16</span>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/30 p-2 sm:p-2.5">
                <div className="relative h-7 sm:h-9">
                  <div className="flex h-full items-center gap-[2px]">
                    {WAVE.map((h, i) => (
                      <span key={i} className="animate-wave flex-1 rounded-full bg-white/20" style={{ height: `${h * 100}%`, animationDelay: `${(i % 12) * 0.09}s` }} />
                    ))}
                  </div>
                </div>
                <div className="relative mt-1.5 h-5 sm:h-6">
                  {[
                    [2, 16],
                    [24, 14],
                    [46, 20],
                    [74, 18],
                  ].map(([l, w], i) => (
                    <span key={i} className={`absolute inset-y-0 rounded-md border ${i === 1 ? 'border-brand-primary bg-brand-primary/40' : 'border-brand-primary/40 bg-brand-primary/15'}`} style={{ left: `${l}%`, width: `${w}%` }} />
                  ))}
                  <motion.span className="absolute -top-9 bottom-0 w-0.5 bg-white shadow-[0_0_10px_white] sm:-top-11" animate={reduce ? undefined : { left: ['4%', '92%'] }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }} style={{ left: '30%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ======================= Floating layers ======================= */}
        <Float z={90} delay={0} className="-left-1 -top-8 w-[34%] max-w-[210px] sm:-left-6 sm:-top-10 lg:-left-14">
          <div className={`${glassCard} p-1.5 sm:p-2`}>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-[#1a1a2e]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(255,91,22,0.6),transparent_60%)]" />
              <span className="absolute inset-x-2 top-1/2 -translate-y-1/2 font-heading text-[11px] font-black uppercase leading-none text-white [text-shadow:0_2px_0_#000] sm:text-base">
                5 AI trends
                <br />
                <span className="text-brand-highlight">changing video</span>
              </span>
              <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-primary" />
            </div>
            <div className="flex items-center gap-1.5 px-1 pb-0.5 pt-1.5">
              <ImageIcon className="h-3 w-3 text-brand-highlight" />
              <span className="text-[9px] font-medium text-text-secondary sm:text-[11px]">Thumbnail · Bold</span>
            </div>
          </div>
        </Float>

        <Float z={130} delay={0.25} className="-right-1 top-[18%] w-[40%] max-w-[250px] sm:-right-6 md:top-[46%] lg:-right-16">
          <div className={`${glassCard} p-2.5 sm:p-3.5`}>
            <div className="mb-2 flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5 text-brand-highlight" />
              <span className="text-[10px] font-semibold text-text-primary sm:text-xs">Subtitle Studio</span>
            </div>
            <div className="flex gap-1">
              {SUBS.map((s, i) => (
                <span key={s.lang} className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] ${i === sub ? 'bg-brand-primary text-white' : 'bg-white/[0.05] text-text-muted'}`}>
                  {s.lang}
                </span>
              ))}
            </div>
            <motion.p key={sub} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 hidden text-[11px] leading-snug text-text-secondary sm:block">
              “{SUBS[sub].text}”
            </motion.p>
            <div className="mt-2 hidden font-mono text-[10px] text-text-muted sm:block">00:14:22,400 → 00:14:25,100</div>
          </div>
        </Float>

        <Float z={160} delay={0.45} className="-bottom-10 right-[6%] hidden w-[17%] max-w-[120px] sm:block">
          <div className={`${glassCard} p-1.5`}>
            <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-[#07080b]">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(255,91,22,0.5),transparent_60%),linear-gradient(180deg,#1a212b,#07080b)]" />
              <div className="absolute bottom-0 left-1/2 h-[45%] w-[55%] -translate-x-1/2 rounded-t-[45%] bg-gradient-to-b from-[#28303c] to-[#0d1014]" />
              <span className="absolute inset-x-1.5 bottom-[30%] rounded bg-black/70 px-1 py-0.5 text-center text-[7px] font-bold text-white">THIS CHANGES EVERYTHING</span>
              <span className="absolute inset-x-1.5 bottom-2 h-0.5 overflow-hidden rounded-full bg-white/20">
                <motion.span className="block h-full bg-brand-primary" animate={reduce ? undefined : { width: ['0%', '100%'] }} transition={{ duration: 5, repeat: Infinity, ease: 'linear' }} />
              </span>
            </div>
            <p className="px-0.5 pt-1 text-center font-mono text-[9px] text-text-muted">9:16 · 0:28</p>
          </div>
        </Float>

        <Float z={110} delay={0.6} className="-bottom-8 -left-1 w-[42%] max-w-[240px] sm:-left-4 lg:-left-10">
          <div className={`${glassCard} flex items-center gap-2.5 p-2.5 sm:p-3`}>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-brand-primary/15 sm:h-10 sm:w-10">
              <Sparkles className="h-4 w-4 text-brand-highlight sm:h-5 sm:w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold text-text-primary sm:text-xs">Highlight found</p>
              <div className="mt-1 flex h-3 items-end gap-[2px] sm:h-4">
                {WAVE.slice(10, 34).map((h, i) => (
                  <span key={i} className={`flex-1 rounded-sm ${i > 8 && i < 17 ? 'bg-brand-primary' : 'bg-white/20'}`} style={{ height: `${h * 100}%` }} />
                ))}
              </div>
            </div>
            <span className="font-heading text-sm font-bold text-brand-highlight sm:text-lg">94%</span>
          </div>
        </Float>
      </motion.div>
    </div>
  )
}

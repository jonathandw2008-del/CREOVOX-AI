import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, Play } from 'lucide-react'

export default function CTASection() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] })
  const sunY = useTransform(scrollYProgress, [0, 1], ['40%', '0%'])
  const sunScale = useTransform(scrollYProgress, [0, 1], [0.7, 1])

  return (
    <section ref={ref} className="section-padding relative overflow-hidden py-28 md:py-40">
      {/* Rising ember sun */}
      <motion.div style={{ y: sunY, scale: sunScale }} className="pointer-events-none absolute left-1/2 top-[38%] h-[min(720px,140vw)] w-[min(720px,140vw)] -translate-x-1/2 rounded-full" aria-hidden>
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_40%,rgba(255,164,94,0.55),rgba(255,91,22,0.35)_35%,rgba(255,91,22,0)_68%)] blur-2xl" />
        <div className="absolute inset-[22%] rounded-full border border-brand-highlight/20" />
      </motion.div>
      <div className="grid-fade pointer-events-none absolute inset-0 opacity-50" aria-hidden />

      <div className="relative mx-auto max-w-3xl text-center">
        <motion.p initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="serif-accent text-xl text-brand-highlight sm:text-2xl">
          Ready when you are.
        </motion.p>
        <motion.h2 initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1, duration: 0.8 }} className="text-balance mt-4 font-heading text-[clamp(2.4rem,7vw,5rem)] font-bold leading-[0.98] tracking-[-0.04em] text-text-primary">
          Your next hundred posts are already recorded.
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="mx-auto mt-6 max-w-xl text-text-secondary sm:text-lg">
          No sign-up. No upload. Open the studio and start shaping your footage in seconds.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }} className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link to="/studio/upload" className="btn-primary !min-h-[56px] !px-8 text-base">
            Create your first project <ArrowRight className="h-5 w-5" />
          </Link>
          <Link to="/studio" className="btn-secondary !min-h-[56px] !px-8 text-base">
            <Play className="h-4 w-4" /> Open Creative Studio
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

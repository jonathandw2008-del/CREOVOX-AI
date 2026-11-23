import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/helpers'

export function SectionHeading({ eyebrow, title, body, align = 'center', className }: { eyebrow: string; title: ReactNode; body?: ReactNode; align?: 'center' | 'left'; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className={cn('max-w-3xl', align === 'center' ? 'mx-auto text-center' : '', className)}
    >
      <p className="eyebrow">
        <span className="h-px w-6 bg-brand-secondary/60" />
        {eyebrow}
      </p>
      <h2 className="text-balance mt-4 font-heading text-[clamp(2rem,5.2vw,3.75rem)] font-bold leading-[1.02] tracking-[-0.03em] text-text-primary">{title}</h2>
      {body && <p className="text-pretty mt-4 text-base leading-relaxed text-text-secondary sm:text-lg">{body}</p>}
    </motion.div>
  )
}

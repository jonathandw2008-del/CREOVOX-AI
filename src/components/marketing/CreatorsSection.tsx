import { motion } from 'framer-motion'
import { Video, GraduationCap, Briefcase, Check } from 'lucide-react'
import { SectionHeading } from './SectionHeading'

const audiences = [
  {
    icon: Video,
    title: 'Creators & YouTubers',
    quote: 'Turn a two-hour stream into a week of Shorts.',
    body: 'Find the moments worth clipping, reframe them for vertical, and ship captions and covers without leaving the studio.',
    benefits: ['Vertical clip reframing', 'Bold thumbnail presets', 'Platform-tuned captions'],
  },
  {
    icon: GraduationCap,
    title: 'Educators & institutions',
    quote: 'Every lecture, accessible in any language.',
    body: 'Clean timestamped transcripts, multilingual subtitle tracks and student-friendly summaries of long sessions.',
    benefits: ['SRT/VTT for any LMS', 'Searchable transcripts', 'Student-level rewrites'],
  },
  {
    icon: Briefcase,
    title: 'Brands & marketing teams',
    quote: 'One keynote. Every channel. On brand.',
    body: 'Repackage launches and webinars for LinkedIn, X and Instagram, with audience-specific messaging for each segment.',
    benefits: ['Audience variations', 'Consistent visual style', 'Complete export packages'],
  },
]

export default function CreatorsSection() {
  return (
    <section id="creators" className="section-padding scroll-mt-24 py-24 md:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Built for" title={<>Your content, <span className="serif-accent text-brand-highlight">amplified.</span></>} />
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          {audiences.map((a, i) => (
            <motion.article
              key={a.title}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="glass-panel group relative flex flex-col overflow-hidden p-6 transition-colors duration-500 hover:border-brand-primary/30 sm:p-8"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-primary/10 blur-3xl transition-opacity duration-700 group-hover:opacity-100 md:opacity-0" />
              <a.icon className="h-8 w-8 text-brand-primary" strokeWidth={1.5} />
              <p className="serif-accent mt-6 text-2xl leading-snug text-text-primary sm:text-[1.7rem]">“{a.quote}”</p>
              <h3 className="mt-6 font-heading text-lg font-semibold text-text-primary">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{a.body}</p>
              <ul className="mt-6 space-y-2.5 border-t border-white/[0.06] pt-5">
                {a.benefits.map((b) => (
                  <li key={b} className="flex items-center gap-2.5 text-sm text-text-primary">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-status-success/10">
                      <Check className="h-3 w-3 text-status-success" />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}

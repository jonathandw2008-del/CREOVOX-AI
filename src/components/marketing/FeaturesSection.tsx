import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Scissors, Sparkles, Languages, ImagePlus, PenTool, Users, Download, ArrowUpRight } from 'lucide-react'
import { AudienceMini, EditorMini, ExportMini, HighlightsMini, SubtitlesMini, ThumbnailsMini, WriterMini } from './FeatureVisuals'
import { SectionHeading } from './SectionHeading'
import { cn } from '@/utils/helpers'

interface Tile {
  title: string
  body: string
  icon: typeof Scissors
  visual: ReactNode
  span: string
  to: string
  tag?: string
}

const tiles: Tile[] = [
  { title: 'Smart video editor', body: 'Trim, split and reframe clips on a touch-friendly timeline. Preview 16:9, 9:16 and 1:1 instantly.', icon: Scissors, visual: <EditorMini />, span: 'md:col-span-4', to: '/studio/editor', tag: 'Renders in-browser' },
  { title: 'Highlight detection', body: 'Candidate moments scored with real audio energy from your file.', icon: Sparkles, visual: <HighlightsMini />, span: 'md:col-span-2', to: '/studio/highlights' },
  { title: 'Multilingual subtitles', body: 'Edit, style and export real SRT & VTT files.', icon: Languages, visual: <SubtitlesMini />, span: 'md:col-span-2', to: '/studio/subtitles' },
  { title: 'Thumbnail studio', body: 'Compose covers from captured video frames. Export pixel-perfect PNGs.', icon: ImagePlus, visual: <ThumbnailsMini />, span: 'md:col-span-2', to: '/studio/thumbnails' },
  { title: 'Content writer', body: 'Titles, descriptions, captions and hashtags for six platforms.', icon: PenTool, visual: <WriterMini />, span: 'md:col-span-2', to: '/studio/content', tag: 'Simulated AI' },
  { title: 'Audience personalization', body: 'Repackage one video for students, professionals and everyone else.', icon: Users, visual: <AudienceMini />, span: 'md:col-span-3', to: '/studio/audience', tag: 'Simulated AI' },
  { title: 'Export studio', body: 'Clips, subtitles, thumbnails and copy — bundled into real downloads.', icon: Download, visual: <ExportMini />, span: 'md:col-span-3', to: '/studio/export' },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="section-padding relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="The studio" title={<>One video. <span className="serif-accent text-brand-highlight">Endless</span> outputs.</>} body="Ten connected modules share one project, so every edit flows downstream — from the first trim to the final export." />

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
          {tiles.map((t, i) => (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, delay: (i % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className={cn('col-span-1', t.span)}
            >
              <Link to={t.to} className="glass-panel group relative flex h-full flex-col overflow-hidden p-5 transition-colors duration-500 hover:border-brand-primary/30 sm:p-6">
                <div className="pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full bg-brand-primary/0 blur-3xl transition-colors duration-700 group-hover:bg-brand-primary/20" />
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] bg-brand-primary/10 text-brand-primary">
                    <t.icon className="h-5 w-5" />
                  </span>
                  {t.tag && <span className="rounded-full border border-white/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">{t.tag}</span>}
                  <ArrowUpRight className="ml-auto h-5 w-5 text-text-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-highlight" />
                </div>
                <h3 className="mt-5 font-heading text-xl font-semibold text-text-primary">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{t.body}</p>
                <div className="mt-auto pt-6">{t.visual}</div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

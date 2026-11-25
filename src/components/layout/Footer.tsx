import { Link } from 'react-router-dom'
import { LogoMark } from './Logo'

const columns = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', to: '/features' },
      { label: 'How it works', to: '/how-it-works' },
      { label: 'Creative Studio', to: '/studio' },
      { label: 'Demo project', to: '/studio/editor/demo-1' },
    ],
  },
  {
    heading: 'Studio',
    links: [
      { label: 'New project', to: '/studio/upload' },
      { label: 'Project library', to: '/studio/projects' },
      { label: 'Subtitle Studio', to: '/studio/subtitles' },
      { label: 'Export Studio', to: '/studio/export' },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { label: 'For creators', to: '/#creators' },
      { label: 'FAQ', to: '/#faq' },
      { label: 'How the AI works', to: '/#faq' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/[0.06] bg-brand-bg">
      <div className="hairline absolute inset-x-0 top-0" />
      <div className="section-padding mx-auto max-w-7xl pb-8 pt-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="col-span-2 space-y-4 sm:col-span-3 md:col-span-1">
            <Link to="/" className="inline-flex min-h-[44px] items-center gap-2.5">
              <LogoMark />
              <span className="font-heading text-lg font-bold text-text-primary">
                CREOVOX<span className="text-brand-primary">AI</span>
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-text-secondary">
              Create beyond <span className="serif-accent text-brand-highlight">imagination.</span> One long video in, a full content kit out. Your projects stay private to your account.
            </p>
          </div>
          {columns.map((c) => (
            <div key={c.heading}>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">{c.heading}</h3>
              <ul className="mt-3 space-y-0.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="inline-flex min-h-[44px] min-w-[44px] items-center text-sm text-text-secondary transition-colors hover:text-brand-highlight">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div aria-hidden className="pointer-events-none select-none px-2 text-center font-heading text-[clamp(4rem,19vw,17rem)] font-bold leading-[0.8] tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_rgba(255,129,46,0.18)] [background:linear-gradient(180deg,rgba(255,91,22,0.16),transparent_75%)] [-webkit-background-clip:text] [background-clip:text]">
        CREOVOX
      </div>

      <div className="section-padding mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 border-t border-white/[0.06] py-6 text-xs text-text-muted sm:flex-row">
        <p>© {new Date().getFullYear()} CREOVOX AI.</p>
        <p className="font-mono">Whisper · AI · ffmpeg</p>
      </div>
    </footer>
  )
}

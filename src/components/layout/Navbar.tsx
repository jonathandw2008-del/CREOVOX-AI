import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ArrowRight } from 'lucide-react'
import Logo from './Logo'
import { cn } from '@/utils/helpers'

const links = [
  { label: 'Features', to: '/features' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Creators', to: '/#creators' },
  { label: 'FAQ', to: '/#faq' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()

  useEffect(() => setOpen(false), [location.pathname, location.hash])

  /** Hash links: unlock scrolling first, then scroll — also works when the hash is unchanged. */
  const onHashLink = (to: string) => (e: React.MouseEvent) => {
    const [path, hash] = to.split('#')
    setOpen(false)
    document.body.style.overflow = ''
    if ((path || '/') === location.pathname) {
      e.preventDefault()
      window.history.replaceState(null, '', `#${hash}`)
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }))
    }
  }
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
      <nav
        aria-label="Main"
        className={cn(
          'glass-nav mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl border px-2 pl-3 transition-all duration-500 sm:h-16 sm:pl-4',
          scrolled ? 'border-white/10 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)]' : 'border-white/[0.05] bg-transparent'
        )}
      >
        <Logo />

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              {l.to.includes('#') ? (
                <Link to={l.to} onClick={onHashLink(l.to)} className="inline-flex min-h-[44px] items-center rounded-xl px-3.5 text-sm text-text-secondary transition-colors hover:text-text-primary">
                  {l.label}
                </Link>
              ) : (
                <NavLink to={l.to} className={({ isActive }) => cn('inline-flex min-h-[44px] items-center rounded-xl px-3.5 text-sm transition-colors', isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary')}>
                  {({ isActive }) => (
                    <span className="relative">
                      {l.label}
                      {isActive && <motion.span layoutId="nav-dot" className="absolute -bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand-primary" />}
                    </span>
                  )}
                </NavLink>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1">
          <Link to="/studio" className="btn-primary hidden !min-h-[40px] !px-4 !text-sm md:inline-flex">
            Open Studio <ArrowRight className="h-4 w-4" />
          </Link>
          <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="icon-btn md:hidden">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            className="glass-panel mx-auto mt-2 max-w-6xl !bg-[#0e1116]/95 p-3 md:hidden"
          >
            <ul className="space-y-1">
              {links.map((l, i) => (
                <motion.li key={l.to} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                  <Link to={l.to} onClick={l.to.includes('#') ? onHashLink(l.to) : undefined} className="flex min-h-[52px] items-center justify-between rounded-xl px-4 text-lg font-medium text-text-primary hover:bg-white/[0.04]">
                    {l.label} <ArrowRight className="h-4 w-4 text-text-muted" />
                  </Link>
                </motion.li>
              ))}
            </ul>
            <Link to="/studio" className="btn-primary mt-3 w-full !min-h-[52px] text-base">
              Open Creative Studio
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

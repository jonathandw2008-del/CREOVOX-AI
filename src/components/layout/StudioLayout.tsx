import { useEffect, useRef, useState, type ElementType } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Upload, FolderOpen, ArrowLeft, Menu, X, Bell, ChevronDown, Check, Plus, Cloud } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/store/useAppStore'
import { PROJECT_STEPS } from '@/lib/workflow'
import { Toaster } from '@/components/ui'
import Logo from '@/components/layout/Logo'
import UserMenu from '@/components/auth/UserMenu'
import { useAuth } from '@/store/useAuth'
import { cn, formatRelativeTime } from '@/utils/helpers'

interface NavItem {
  label: string
  icon: ElementType
  path: string
  match: string
}

const mainNavItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/studio', match: '/studio' },
  { label: 'New Project', icon: Upload, path: '/studio/upload', match: '/studio/upload' },
  { label: 'Project Library', icon: FolderOpen, path: '/studio/projects', match: '/studio/projects' },
]

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onOutside()
    document.addEventListener('pointerdown', handler)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', handler)
      document.removeEventListener('keydown', key)
    }
  }, [ref, onOutside, active])
}

function SideLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: React.ReactNode }) {
  const Icon = item.icon
  return (
    <Link
      to={item.path}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm transition-all',
        active ? 'bg-brand-primary/[0.12] text-text-primary' : 'text-text-secondary hover:bg-white/[0.04] hover:text-text-primary'
      )}
    >
      {active && <motion.span layoutId="side-active" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-primary" />}
      <Icon className={cn('h-[18px] w-[18px] flex-shrink-0', active ? 'text-brand-primary' : 'text-text-muted group-hover:text-text-secondary')} />
      <span className="flex-1 truncate">{item.label}</span>
      {badge}
    </Link>
  )
}

function SidebarContent() {
  const location = useLocation()
  const { projects, currentProjectId } = useAppStore()
  const current = projects.find((p) => p.id === currentProjectId) ?? projects[0]
  const email = useAuth((s) => s.user?.email)

  const isActive = (match: string) => (match === '/studio' ? location.pathname === '/studio' : location.pathname.startsWith(match))

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Studio">
        {mainNavItems.map((item) => (
          <SideLink key={item.path} item={item} active={isActive(item.match)} />
        ))}

        <div className="px-3 pb-2 pt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">Workflow</p>
          {current ? (
            <p className="mt-1 truncate text-xs text-text-secondary" title={current.title}>
              {current.title}
            </p>
          ) : (
            <p className="mt-1 text-xs text-text-muted">No project selected</p>
          )}
        </div>

        {current ? (
          PROJECT_STEPS.map((s, i) => {
            const done = current.completedSteps.includes(s.id)
            return (
              <SideLink
                key={s.id}
                item={{ label: s.label, icon: s.icon, path: s.path(current.id), match: `/studio/${s.id}/` }}
                active={location.pathname.startsWith(`/studio/${s.id}/`)}
                badge={
                  done ? (
                    <Check className="h-3.5 w-3.5 text-status-success" aria-label="completed" />
                  ) : (
                    <span className="font-mono text-[10px] text-text-muted">{String(i + 1).padStart(2, '0')}</span>
                  )
                }
              />
            )
          })
        ) : (
          <Link to="/studio/upload" className="mx-3 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 text-sm text-text-muted hover:border-brand-primary/40 hover:text-brand-highlight">
            <Plus className="h-4 w-4" /> Create a project
          </Link>
        )}
      </nav>

      <div className="space-y-2 border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-text-muted" title={email}>
          <Cloud className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Saved to your account{email ? ` · ${email}` : ''}</span>
        </div>
        <Link to="/" className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary">
          <ArrowLeft className="h-[18px] w-[18px]" />
          <span>Back to Home</span>
        </Link>
      </div>
    </div>
  )
}

function ProjectSwitcher() {
  const { projects, currentProjectId, setCurrentProject } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  const current = projects.find((p) => p.id === currentProjectId)

  const choose = (id: string) => {
    setCurrentProject(id)
    setOpen(false)
    // If we're inside a project module, jump to the same module of the new project.
    const m = location.pathname.match(/^\/studio\/([a-z]+)\/[^/]+$/)
    if (m) navigate(`/studio/${m[1]}/${id}`)
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-[44px] max-w-[220px] items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 text-sm text-text-primary transition-colors hover:border-brand-primary/30 sm:max-w-[320px]"
      >
        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-brand-primary shadow-[0_0_10px_rgba(255,91,22,0.8)]" />
        <span className="truncate">{current?.title ?? 'Select project'}</span>
        <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="glass-panel absolute left-0 top-[calc(100%+8px)] z-50 max-h-[60vh] w-[min(320px,calc(100vw-2rem))] overflow-y-auto !rounded-2xl p-1.5"
          >
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.id === currentProjectId}
                  onClick={() => choose(p.id)}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-text-secondary hover:bg-white/[0.05] hover:text-text-primary"
                >
                  <span className="flex-1 truncate">{p.title}</span>
                  {p.id === currentProjectId && <Check className="h-4 w-4 text-brand-primary" />}
                </button>
              </li>
            ))}
            <li className="mt-1 border-t border-white/[0.06] pt-1">
              <Link
                to="/studio/upload"
                onClick={() => setOpen(false)}
                className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm text-brand-highlight hover:bg-brand-primary/10"
              >
                <Plus className="h-4 w-4" /> New project
              </Link>
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function ActivityBell() {
  const activity = useAppStore((s) => s.activity)
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState(() => {
    try {
      return Number(localStorage.getItem('creovox-seen') || 0)
    } catch {
      return 0
    }
  })
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  const unread = activity.filter((a) => new Date(a.at).getTime() > seenAt).length

  const toggle = () => {
    setOpen((o) => !o)
    const now = Date.now()
    setSeenAt(now)
    try {
      localStorage.setItem('creovox-seen', String(now))
    } catch {
      /* ignore */
    }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} aria-label={`Activity${unread ? `, ${unread} new` : ''}`} aria-expanded={open} className="icon-btn relative">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-primary ring-2 ring-brand-bg" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="glass-panel absolute right-0 top-[calc(100%+8px)] z-50 w-[min(340px,calc(100vw-2rem))] !rounded-2xl p-2"
          >
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">Recent activity</p>
            <ul className="max-h-[50vh] overflow-y-auto">
              {activity.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-muted">Nothing yet.</li>}
              {activity.slice(0, 12).map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm">
                  <span className={cn('mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full', a.kind === 'export' ? 'bg-status-success' : a.kind === 'delete' ? 'bg-status-error' : 'bg-brand-primary')} />
                  <span className="flex-1 text-text-secondary">{a.text}</span>
                  <span className="whitespace-nowrap text-xs text-text-muted">{formatRelativeTime(a.at)}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function StudioLayout() {
  const location = useLocation()
  const { sidebarOpen, setSidebarOpen } = useAppStore()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    setSidebarOpen(false)
    mainRef.current?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [location.pathname, setSidebarOpen])

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [sidebarOpen])

  return (
    <div className="relative flex min-h-[100dvh] bg-brand-bg">
      {/* Ambient lighting */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="ambient-orb -right-40 -top-40 h-[520px] w-[520px] opacity-60" />
        <div className="ambient-orb -bottom-60 left-1/4 h-[480px] w-[480px] opacity-30" />
        <div className="grid-fade absolute inset-0 opacity-50" />
      </div>

      {/* Desktop sidebar */}
      <aside className="glass-nav sticky top-0 z-30 hidden h-[100dvh] w-[264px] flex-shrink-0 border-r border-white/[0.06] lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="glass-nav fixed inset-y-0 left-0 z-50 w-[min(288px,85vw)] border-r border-white/[0.08] !bg-[#0d1015]/95 lg:hidden"
              aria-label="Studio navigation"
            >
              <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="icon-btn absolute right-2 top-2.5">
                <X className="h-5 w-5" />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="glass-nav sticky top-0 z-30 flex h-16 flex-shrink-0 items-center gap-2 border-b border-white/[0.06] px-2 sm:px-4 md:px-6">
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="icon-btn lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <div className="hidden min-w-0 sm:block lg:ml-0">
            <ProjectSwitcher />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ActivityBell />
            <Link to="/studio/upload" className="btn-primary hidden !px-4 !text-sm sm:inline-flex">
              <Plus className="h-4 w-4" /> New
            </Link>
            <UserMenu />
          </div>
        </header>
        <div className="border-b border-white/[0.06] px-3 py-2 sm:hidden">
          <ProjectSwitcher />
        </div>

        <main ref={mainRef} className="flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-12 lg:px-8 lg:pt-8">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}

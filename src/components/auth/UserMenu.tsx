import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutDashboard, LogOut, FolderOpen } from 'lucide-react'
import { useAuth, userInitials } from '@/store/useAuth'
import { cn } from '@/utils/helpers'

export function Avatar({ size = 32, className }: { size?: number; className?: string }) {
  const user = useAuth((s) => s.user)
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size }
  if (user?.avatarUrl && !broken)
    return <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={style} className={cn('flex-shrink-0 rounded-full object-cover', className)} />
  return (
    <span style={style} className={cn('flex flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/20 font-heading text-xs font-semibold text-brand-highlight', className)} aria-hidden>
      {userInitials(user)}
    </span>
  )
}

/** Avatar button with a dropdown: who is signed in, Studio links and Sign out. */
export default function UserMenu({ showStudioLinks = false, align = 'right' }: { showStudioLinks?: boolean; align?: 'left' | 'right' }) {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  if (!user) return null

  const doSignOut = async () => {
    setBusy(true)
    await signOut()
    setBusy(false)
    setOpen(false)
    navigate('/', { replace: true })
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${user.email}`} className="icon-btn !p-1.5">
        <Avatar size={30} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={cn('glass-panel absolute top-[calc(100%+8px)] z-50 w-[min(280px,calc(100vw-2rem))] !rounded-2xl !bg-[#0e1116]/95 p-2', align === 'right' ? 'right-0' : 'left-0')}
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar size={36} />
              <div className="min-w-0">
                {user.name && <p className="truncate text-sm font-medium text-text-primary">{user.name}</p>}
                <p className="truncate text-xs text-text-muted">{user.email}</p>
              </div>
            </div>
            <div className="my-1 border-t border-white/[0.06]" />
            {showStudioLinks && (
              <>
                <Link role="menuitem" to="/studio" onClick={() => setOpen(false)} className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm text-text-secondary hover:bg-white/[0.05] hover:text-text-primary">
                  <LayoutDashboard className="h-4 w-4" /> Studio dashboard
                </Link>
                <Link role="menuitem" to="/studio/projects" onClick={() => setOpen(false)} className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm text-text-secondary hover:bg-white/[0.05] hover:text-text-primary">
                  <FolderOpen className="h-4 w-4" /> My projects
                </Link>
              </>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={doSignOut}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-text-secondary hover:bg-white/[0.05] hover:text-text-primary disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

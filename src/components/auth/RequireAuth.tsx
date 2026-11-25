import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader } from 'lucide-react'
import { useAuth } from '@/store/useAuth'
import { useAppStore } from '@/store/useAppStore'

export function FullScreenLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-brand-bg" role="status" aria-label={label}>
      <Loader className="h-8 w-8 animate-spin text-brand-primary" />
    </div>
  )
}

/** Gate for every /studio route: guests are sent to /signin?next=<where they were going>. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status)
  const userId = useAuth((s) => s.user?.id)
  const hydrated = useAppStore((s) => s.hydrated)
  const hydrate = useAppStore((s) => s.hydrate)
  const location = useLocation()

  useEffect(() => {
    if (status === 'authed' && !hydrated) void hydrate()
  }, [status, userId, hydrated, hydrate])

  if (status === 'loading') return <FullScreenLoader label="Checking your session" />
  if (status === 'guest') {
    const next = location.pathname + location.search + location.hash
    return <Navigate to={`/signin?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}

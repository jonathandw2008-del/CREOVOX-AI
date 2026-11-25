import { useEffect, useRef, useState } from 'react'
import { Loader } from 'lucide-react'
import { authApi, ApiError, type User } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { cn } from '@/utils/helpers'

/* Minimal typings for Google Identity Services (https://developers.google.com/identity/gsi/web). */
interface GsiCredentialResponse {
  credential: string
  select_by?: string
}
interface GsiButtonOptions {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number
}
interface GsiId {
  initialize: (opts: { client_id: string; callback: (r: GsiCredentialResponse) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean; ux_mode?: 'popup' | 'redirect'; use_fedcm_for_prompt?: boolean }) => void
  renderButton: (el: HTMLElement, opts: GsiButtonOptions) => void
  disableAutoSelect: () => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GsiId } }
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client'
let gsiPromise: Promise<void> | null = null

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (gsiPromise) return gsiPromise
  gsiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    const s = existing ?? document.createElement('script')
    s.addEventListener('load', () => resolve())
    s.addEventListener('error', () => {
      gsiPromise = null
      reject(new Error('Could not load Google sign-in.'))
    })
    if (!existing) {
      s.src = GSI_SRC
      s.async = true
      s.defer = true
      document.head.appendChild(s)
    }
  })
  return gsiPromise
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

interface Props {
  onSignedIn: (user: User) => void
  onError: (message: string) => void
  className?: string
}

/** "Continue with Google" via Google Identity Services. The ID token is verified by the backend. */
export default function GoogleButton({ onSignedIn, onError, className }: Props) {
  const config = useAuth((s) => s.config)
  const setUser = useAuth((s) => s.setUser)
  const hostRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const cbRef = useRef({ onSignedIn, onError })
  cbRef.current = { onSignedIn, onError }

  const clientId = config?.googleEnabled ? config.googleClientId : null

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    loadGsi()
      .then(() => {
        const host = hostRef.current
        const gsi = window.google?.accounts.id
        if (cancelled || !host || !gsi) return
        gsi.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          cancel_on_tap_outside: true,
          callback: async ({ credential }) => {
            setBusy(true)
            try {
              const user = await authApi.google(credential)
              setUser(user)
              cbRef.current.onSignedIn(user)
            } catch (e) {
              cbRef.current.onError(e instanceof ApiError ? e.message : 'Google sign-in failed. Please try again.')
            } finally {
              setBusy(false)
            }
          },
        })
        const width = Math.max(200, Math.min(400, Math.round(host.getBoundingClientRect().width || 320)))
        host.innerHTML = ''
        gsi.renderButton(host, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', width })
        setReady(true)
      })
      .catch((e: Error) => !cancelled && cbRef.current.onError(e.message))
    return () => {
      cancelled = true
    }
  }, [clientId, setUser])

  if (!clientId) {
    return (
      <div className={className}>
        <button
          type="button"
          disabled
          aria-describedby="google-disabled-hint"
          title="Google sign-in isn't configured on this server yet"
          className="flex min-h-[48px] w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-text-muted"
        >
          <GoogleMark className="h-5 w-5 opacity-50" /> Continue with Google
        </button>
        <p id="google-disabled-hint" className="mt-2 text-center text-xs text-text-muted">
          Google sign-in isn't configured on this server yet — use your email below.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {/* Placeholder keeps the layout stable until Google renders its button. */}
      {!ready && (
        <div className="flex min-h-[44px] w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.03] text-sm text-text-muted">
          <Loader className="h-4 w-4 animate-spin" /> Loading Google sign-in…
        </div>
      )}
      <div ref={hostRef} className={cn('flex min-h-[44px] w-full justify-center [color-scheme:light]', !ready && 'absolute inset-0 opacity-0')} />
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-brand-bg/70" role="status" aria-label="Signing in with Google">
          <Loader className="h-5 w-5 animate-spin text-brand-primary" />
        </div>
      )}
    </div>
  )
}

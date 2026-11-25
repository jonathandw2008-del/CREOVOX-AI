import { create } from 'zustand'
import { ApiError, authApi, setUnauthorizedHandler, type AuthConfig, type User } from '@/lib/api'

export type AuthStatus = 'loading' | 'authed' | 'guest'

interface AuthState {
  user: User | null
  status: AuthStatus
  config: AuthConfig | null
  /** Set once the first `init()` has finished (success or failure). */
  initialised: boolean
  init: () => Promise<void>
  setUser: (user: User) => void
  /** Ends the server session (best effort) and clears local user state. */
  signOut: () => Promise<void>
}

/** Listeners run when the user signs out or the session expires (used to clear app data). */
const signOutListeners = new Set<() => void>()
export function onSignedOut(fn: () => void) {
  signOutListeners.add(fn)
  return () => signOutListeners.delete(fn)
}
const notifySignedOut = () => signOutListeners.forEach((fn) => fn())

let initPromise: Promise<void> | null = null

export const useAuth = create<AuthState>()((set) => ({
  user: null,
  status: 'loading',
  config: null,
  initialised: false,

  init: () => {
    if (initPromise) return initPromise
    initPromise = (async () => {
      const [me, config] = await Promise.allSettled([authApi.me(), authApi.config()])
      set({
        user: me.status === 'fulfilled' ? me.value : null,
        status: me.status === 'fulfilled' ? 'authed' : 'guest',
        config: config.status === 'fulfilled' ? config.value : { googleClientId: null, googleEnabled: false, emailEnabled: true, devMailer: false },
        initialised: true,
      })
      if (me.status === 'rejected' && !(me.reason instanceof ApiError && me.reason.status === 401)) {
        // Server unreachable: treat as signed out; the sign-in page shows the network error on submit.
        console.warn('[auth] could not load session', me.reason)
      }
    })()
    return initPromise
  },

  setUser: (user) => set({ user, status: 'authed' }),

  signOut: async () => {
    try {
      await authApi.logout()
    } catch {
      /* session may already be gone */
    }
    set({ user: null, status: 'guest' })
    notifySignedOut()
  },
}))

// Any 401 from the API (expired/revoked session) signs the UI out.
setUnauthorizedHandler(() => {
  if (useAuth.getState().status === 'authed') {
    useAuth.setState({ user: null, status: 'guest' })
    notifySignedOut()
  }
})

export function userInitials(u: Pick<User, 'name' | 'email'> | null | undefined) {
  const src = (u?.name || u?.email || '?').trim()
  const parts = src.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** Only allow same-site relative redirects (no protocol-relative `//evil.com`). */
export function safeNext(next: string | null | undefined, fallback = '/studio') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  if (next.startsWith('/signin')) return fallback
  return next
}

export const currentUser = () => useAuth.getState().user

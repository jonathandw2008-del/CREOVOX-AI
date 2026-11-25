import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader, Mail, ShieldCheck, Terminal } from 'lucide-react'
import Logo from '@/components/layout/Logo'
import GoogleButton from '@/components/auth/GoogleButton'
import { FullScreenLoader } from '@/components/auth/RequireAuth'
import { ApiError, authApi } from '@/lib/api'
import { safeNext, useAuth } from '@/store/useAuth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function message(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback
}

export default function SignInPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const status = useAuth((s) => s.status)
  const config = useAuth((s) => s.config)
  const setUser = useAuth((s) => s.setUser)

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const [devMailer, setDevMailer] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = 'Sign in · CREOVOX AI'
  }, [])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  if (status === 'loading') return <FullScreenLoader label="Checking your session" />
  if (status === 'authed') return <Navigate to={next} replace />

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!EMAIL_RE.test(addr)) return setError('Enter a valid email address.')
    setBusy(true)
    setError(null)
    try {
      const r = await authApi.emailStart(addr)
      setEmail(addr)
      setDevMailer(r.devMailer)
      setResendIn(r.resendIn)
      setCode('')
      setStep('code')
    } catch (err) {
      const wait = err instanceof ApiError ? Number(err.body.retryAfter) : NaN
      if (err instanceof ApiError && err.code === 'resend_too_soon' && Number.isFinite(wait)) {
        setResendIn(wait)
        setStep('code')
      }
      setError(message(err, 'Could not send a code. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError('Enter the 6-digit code from your email.')
    setBusy(true)
    setError(null)
    try {
      const user = await authApi.emailVerify(email, value)
      setUser(user)
      navigate(next, { replace: true })
    } catch (err) {
      setError(message(err, 'That code did not work. Please try again.'))
      setCode('')
      codeRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  const onCodeChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (error) setError(null)
    if (digits.length === 6 && !busy) void verify(digits)
  }

  const emailEnabled = config?.emailEnabled ?? true

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-brand-bg">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="ambient-orb -right-40 -top-40 h-[520px] w-[520px] opacity-60" />
        <div className="ambient-orb -bottom-60 left-1/4 h-[480px] w-[480px] opacity-30" />
        <div className="grid-fade absolute inset-0 opacity-50" />
      </div>

      <header className="relative z-10 flex h-16 items-center justify-between px-4 sm:px-8">
        <Logo />
        <Link to="/" className="btn-ghost !min-h-[40px] !text-sm">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-panel w-full max-w-[420px] p-6 sm:p-8">
          <p className="eyebrow">Creative Studio</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-text-primary">
            {step === 'email' ? (
              <>
                Sign in to <span className="serif-accent text-brand-highlight">create.</span>
              </>
            ) : (
              'Check your email'
            )}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {step === 'email' ? (
              'Your projects, videos and exports are saved privately to your account.'
            ) : (
              <>
                We sent a 6-digit code to <strong className="text-text-primary">{email}</strong>. It expires in 10 minutes.
              </>
            )}
          </p>

          <AnimatePresence mode="wait">
            {step === 'email' ? (
              <motion.div key="email" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="mt-6 space-y-5">
                <GoogleButton onSignedIn={() => navigate(next, { replace: true })} onError={setError} />

                {emailEnabled && (
                  <>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span className="h-px flex-1 bg-white/[0.08]" /> or use your email <span className="h-px flex-1 bg-white/[0.08]" />
                    </div>
                    <form onSubmit={sendCode} className="space-y-3" noValidate>
                      <label className="block">
                        <span className="sr-only">Email address</span>
                        <span className="relative block">
                          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                          <input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoFocus
                            className="input !pl-10"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value)
                              if (error) setError(null)
                            }}
                            aria-invalid={!!error}
                            aria-describedby={error ? 'signin-error' : undefined}
                          />
                        </span>
                      </label>
                      <button type="submit" disabled={busy || !email.trim()} className="btn-primary w-full">
                        {busy ? <Loader className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Email me a code
                      </button>
                    </form>
                  </>
                )}
              </motion.div>
            ) : (
              <motion.div key="code" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="mt-6 space-y-4">
                {devMailer && (
                  <div className="flex gap-3 rounded-xl border border-status-info/20 bg-status-info/[0.06] p-3 text-xs text-text-secondary">
                    <Terminal className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-info" />
                    <span>Email sending isn't set up on this server, so the code is printed in the API server's terminal.</span>
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void verify()
                  }}
                  className="space-y-3"
                >
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-text-muted">6-digit code</span>
                    <input
                      ref={codeRef}
                      className="input text-center font-mono text-2xl tracking-[0.5em]"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      maxLength={6}
                      placeholder="••••••"
                      value={code}
                      onChange={(e) => onCodeChange(e.target.value)}
                      aria-invalid={!!error}
                      aria-describedby={error ? 'signin-error' : undefined}
                    />
                  </label>
                  <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full">
                    {busy ? <Loader className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify and sign in
                  </button>
                </form>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="text-text-secondary hover:text-text-primary"
                    onClick={() => {
                      setStep('email')
                      setError(null)
                    }}
                  >
                    Use a different email
                  </button>
                  <button type="button" disabled={busy || resendIn > 0} onClick={() => void sendCode()} className="text-brand-highlight hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline">
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <p id="signin-error" role="alert" className="mt-4 rounded-xl border border-status-error/20 bg-status-error/[0.06] px-3 py-2 text-sm text-status-error">
              {error}
            </p>
          )}

          <p className="mt-6 text-center text-xs text-text-muted">No password needed. New here? Signing in creates your account.</p>
        </motion.div>
      </main>
    </div>
  )
}

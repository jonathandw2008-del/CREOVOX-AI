import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes, type ElementType } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X, FlaskConical } from 'lucide-react'
import { useToast } from '@/store/useToast'
import { cn } from '@/utils/helpers'

/* ------------------------------- Panel ------------------------------ */

export function Panel({ className, children, as: As = 'div', ...rest }: { className?: string; children: ReactNode; as?: ElementType } & Record<string, unknown>) {
  return (
    <As className={cn('glass-panel', className)} {...rest}>
      {children}
    </As>
  )
}

export function PanelHeader({ icon: Icon, title, right, sub }: { icon?: ElementType; title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      {Icon && (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-brand-primary/10 text-brand-primary">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="font-heading text-base font-semibold text-text-primary">{title}</h2>
        {sub && <p className="text-xs text-text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/* ------------------------------ Buttons ----------------------------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'sm' }

export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={cn(
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        size === 'sm' && '!px-3.5 !text-sm',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({ label, className, children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn('icon-btn', active && 'icon-btn-active', className)} {...rest}>
      {children}
    </button>
  )
}

/* ------------------------------ Badges ------------------------------ */

export function SimBadge({ className, label = 'Simulated AI' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-status-info/30 bg-status-info/10 px-2.5 py-1 text-[11px] font-medium text-status-info', className)}>
      <FlaskConical className="h-3 w-3" /> {label}
    </span>
  )
}

export function RealBadge({ className, label = 'Runs in your browser' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-status-success/30 bg-status-success/10 px-2.5 py-1 text-[11px] font-medium text-status-success', className)}>
      <CheckCircle2 className="h-3 w-3" /> {label}
    </span>
  )
}

export function Notice({ children, tone = 'info', className }: { children: ReactNode; tone?: 'info' | 'warn'; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-4 text-sm',
        tone === 'info' ? 'border-status-info/20 bg-status-info/[0.06] text-text-secondary' : 'border-status-warning/25 bg-status-warning/[0.07] text-text-secondary',
        className
      )}
    >
      {tone === 'info' ? <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-info" /> : <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-status-warning" />}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/* ------------------------------ Fields ------------------------------ */

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-text-muted">
        <span>{label}</span>
        {hint && <span className="font-mono text-text-secondary">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; icon?: ElementType }[]
  value: T
  onChange: (v: T) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('flex flex-wrap gap-1 rounded-xl border border-white/[0.06] bg-black/20 p-1', className)}>
      {options.map((o) => {
        const Icon = o.icon
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-all',
              active ? 'bg-brand-primary/15 text-brand-highlight shadow-[inset_0_0_0_1px_rgba(255,91,22,0.35)]' : 'text-text-muted hover:bg-white/[0.04] hover:text-text-primary'
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-[44px] min-w-[44px] items-center justify-center"
    >
      <span className={cn('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-brand-primary' : 'bg-brand-border')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  )
}

/* ------------------------------- Modal ------------------------------ */

export function Modal({ open, onClose, children, labelledBy }: { open: boolean; onClose: () => void; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={onClose}
        >
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="glass-panel w-full max-w-md p-6 outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------ Toaster ----------------------------- */

export function Toaster() {
  const { toasts, dismiss } = useToast()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-end">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-brand-elevated/90 py-2 pl-4 pr-1 text-sm text-text-primary shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            {t.kind === 'success' && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-status-success" />}
            {t.kind === 'error' && <AlertCircle className="h-4 w-4 flex-shrink-0 text-status-error" />}
            {t.kind === 'info' && <Info className="h-4 w-4 flex-shrink-0 text-status-info" />}
            <span className="flex-1">{t.message}</span>
            <IconButton label="Dismiss" onClick={() => dismiss(t.id)}>
              <X className="h-4 w-4" />
            </IconButton>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ---------------------------- Empty state --------------------------- */

export function EmptyState({ icon: Icon, title, body, action }: { icon: ElementType; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]">
        <Icon className="h-7 w-7 text-text-muted" />
      </span>
      <h3 className="font-heading text-lg font-semibold text-text-primary">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/* ----------------------------- Waveform ----------------------------- */

export function Waveform({ peaks, progress = 0, className, bars = 120 }: { peaks: number[]; progress?: number; className?: string; bars?: number }) {
  const step = Math.max(1, Math.floor(peaks.length / bars))
  const sampled: number[] = []
  for (let i = 0; i < peaks.length; i += step) sampled.push(peaks[i])
  return (
    <div className={cn('flex h-full items-center gap-px', className)} aria-hidden>
      {sampled.map((p, i) => (
        <span
          key={i}
          className={cn('flex-1 rounded-full', i / sampled.length <= progress ? 'bg-brand-secondary' : 'bg-white/20')}
          style={{ height: `${Math.max(8, p * 100)}%` }}
        />
      ))}
    </div>
  )
}

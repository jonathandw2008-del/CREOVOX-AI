import { useId } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/helpers'

export function LogoMark({ className }: { className?: string }) {
  const gid = `lg-${useId().replace(/:/g, '')}`
  return (
    <span className={cn('relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px]', className)} aria-hidden>
      <span className="absolute inset-0 bg-gradient-to-br from-brand-primary via-brand-secondary to-brand-highlight" />
      <span className="absolute inset-[1px] rounded-[9px] bg-gradient-to-br from-[#2a1308] to-[#0d0f13]" />
      <svg viewBox="0 0 24 24" className="relative h-4 w-4" fill="none">
        <path d="M8 6.5v11l9-5.5-9-5.5Z" fill={`url(#${gid})`} />
        <defs>
          <linearGradient id={gid} x1="8" y1="6" x2="17" y2="17">
            <stop stopColor="#FFA45E" />
            <stop offset="1" stopColor="#FF5B16" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  )
}

export default function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" className={cn('inline-flex min-h-[44px] min-w-[44px] select-none items-center gap-2.5', className)} aria-label="CREOVOX AI home">
      <LogoMark />
      {!compact && (
        <span className="font-heading text-[17px] font-bold tracking-tight text-text-primary">
          CREOVOX<span className="text-brand-primary">AI</span>
        </span>
      )}
      {compact && (
        <span className="font-heading text-[15px] font-bold tracking-tight text-text-primary max-[359px]:hidden">
          CREOVOX<span className="text-brand-primary">AI</span>
        </span>
      )}
    </Link>
  )
}

import { useEffect, useState } from 'react'
import { cn, formatTimecode, parseTimecode } from '@/utils/helpers'

export default function TimeInput({ value, onCommit, label, min, max }: { value: number; onCommit: (v: number) => void; label: string; min: number; max: number }) {
  const [text, setText] = useState(formatTimecode(value))
  const [bad, setBad] = useState(false)
  useEffect(() => setText(formatTimecode(value)), [value])
  const commit = () => {
    const v = parseTimecode(text)
    if (v === null || v < min || v > max) {
      setBad(true)
      setText(formatTimecode(value))
      setTimeout(() => setBad(false), 900)
      return
    }
    onCommit(Math.round(v * 10) / 10)
  }
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      className={cn('input !min-h-[40px] w-[84px] !px-2 text-center font-mono !text-xs', bad && '!border-status-error')}
    />
  )
}

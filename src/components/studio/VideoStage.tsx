import { useRef, type ReactNode } from 'react'
import { Pause, Play, Volume2, VolumeX, Loader, FlaskConical } from 'lucide-react'
import type { AspectRatio, SubtitleSegment, SubtitleStyle } from '@/types'
import type { Player } from '@/hooks/usePlayer'
import type { VideoStatus } from '@/hooks/useProjectVideo'
import { activeSegmentAt } from '@/lib/subtitles'
import { clamp, cn, formatDuration } from '@/utils/helpers'

const ASPECT: Record<AspectRatio, string> = { '16:9': '16 / 9', '9:16': '9 / 16', '1:1': '1 / 1' }

/** Cinematic placeholder used when a project has no local source video (demo data). */
function SimulatedFrame({ time, thumbnail, missing }: { time: number; thumbnail?: string; missing?: boolean }) {
  const hue = (time * 6) % 40
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#07080b]">
      {thumbnail ? (
        <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at ${30 + Math.sin(time / 3) * 20}% ${40 + Math.cos(time / 4) * 15}%, hsla(${18 + hue},100%,55%,0.35), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(96,165,250,0.12), transparent 50%), linear-gradient(160deg,#141922,#07080b)`,
            }}
          />
          {/* Stylised "presenter" silhouette */}
          <div className="absolute bottom-0 left-1/2 h-[62%] w-[28%] -translate-x-1/2 rounded-t-[45%] bg-gradient-to-b from-[#232a35] to-[#0e1116]" />
          <div className="absolute bottom-[52%] left-1/2 h-[22%] w-[13%] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#2c3440] to-[#161b22]" />
          <div className="grid-fade absolute inset-0 opacity-40" />
        </>
      )}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-medium text-white/80 backdrop-blur">
        <FlaskConical className="h-3 w-3" /> {missing ? 'Source video not stored in this browser' : 'Demo preview — no source video'}
      </span>
    </div>
  )
}

interface Props {
  player: Player
  duration: number
  url: string | null
  status: VideoStatus
  aspect?: AspectRatio
  sourceAspect?: number
  subtitles?: SubtitleSegment[]
  subtitleStyle?: SubtitleStyle
  thumbnail?: string
  className?: string
  maxHeight?: string
  overlay?: ReactNode
  compact?: boolean
}

export default function VideoStage({
  player,
  duration,
  url,
  status,
  aspect = '16:9',
  subtitles,
  subtitleStyle,
  thumbnail,
  className,
  maxHeight = '62vh',
  overlay,
  compact,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const seg = subtitles ? activeSegmentAt(subtitles, player.time) : undefined
  const pct = duration > 0 ? (player.time / duration) * 100 : 0

  const scrubTo = (clientX: number) => {
    const el = barRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    player.seek(clamp((clientX - r.left) / r.width, 0, 1) * duration)
  }

  const subPos = subtitleStyle?.position ?? 'bottom'

  return (
    <div className={cn('overflow-hidden rounded-section border border-white/[0.07] bg-black shadow-2xl shadow-black/50', className)}>
      <div className="relative flex items-center justify-center bg-[#050608]" style={{ maxHeight }}>
        <div className="relative w-full" style={{ aspectRatio: ASPECT[aspect], maxHeight, maxWidth: aspect === '16:9' ? '100%' : `calc(${maxHeight} * ${aspect === '9:16' ? 9 / 16 : 1})` }}>
          {url ? (
            <video
              ref={player.videoRef}
              src={url}
              playsInline
              preload="metadata"
              muted={player.muted}
              onClick={player.toggle}
              className={cn('absolute inset-0 h-full w-full bg-black', aspect === '16:9' ? 'object-contain' : 'object-cover')}
            />
          ) : (
            <SimulatedFrame time={player.time} thumbnail={thumbnail} missing={status === 'missing'} />
          )}

          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader className="h-8 w-8 animate-spin text-brand-primary" />
            </div>
          )}

          {seg && subtitleStyle && (
            <div
              className={cn(
                'pointer-events-none absolute inset-x-0 flex justify-center px-[6%]',
                subPos === 'top' && 'top-[7%]',
                subPos === 'center' && 'top-1/2 -translate-y-1/2',
                subPos === 'bottom' && (compact ? 'bottom-[8%]' : 'bottom-[14%]')
              )}
            >
              <span
                className="rounded-md px-3 py-1 text-center leading-snug"
                style={{
                  fontFamily: `"${subtitleStyle.fontFamily}", Inter, sans-serif`,
                  fontSize: `clamp(11px, ${subtitleStyle.fontSize / 16}vw, ${subtitleStyle.fontSize}px)`,
                  color: subtitleStyle.color,
                  backgroundColor: subtitleStyle.backgroundColor,
                  fontWeight: 600,
                  textShadow: subtitleStyle.backgroundColor === 'transparent' ? '0 2px 6px rgba(0,0,0,0.9)' : undefined,
                }}
              >
                {seg.text}
              </span>
            </div>
          )}

          {overlay}

          {!player.playing && status !== 'loading' && (
            <button
              type="button"
              onClick={player.toggle}
              aria-label="Play"
              className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary shadow-[0_10px_40px_-6px_rgba(255,91,22,0.8)] transition-transform hover:scale-105 active:scale-95"
            >
              <Play className="ml-1 h-7 w-7 fill-white text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center gap-1 border-t border-white/[0.06] bg-[#0b0d11] px-1.5 py-1 sm:gap-2 sm:px-2">
        <button type="button" onClick={player.toggle} aria-label={player.playing ? 'Pause' : 'Play'} className="icon-btn text-text-primary">
          {player.playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <span className="flex-shrink-0 whitespace-nowrap px-1 text-center font-mono text-[10px] text-text-secondary min-[360px]:text-[11px] sm:text-xs">
          {formatDuration(player.time)} / {formatDuration(duration)}
        </span>
        <div
          ref={barRef}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(player.time)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') player.seek(player.time + 5)
            if (e.key === 'ArrowLeft') player.seek(player.time - 5)
          }}
          onPointerDown={(e) => {
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            scrubTo(e.clientX)
          }}
          onPointerMove={(e) => e.buttons === 1 && scrubTo(e.clientX)}
          className="group relative flex h-11 flex-1 cursor-pointer touch-none items-center"
        >
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary" style={{ width: `${pct}%` }} />
          </div>
          <div className="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-brand-primary bg-white shadow" style={{ left: `${pct}%` }} />
        </div>
        {url && (
          <button type="button" onClick={player.toggleMute} aria-label={player.muted ? 'Unmute' : 'Mute'} className="icon-btn">
            {player.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        )}
      </div>
    </div>
  )
}

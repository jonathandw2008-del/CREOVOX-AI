import { useCallback, useEffect, useRef, useState } from 'react'
import { clamp } from '@/utils/helpers'

/**
 * Unified playback clock. Drives a real <video> element when `hasVideo` is true,
 * otherwise runs a simulated clock so demo projects (no source file) are still scrubbable.
 */
export function usePlayer(duration: number, hasVideo: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const range = useRef<{ start: number; end: number; loop: boolean } | null>(null)
  const raf = useRef(0)
  const last = useRef(0)
  const timeRef = useRef(0)
  timeRef.current = time

  const stopLoop = () => cancelAnimationFrame(raf.current)

  const tick = useCallback(
    (now: number) => {
      let t: number
      const v = videoRef.current
      if (hasVideo && v) {
        t = v.currentTime
      } else {
        const dt = last.current ? (now - last.current) / 1000 : 0
        t = timeRef.current + dt
      }
      last.current = now
      const r = range.current
      if (r && t >= r.end) {
        if (r.loop) {
          t = r.start
          if (hasVideo && v) v.currentTime = r.start
        } else {
          t = r.end
          range.current = null
          setPlaying(false)
          if (hasVideo && v) v.pause()
        }
      }
      if (t >= duration) {
        t = duration
        setPlaying(false)
        if (hasVideo && v) v.pause()
      }
      timeRef.current = t
      setTime(t)
      raf.current = requestAnimationFrame(tick)
    },
    [duration, hasVideo]
  )

  useEffect(() => {
    if (!playing) {
      stopLoop()
      return
    }
    last.current = 0
    raf.current = requestAnimationFrame(tick)
    return stopLoop
  }, [playing, tick])

  const seek = useCallback(
    (t: number) => {
      const nt = clamp(t, 0, Math.max(0, duration))
      timeRef.current = nt
      setTime(nt)
      if (videoRef.current && hasVideo) videoRef.current.currentTime = nt
    },
    [duration, hasVideo]
  )

  const play = useCallback(async () => {
    const v = videoRef.current
    if (timeRef.current >= duration - 0.05) seek(0)
    if (hasVideo && v) {
      try {
        await v.play()
      } catch {
        v.muted = true
        setMuted(true)
        await v.play().catch(() => undefined)
      }
    }
    setPlaying(true)
  }, [duration, hasVideo, seek])

  const pause = useCallback(() => {
    videoRef.current?.pause()
    setPlaying(false)
  }, [])

  const toggle = useCallback(() => {
    range.current = null
    if (playing) pause()
    else void play()
  }, [playing, pause, play])

  const playRange = useCallback(
    (start: number, end: number, loop = false) => {
      range.current = { start, end, loop }
      seek(start)
      void play()
    },
    [seek, play]
  )

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (videoRef.current) videoRef.current.muted = !m
      return !m
    })
  }, [])

  // Pause when the tab is hidden to save battery.
  useEffect(() => {
    const onVis = () => document.hidden && pause()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [pause])

  return { videoRef, time, playing, muted, play, pause, toggle, seek, playRange, toggleMute }
}

export type Player = ReturnType<typeof usePlayer>

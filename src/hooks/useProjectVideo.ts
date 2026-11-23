import { useEffect, useState } from 'react'
import type { Project } from '@/types'
import { cacheVideoUrl, getCachedVideoUrl, loadVideoBlob } from '@/lib/media'

export type VideoStatus = 'none' | 'loading' | 'ready' | 'missing'

/**
 * Resolves a playable object URL for the project's local video.
 * Looks in the session cache first, then IndexedDB (survives reloads).
 */
export function useProjectVideo(project: Project | undefined) {
  const key = project?.videoFile?.storageKey
  const [state, setState] = useState<{ url: string | null; status: VideoStatus; blob: Blob | null }>(() => {
    const cached = key ? getCachedVideoUrl(key) : undefined
    return { url: cached ?? null, status: !key ? 'none' : cached ? 'ready' : 'loading', blob: null }
  })

  useEffect(() => {
    if (!key) {
      setState({ url: null, status: 'none', blob: null })
      return
    }
    const cached = getCachedVideoUrl(key)
    if (cached) {
      setState((s) => (s.url === cached ? s : { url: cached, status: 'ready', blob: null }))
      return
    }
    let cancelled = false
    setState({ url: null, status: 'loading', blob: null })
    loadVideoBlob(key).then((blob) => {
      if (cancelled) return
      if (!blob) setState({ url: null, status: 'missing', blob: null })
      else setState({ url: cacheVideoUrl(key, blob), status: 'ready', blob })
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return state
}

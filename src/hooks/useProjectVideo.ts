import { useEffect, useState } from 'react'
import type { Project } from '@/types'
import { cacheVideoUrl, getCachedVideoUrl, loadVideoBlob } from '@/lib/media'
import { projectsApi } from '@/lib/api'

export type VideoStatus = 'none' | 'loading' | 'ready' | 'missing'

/**
 * Resolves a playable URL for the project's video.
 * Server uploads stream from /api/projects/:id/video (session cookie, Range requests).
 * Legacy browser-only videos come from the session cache, then IndexedDB.
 */
export function useProjectVideo(project: Project | undefined) {
  const serverUrl = project?.videoFile?.assetId ? `${projectsApi.videoUrl(project.id)}?v=${project.videoFile.assetId}` : null
  const local = useLocalVideo(serverUrl ? undefined : project?.videoFile?.storageKey)
  return serverUrl ? { url: serverUrl, status: 'ready' as VideoStatus, blob: null } : local
}

function useLocalVideo(key: string | undefined) {
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

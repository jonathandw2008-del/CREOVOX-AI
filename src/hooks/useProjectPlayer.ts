import type { Project } from '@/types'
import { useProjectVideo } from './useProjectVideo'
import { usePlayer } from './usePlayer'

/** Video source + playback clock for a project, shared by every module page. */
export function useProjectPlayer(project: Project) {
  const video = useProjectVideo(project)
  const player = usePlayer(project.duration, !!video.url)
  return { video, player }
}

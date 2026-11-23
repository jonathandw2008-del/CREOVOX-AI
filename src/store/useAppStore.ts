import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { ActivityEntry, ExportConfig, Project, SubtitleStyle, WorkflowStep } from '@/types'
import { generateId, nowISO } from '@/utils/helpers'
import {
  DEMO_AUDIENCE_VARIATIONS,
  DEMO_CONTENT_OUTPUTS,
  DEMO_HIGHLIGHTS,
  DEMO_SUBTITLES,
  DEMO_THUMBNAILS,
  DEMO_TRANSCRIPT,
} from '@/data/mockData'
import { defaultThumbnails, generateContentSet, simulateHighlights, simulateTranscript } from '@/lib/generators'
import { deleteVideoBlob, forgetVideoUrl, syntheticWaveform } from '@/lib/media'
import { segmentsFromTranscript } from '@/lib/subtitles'
import { WORKFLOW } from '@/lib/workflow'
import { toast } from './useToast'

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Inter',
  fontSize: 24,
  color: '#FFFFFF',
  backgroundColor: 'rgba(0,0,0,0.7)',
  position: 'bottom',
}

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  format: 'webm',
  resolution: '720p',
  aspectRatio: '16:9',
  includeSubtitles: true,
  burnInSubtitles: false,
  subtitleLanguage: 'en',
  includeThumbnail: true,
  includeContent: true,
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const DAY = 86400000

export function blankProject(title: string, description = ''): Project {
  const now = nowISO()
  return {
    id: generateId(),
    title,
    description,
    status: 'uploading',
    createdAt: now,
    updatedAt: now,
    duration: 0,
    transcript: [],
    highlights: [],
    clips: [],
    subtitles: [],
    subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
    thumbnails: defaultThumbnails(title),
    content: [],
    audienceVariations: [],
    exportConfig: { ...DEFAULT_EXPORT_CONFIG },
    completedSteps: [],
  }
}

function seedProjects(): Project[] {
  const demo1: Project = {
    ...blankProject('AI Trends in Video Production', 'Exploring the five most important AI trends shaping video production.'),
    id: 'demo-1',
    isDemo: true,
    status: 'completed',
    createdAt: ago(DAY * 2),
    updatedAt: ago(DAY),
    exportedAt: ago(DAY),
    duration: 70.3,
    waveform: syntheticWaveform('demo-1'),
    transcript: DEMO_TRANSCRIPT.map((t) => ({ ...t })),
    highlights: DEMO_HIGHLIGHTS.map((h) => ({ ...h })),
    clips: [
      { id: 'c1', startTime: 0, endTime: 13.5, title: 'Introduction', description: 'Opening segment', selected: true, aspectRatio: '16:9', highlightId: 'h1' },
      { id: 'c2', startTime: 14, endTime: 27.9, title: 'AI Summarization', description: 'First trend', selected: true, aspectRatio: '9:16', highlightId: 'h2' },
      { id: 'c3', startTime: 37.8, endTime: 46.8, title: 'AI Thumbnails', description: 'Third trend', selected: true, aspectRatio: '1:1', highlightId: 'h4' },
    ],
    subtitles: DEMO_SUBTITLES.map((t) => ({ ...t, segments: t.segments.map((s) => ({ ...s })) })),
    thumbnails: DEMO_THUMBNAILS.map((t) => ({ ...t })),
    audienceVariations: DEMO_AUDIENCE_VARIATIONS.map((v) => ({ ...v })),
    completedSteps: WORKFLOW.map((s) => s.id),
  }
  // Merge hand-written demo copy over the generated YouTube/Instagram sets.
  const gen = [...generateContentSet(demo1, 'youtube', 'professional'), ...generateContentSet(demo1, 'instagram', 'casual')]
  demo1.content = gen.map((c) => {
    const hand = DEMO_CONTENT_OUTPUTS.find((d) => d.platform === c.platform && d.type === c.type)
    return hand ? { ...c, content: hand.content, tone: hand.tone } : c
  })

  const demo2: Project = {
    ...blankProject('Product Launch Keynote', 'Annual product launch event keynote presentation.'),
    id: 'demo-2',
    isDemo: true,
    status: 'processing',
    createdAt: ago(DAY),
    updatedAt: ago(3600000),
    duration: 2400,
    completedSteps: ['upload'],
  }

  const t3 = simulateTranscript(1800).slice(0, 40)
  const wf3 = syntheticWaveform('demo-3')
  const demo3: Project = {
    ...blankProject('React Tutorial Series — Ep.1', 'Introduction to React for beginners.'),
    id: 'demo-3',
    isDemo: true,
    status: 'ready',
    createdAt: ago(DAY * 5),
    updatedAt: ago(DAY * 3),
    duration: 1800,
    waveform: wf3,
    transcript: t3,
    highlights: simulateHighlights(t3, 1800, wf3, 'demo-3'),
    subtitles: [{ id: 'sub-en', language: 'English', languageCode: 'en', segments: segmentsFromTranscript(t3) }],
    completedSteps: ['upload', 'process', 'transcript'],
  }
  return [demo1, demo2, demo3]
}

function seedActivity(): ActivityEntry[] {
  return [
    { id: 'a1', text: "Exported 'AI Trends in Video Production'", at: ago(DAY), kind: 'export', projectId: 'demo-1' },
    { id: 'a2', text: "Subtitles created in 4 languages for 'AI Trends'", at: ago(DAY * 1.5), kind: 'edit', projectId: 'demo-1' },
    { id: 'a3', text: "New project 'Product Launch Keynote' created", at: ago(DAY), kind: 'create', projectId: 'demo-2' },
    { id: 'a4', text: "Transcript ready for 'React Tutorial Series — Ep.1'", at: ago(DAY * 3), kind: 'process', projectId: 'demo-3' },
  ]
}

type Updater = Partial<Project> | ((p: Project) => Partial<Project>)

interface AppState {
  projects: Project[]
  currentProjectId: string | null
  activity: ActivityEntry[]
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  createProject: (title: string, description?: string) => string
  addProject: (project: Project) => string
  updateProject: (id: string, updates: Updater) => void
  deleteProject: (id: string) => void
  duplicateProject: (id: string) => string | null
  setCurrentProject: (id: string | null) => void
  markStep: (id: string, step: WorkflowStep) => void
  logActivity: (text: string, kind: ActivityEntry['kind'], projectId?: string) => void
  resetDemoData: () => void
}

/** localStorage wrapper that never throws (quota / private mode). */
let warnedQuota = false
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      if (!warnedQuota) {
        warnedQuota = true
        toast('Browser storage is full — recent changes may not persist. Remove captured frames or old projects.', 'error')
      }
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: seedProjects(),
      currentProjectId: 'demo-1',
      activity: seedActivity(),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      createProject: (title, description = '') => {
        const p = blankProject(title, description)
        set((s) => ({ projects: [p, ...s.projects], currentProjectId: p.id }))
        get().logActivity(`New project '${title}' created`, 'create', p.id)
        return p.id
      },

      addProject: (project) => {
        set((s) => ({ projects: [project, ...s.projects], currentProjectId: project.id }))
        get().logActivity(`Imported project '${project.title}'`, 'create', project.id)
        return project.id
      },

      updateProject: (id, updates) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== id) return p
            const patch = typeof updates === 'function' ? updates(p) : updates
            return { ...p, ...patch, updatedAt: nowISO() }
          }),
        })),

      deleteProject: (id) => {
        const s = get()
        const target = s.projects.find((p) => p.id === id)
        const remaining = s.projects.filter((p) => p.id !== id)
        const key = target?.videoFile?.storageKey
        if (key && !remaining.some((p) => p.videoFile?.storageKey === key)) {
          forgetVideoUrl(key)
          void deleteVideoBlob(key)
        }
        set({
          projects: remaining,
          currentProjectId: s.currentProjectId === id ? remaining[0]?.id ?? null : s.currentProjectId,
        })
        if (target) get().logActivity(`Deleted project '${target.title}'`, 'delete')
      },

      duplicateProject: (id) => {
        const src = get().projects.find((p) => p.id === id)
        if (!src) return null
        const now = nowISO()
        const copy: Project = {
          ...structuredClone(src),
          id: generateId(),
          title: `${src.title} (copy)`,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ projects: [copy, ...s.projects] }))
        get().logActivity(`Duplicated '${src.title}'`, 'create', copy.id)
        return copy.id
      },

      setCurrentProject: (id) => {
        if (get().currentProjectId !== id) set({ currentProjectId: id })
      },

      markStep: (id, step) => {
        const p = get().projects.find((x) => x.id === id)
        if (!p || p.completedSteps.includes(step)) return
        get().updateProject(id, { completedSteps: [...p.completedSteps, step] })
      },

      logActivity: (text, kind, projectId) =>
        set((s) => ({ activity: [{ id: generateId(), text, kind, projectId, at: nowISO() }, ...s.activity].slice(0, 30) })),

      resetDemoData: () => {
        const s = get()
        const userProjects = s.projects.filter((p) => !p.isDemo)
        set({ projects: [...userProjects, ...seedProjects()], currentProjectId: 'demo-1' })
        get().logActivity('Demo projects restored', 'create')
      },
    }),
    {
      name: 'creovox-storage',
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      // v1 stored Date objects and a different shape — start fresh.
      migrate: (persisted, version) => (version < 2 ? ({} as AppState) : (persisted as AppState)),
      partialize: (s) => ({ projects: s.projects, currentProjectId: s.currentProjectId, activity: s.activity }),
    }
  )
)

export const useProject = (id: string | undefined) => useAppStore((s) => s.projects.find((p) => p.id === id))

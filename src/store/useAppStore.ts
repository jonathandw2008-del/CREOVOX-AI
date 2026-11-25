import { create } from 'zustand'
import { ApiError, activityApi, projectsApi } from '@/lib/api'
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

/** True for projects stored in the signed-in user's server workspace (not local demos). */
export const isServerProject = (p?: Project | null): p is Project & { version: number } => !!p && !p.isDemo && typeof p.version === 'number'

interface AppState {
  projects: Project[]
  currentProjectId: string | null
  activity: ActivityEntry[]
  sidebarOpen: boolean
  /** Server projects for the current user have been loaded. */
  hydrated: boolean
  setSidebarOpen: (open: boolean) => void

  /** Loads the user's server projects + activity (call after sign-in). Demo projects stay local. */
  hydrate: () => Promise<void>
  /** Drops all user data from memory (sign-out). Demo projects are kept. */
  clearUserData: () => void
  /** Creates a blank project on the server; resolves with its id. */
  createProject: (title: string, description?: string) => Promise<string>
  /** Saves a client-built project (e.g. JSON import) to the server; resolves with the new id. */
  addProject: (project: Project) => Promise<string>
  /** Optimistic local update; server projects are saved with a debounced PUT. */
  updateProject: (id: string, updates: Updater) => void
  deleteProject: (id: string) => Promise<void>
  duplicateProject: (id: string) => Promise<string | null>
  /** Resolves once any pending/in-flight save of this project has reached the server. */
  flushProject: (id: string) => Promise<void>
  /** Re-fetches a server project (discarding unsaved local edits) and returns it. */
  refreshProject: (id: string) => Promise<Project | undefined>
  /** Puts a server copy into the store without triggering a save. */
  replaceProject: (p: Project) => void
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
        toast('Browser storage is full — demo project edits may not persist.', 'error')
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

/* ------------------------------------------------------------------ */
/* Server sync internals (module scope: not part of React state)        */
/* ------------------------------------------------------------------ */

const SAVE_DEBOUNCE_MS = 800
const RETRY_MS = 5000
const timers = new Map<string, ReturnType<typeof setTimeout>>()
/** Projects with local edits not yet sent. */
const dirty = new Set<string>()
/** Incremented on every local edit so a save response doesn't clobber newer edits. */
const editSeq = new Map<string, number>()
/** Serialised save chain per project. */
const chains = new Map<string, Promise<void>>()
let offlineWarned = false
let hydrating: Promise<void> | null = null

function clearTimer(id: string) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
}

function forgetSync(id: string) {
  clearTimer(id)
  dirty.delete(id)
  editSeq.delete(id)
}

/** Strip fields the server owns before POSTing a client-built project. */
function forCreate(p: Partial<Project>): Partial<Project> {
  const { id: _id, version: _v, createdAt: _c, updatedAt: _u, isDemo: _d, videoFile: _vf, ...rest } = p
  void _id
  void _v
  void _c
  void _u
  void _d
  void _vf
  return rest
}

function apiMessage(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const putLocal = (p: Project, front = true) =>
        set((s) => {
          const exists = s.projects.some((x) => x.id === p.id)
          return { projects: exists ? s.projects.map((x) => (x.id === p.id ? p : x)) : front ? [p, ...s.projects] : [...s.projects, p] }
        })

      const schedule = (id: string, delay = SAVE_DEBOUNCE_MS) => {
        clearTimer(id)
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id)
            void runSave(id)
          }, delay)
        )
      }

      const doSave = async (id: string) => {
        if (!dirty.has(id)) return
        const p = get().projects.find((x) => x.id === id)
        if (!isServerProject(p)) {
          dirty.delete(id)
          return
        }
        const seq = editSeq.get(id) ?? 0
        dirty.delete(id)
        try {
          const saved = await projectsApi.update(p, p.version)
          offlineWarned = false
          set((s) => ({
            projects: s.projects.map((x) =>
              x.id === id
                ? // Keep local content (it may have newer edits); take the server's bookkeeping fields.
                  { ...x, version: saved.version, updatedAt: saved.updatedAt, videoFile: saved.videoFile ?? x.videoFile }
                : x
            ),
          }))
          // A newer edit arrived while saving: it will be sent by its own scheduled save.
          if (editSeq.get(id) !== seq && dirty.has(id) && !timers.has(id)) schedule(id)
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            const current = (e.body as { project?: Project }).project
            forgetSync(id)
            if (current) putLocal(current)
            else await get().refreshProject(id)
            toast('This project changed elsewhere — reloaded the latest version.', 'info')
          } else if (e instanceof ApiError && e.status === 404) {
            forgetSync(id)
            set((s) => ({ projects: s.projects.filter((x) => x.id !== id) }))
            toast('This project no longer exists on the server.', 'error')
          } else if (e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 429)) {
            dirty.add(id)
            if (!offlineWarned) {
              offlineWarned = true
              toast("Can't reach the server — your changes will be saved when the connection returns.", 'error')
            }
            schedule(id, RETRY_MS)
          } else if (e instanceof ApiError && e.status === 401) {
            dirty.add(id) // signed out; data is cleared by the auth listener
          } else {
            toast(`Couldn't save changes: ${apiMessage(e, 'unknown error')}`, 'error')
          }
        }
      }

      const runSave = (id: string): Promise<void> => {
        const prev = chains.get(id) ?? Promise.resolve()
        const next = prev.then(() => doSave(id)).catch(() => undefined)
        chains.set(id, next)
        void next.finally(() => {
          if (chains.get(id) === next) chains.delete(id)
        })
        return next
      }

      return {
        projects: seedProjects(),
        currentProjectId: 'demo-1',
        activity: seedActivity(),
        sidebarOpen: false,
        hydrated: false,
        setSidebarOpen: (open) => set({ sidebarOpen: open }),

        hydrate: () => {
          if (hydrating) return hydrating
          hydrating = (async () => {
            try {
              const [server, activity] = await Promise.all([projectsApi.list(), activityApi.list().catch(() => [] as ActivityEntry[])])
              set((s) => {
                const demos = s.projects.filter((p) => p.isDemo)
                const projects = [...server, ...(demos.length ? demos : seedProjects())]
                const currentProjectId = projects.some((p) => p.id === s.currentProjectId) ? s.currentProjectId : (server[0]?.id ?? projects[0]?.id ?? null)
                return { projects, activity: activity.slice(0, 30), currentProjectId, hydrated: true }
              })
            } catch (e) {
              set({ hydrated: true })
              if (!(e instanceof ApiError && e.status === 401)) toast(`Couldn't load your projects: ${apiMessage(e, 'server unavailable')}`, 'error')
            } finally {
              hydrating = null
            }
          })()
          return hydrating
        },

        clearUserData: () => {
          ;[...timers.keys()].forEach(clearTimer)
          dirty.clear()
          editSeq.clear()
          chains.clear()
          set((s) => {
            const demos = s.projects.filter((p) => p.isDemo)
            return { projects: demos.length ? demos : seedProjects(), activity: [], hydrated: false, currentProjectId: 'demo-1' }
          })
        },

        createProject: async (title, description = '') => {
          const created = await projectsApi.create(forCreate(blankProject(title, description)))
          putLocal(created)
          set({ currentProjectId: created.id })
          return created.id
        },

        addProject: async (project) => {
          if (project.isDemo) {
            putLocal(project)
            set({ currentProjectId: project.id })
            return project.id
          }
          const created = await projectsApi.create(forCreate(project))
          putLocal(created)
          set({ currentProjectId: created.id })
          return created.id
        },

        updateProject: (id, updates) => {
          let target: Project | undefined
          set((s) => ({
            projects: s.projects.map((p) => {
              if (p.id !== id) return p
              const patch = typeof updates === 'function' ? updates(p) : updates
              target = { ...p, ...patch, updatedAt: nowISO() }
              return target
            }),
          }))
          if (isServerProject(target)) {
            dirty.add(id)
            editSeq.set(id, (editSeq.get(id) ?? 0) + 1)
            schedule(id)
          }
        },

        deleteProject: async (id) => {
          const s = get()
          const index = s.projects.findIndex((p) => p.id === id)
          const target = s.projects[index]
          if (!target) return
          const remaining = s.projects.filter((p) => p.id !== id)
          forgetSync(id)
          set({
            projects: remaining,
            currentProjectId: s.currentProjectId === id ? (remaining[0]?.id ?? null) : s.currentProjectId,
          })
          if (isServerProject(target)) {
            try {
              await projectsApi.remove(id)
            } catch (e) {
              if (!(e instanceof ApiError && e.status === 404)) {
                set((st) => {
                  const projects = [...st.projects]
                  projects.splice(Math.min(index, projects.length), 0, target)
                  return { projects }
                })
                toast(`Couldn't delete '${target.title}': ${apiMessage(e, 'server unavailable')}`, 'error')
                return
              }
            }
            set((st) => ({ activity: [{ id: generateId(), text: `Deleted project '${target.title}'`, kind: 'delete' as const, at: nowISO() }, ...st.activity].slice(0, 30) }))
            return
          }
          // Local demo / legacy browser project: clean up any IndexedDB video it owned.
          const key = target.videoFile?.storageKey
          if (key && !target.videoFile?.assetId && !remaining.some((p) => p.videoFile?.storageKey === key)) {
            forgetVideoUrl(key)
            void deleteVideoBlob(key)
          }
          get().logActivity(`Deleted project '${target.title}'`, 'delete')
        },

        duplicateProject: async (id) => {
          const src = get().projects.find((p) => p.id === id)
          if (!src) return null
          try {
            let copy: Project
            if (isServerProject(src)) {
              await get().flushProject(id)
              copy = await projectsApi.duplicate(id)
            } else {
              // Copies of demos (and legacy local projects) become real server projects.
              copy = await projectsApi.create(forCreate({ ...structuredClone(src), title: `${src.title} (copy)`, status: src.status === 'processing' ? 'ready' : src.status }))
            }
            putLocal(copy)
            set((s) => ({ activity: [{ id: generateId(), text: `Duplicated '${src.title}'`, kind: 'create' as const, projectId: copy.id, at: nowISO() }, ...s.activity].slice(0, 30) }))
            return copy.id
          } catch (e) {
            toast(`Couldn't duplicate '${src.title}': ${apiMessage(e, 'server unavailable')}`, 'error')
            return null
          }
        },

        flushProject: (id) => {
          if (timers.has(id) || dirty.has(id)) {
            clearTimer(id)
            return runSave(id)
          }
          return chains.get(id) ?? Promise.resolve()
        },

        refreshProject: async (id) => {
          clearTimer(id)
          dirty.delete(id)
          await (chains.get(id) ?? Promise.resolve())
          try {
            const fresh = await projectsApi.get(id)
            forgetSync(id)
            putLocal(fresh)
            return fresh
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
            return undefined
          }
        },

        replaceProject: (p) => {
          forgetSync(p.id)
          putLocal(p)
        },

        setCurrentProject: (id) => {
          if (get().currentProjectId !== id) set({ currentProjectId: id })
        },

        markStep: (id, step) => {
          const p = get().projects.find((x) => x.id === id)
          if (!p || p.completedSteps.includes(step)) return
          get().updateProject(id, { completedSteps: [...p.completedSteps, step] })
        },

        logActivity: (text, kind, projectId) => {
          set((s) => ({ activity: [{ id: generateId(), text, kind, projectId, at: nowISO() }, ...s.activity].slice(0, 30) }))
          // The server already records create/delete/process/export for its projects; only mirror edits.
          const p = projectId ? get().projects.find((x) => x.id === projectId) : undefined
          if (kind === 'edit' && isServerProject(p)) void activityApi.log(text, kind, projectId).catch(() => undefined)
        },

        resetDemoData: () => {
          const s = get()
          const userProjects = s.projects.filter((p) => !p.isDemo)
          set({ projects: [...userProjects, ...seedProjects()], currentProjectId: 'demo-1' })
          get().logActivity('Demo projects restored', 'create')
        },
      }
    },
    {
      name: 'creovox-storage',
      version: 3,
      storage: createJSONStorage(() => safeStorage),
      // v1/v2 stored browser-only projects; v3 keeps only local demo projects (user data lives on the server).
      migrate: (persisted, version) => (version < 3 ? ({} as AppState) : (persisted as AppState)),
      partialize: (s) => ({ projects: s.projects.filter((p) => p.isDemo), currentProjectId: s.currentProjectId }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        const demos = Array.isArray(p.projects) && p.projects.length ? p.projects.filter((x) => x.isDemo) : current.projects
        return { ...current, projects: demos, currentProjectId: p.currentProjectId ?? current.currentProjectId }
      },
    }
  )
)

export const useProject = (id: string | undefined) => useAppStore((s) => s.projects.find((p) => p.id === id))

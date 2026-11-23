import { Upload, Cpu, FileText, Sparkles, Film, Captions, Image, PenTool, Users, Download, type LucideIcon } from 'lucide-react'
import type { Project, WorkflowStep } from '@/types'

export interface StepDef {
  id: WorkflowStep
  label: string
  short: string
  icon: LucideIcon
  path: (id: string) => string
}

export const WORKFLOW: StepDef[] = [
  { id: 'upload', label: 'Upload Video', short: 'Upload', icon: Upload, path: () => '/studio/upload' },
  { id: 'process', label: 'AI Analysis', short: 'Analyse', icon: Cpu, path: (id) => `/studio/process/${id}` },
  { id: 'transcript', label: 'Transcription', short: 'Transcript', icon: FileText, path: (id) => `/studio/transcript/${id}` },
  { id: 'highlights', label: 'Highlights', short: 'Highlights', icon: Sparkles, path: (id) => `/studio/highlights/${id}` },
  { id: 'editor', label: 'Video Editor', short: 'Editor', icon: Film, path: (id) => `/studio/editor/${id}` },
  { id: 'subtitles', label: 'Subtitle Studio', short: 'Subtitles', icon: Captions, path: (id) => `/studio/subtitles/${id}` },
  { id: 'thumbnails', label: 'Thumbnail Studio', short: 'Thumbnails', icon: Image, path: (id) => `/studio/thumbnails/${id}` },
  { id: 'content', label: 'Content Writer', short: 'Content', icon: PenTool, path: (id) => `/studio/content/${id}` },
  { id: 'audience', label: 'Audience', short: 'Audience', icon: Users, path: (id) => `/studio/audience/${id}` },
  { id: 'export', label: 'Export Studio', short: 'Export', icon: Download, path: (id) => `/studio/export/${id}` },
]

/** Steps shown inside a project (upload happens before a project exists). */
export const PROJECT_STEPS = WORKFLOW.filter((s) => s.id !== 'upload')

export function stepIndex(step: WorkflowStep) {
  return WORKFLOW.findIndex((s) => s.id === step)
}

export function nextStep(step: WorkflowStep): StepDef | undefined {
  return WORKFLOW[stepIndex(step) + 1]
}

export function prevStep(step: WorkflowStep): StepDef | undefined {
  const i = stepIndex(step)
  return i > 1 ? WORKFLOW[i - 1] : undefined
}

export function projectProgress(p: Project) {
  const done = WORKFLOW.filter((s) => p.completedSteps.includes(s.id)).length
  return Math.round((done / WORKFLOW.length) * 100)
}

/** The route a project should resume at. */
export function resumePath(p: Project) {
  if (p.status === 'processing' || p.status === 'uploading' || !p.completedSteps.includes('process')) return `/studio/process/${p.id}`
  const next = WORKFLOW.find((s) => s.id !== 'upload' && !p.completedSteps.includes(s.id))
  return (next ?? WORKFLOW[WORKFLOW.length - 1]).path(p.id)
}

import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, FolderOpen } from 'lucide-react'
import { useAppStore, useProject } from '@/store/useAppStore'
import { PROJECT_STEPS, WORKFLOW, nextStep, prevStep, stepIndex } from '@/lib/workflow'
import type { Project, WorkflowStep } from '@/types'
import { EmptyState } from '@/components/ui'
import { cn } from '@/utils/helpers'

export function WorkflowStepper({ project, step }: { project: Project; step: WorkflowStep }) {
  const activeRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [step])

  return (
    <nav aria-label="Workflow" className="mask-fade-x -mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0 sm:[mask-image:none]">
      <ol className="flex min-w-max items-center gap-1 py-1 sm:min-w-0 sm:flex-wrap">
        {PROJECT_STEPS.map((s, i) => {
          const done = project.completedSteps.includes(s.id)
          const active = s.id === step
          const Icon = s.icon
          return (
            <li key={s.id} className="flex items-center">
              <Link
                ref={active ? activeRef : undefined}
                to={s.path(project.id)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'group flex min-h-[40px] items-center gap-2 rounded-full border px-3 text-xs font-medium transition-all',
                  active
                    ? 'border-brand-primary/50 bg-brand-primary/15 text-text-primary shadow-[0_0_24px_-8px_rgba(255,91,22,0.8)]'
                    : done
                      ? 'border-white/[0.06] bg-white/[0.03] text-text-secondary hover:text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full',
                    active ? 'bg-brand-primary text-white' : done ? 'bg-status-success/15 text-status-success' : 'bg-white/[0.05]'
                  )}
                >
                  {done && !active ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                </span>
                {s.short}
              </Link>
              {i < PROJECT_STEPS.length - 1 && <span className={cn('mx-0.5 h-px w-3', done ? 'bg-status-success/40' : 'bg-white/10')} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

interface ShellProps {
  step: WorkflowStep
  title: string
  subtitle?: ReactNode
  actions?: ReactNode | ((p: Project) => ReactNode)
  children: (project: Project) => ReactNode
  /** Override the "next" action (e.g. create clips before moving on). Return false to cancel navigation. */
  onNext?: (project: Project) => boolean | void
  nextLabel?: string
  hideFooter?: boolean
}

export default function ProjectShell({ step, title, subtitle, actions, children, onNext, nextLabel, hideFooter }: ShellProps) {
  const { id } = useParams<{ id: string }>()
  const project = useProject(id)
  const setCurrentProject = useAppStore((s) => s.setCurrentProject)
  const markStep = useAppStore((s) => s.markStep)
  const navigate = useNavigate()

  useEffect(() => {
    if (project) setCurrentProject(project.id)
  }, [project?.id, setCurrentProject]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Project not found"
        body="It may have been deleted, or this link belongs to another browser. Projects are stored locally on this device."
        action={
          <Link to="/studio/projects" className="btn-primary">
            Open Project Library
          </Link>
        }
      />
    )
  }

  const next = nextStep(step)
  const prev = prevStep(step)
  const i = stepIndex(step)

  const goNext = () => {
    if (onNext && onNext(project) === false) return
    markStep(project.id, step)
    if (next) navigate(next.path(project.id))
    else navigate('/studio/projects')
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="space-y-4">
        <WorkflowStepper project={project} step={step} />
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="eyebrow max-w-full">
              <span className="whitespace-nowrap">
                Step {String(i).padStart(2, '0')} / {String(WORKFLOW.length - 1).padStart(2, '0')}
              </span>
              <span className="hidden text-text-muted sm:inline">·</span>
              <span className="hidden truncate normal-case tracking-normal text-text-muted sm:inline">{project.title}</span>
            </p>
            <h1 className="mt-2 font-heading text-2xl font-bold text-text-primary sm:text-3xl">{title}</h1>
            {subtitle && <div className="mt-1 text-sm text-text-secondary">{subtitle}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{typeof actions === 'function' ? actions(project) : actions}</div>}
        </div>
      </motion.header>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>
        {children(project)}
      </motion.div>

      {!hideFooter && (
        <div className="glass-nav fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.07] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:static md:mt-4 md:rounded-section md:border md:bg-transparent md:p-0 md:backdrop-blur-none lg:ml-0">
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 md:justify-between">
            {prev ? (
              <Link to={prev.path(project.id)} aria-label={`Back to ${prev.label}`} className="btn-secondary flex-1 md:flex-none">
                <ArrowLeft className="h-4 w-4" />
                <span className="max-[359px]:hidden">{prev.short}</span>
              </Link>
            ) : (
              <span className="hidden md:block" />
            )}
            <button type="button" onClick={goNext} className="btn-primary flex-[2] md:flex-none">
              {nextLabel ?? (next ? `Continue to ${next.short}` : 'Finish & open library')}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

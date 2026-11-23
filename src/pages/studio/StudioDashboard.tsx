import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FolderOpen, Film, CheckCircle2, Plus, Upload, ArrowRight, Clock, Captions, Sparkles, Play } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { PROJECT_STEPS, projectProgress, resumePath } from '@/lib/workflow'
import { Panel } from '@/components/ui'
import { ProjectCover, STATUS } from './ProjectsPage'
import { cn, formatDuration, formatRelativeTime } from '@/utils/helpers'

const fade = (d = 0) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: d } })

export default function StudioDashboard() {
  const { projects, activity, setCurrentProject, currentProjectId } = useAppStore()
  const navigate = useNavigate()
  const sorted = [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  const resume = projects.find((p) => p.id === currentProjectId && p.status !== 'completed') ?? sorted.find((p) => p.status !== 'completed') ?? sorted[0]

  const stats = [
    { label: 'Projects', value: projects.length, icon: FolderOpen },
    { label: 'Clips', value: projects.reduce((a, p) => a + p.clips.length, 0), icon: Film },
    { label: 'Subtitle tracks', value: projects.reduce((a, p) => a + p.subtitles.length, 0), icon: Captions },
    { label: 'Exported', value: projects.filter((p) => p.status === 'completed').length, icon: CheckCircle2 },
  ]

  const go = (id: string, path: string) => {
    setCurrentProject(id)
    navigate(path)
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <motion.div {...fade()} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Creative studio</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-text-primary sm:text-4xl">
            Welcome back, <span className="serif-accent text-brand-highlight">creator.</span>
          </h1>
          <p className="mt-1 text-text-secondary">Pick up where you left off, or start something new.</p>
        </div>
        <Link to="/studio/upload" className="btn-primary">
          <Plus className="h-5 w-5" /> New project
        </Link>
      </motion.div>

      {/* Resume hero */}
      {resume && (
        <motion.div {...fade(0.05)}>
          <Panel className="relative overflow-hidden !p-0">
            <div className="ambient-orb -right-20 -top-20 h-72 w-72 opacity-60" />
            <div className="relative grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <button type="button" onClick={() => go(resume.id, resumePath(resume))} className="group relative block text-left" aria-label={`Continue ${resume.title}`}>
                <ProjectCover p={resume} className="aspect-video h-full md:aspect-auto md:min-h-[260px]" />
                <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary shadow-[0_10px_40px_-6px_rgba(255,91,22,0.9)] transition-transform group-hover:scale-110">
                  <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
                </span>
              </button>
              <div className="flex flex-col p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', STATUS[resume.status].cls)}>{STATUS[resume.status].label}</span>
                  {resume.duration > 0 && (
                    <span className="flex items-center gap-1 text-xs text-text-muted">
                      <Clock className="h-3.5 w-3.5" /> {formatDuration(resume.duration)}
                    </span>
                  )}
                </div>
                <h2 className="mt-3 font-heading text-xl font-bold text-text-primary sm:text-2xl">{resume.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{resume.description}</p>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {PROJECT_STEPS.map((s) => {
                    const done = resume.completedSteps.includes(s.id)
                    const Icon = s.icon
                    return (
                      <Link key={s.id} to={s.path(resume.id)} onClick={() => setCurrentProject(resume.id)} title={s.label} aria-label={`${s.label}${done ? ' (done)' : ''}`} className={cn('flex h-11 w-11 items-center justify-center rounded-xl border transition-colors', done ? 'border-status-success/20 bg-status-success/10 text-status-success' : 'border-white/[0.07] bg-white/[0.02] text-text-muted hover:text-text-primary')}>
                        <Icon className="h-4 w-4" />
                      </Link>
                    )
                  })}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
                  <button type="button" className="btn-primary" onClick={() => go(resume.id, resumePath(resume))}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                  <span className="font-mono text-xs text-text-muted">{projectProgress(resume)}% complete</span>
                </div>
              </div>
            </div>
          </Panel>
        </motion.div>
      )}

      {/* Stats */}
      <motion.div {...fade(0.1)} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Panel key={s.label} className="!rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted sm:text-sm">{s.label}</span>
                <Icon className="h-4 w-4 text-brand-primary" />
              </div>
              <p className="mt-2 font-heading text-3xl font-bold text-text-primary">{s.value}</p>
            </Panel>
          )
        })}
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <motion.div {...fade(0.15)}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold text-text-primary">Recent projects</h2>
            <Link to="/studio/projects" className="inline-flex min-h-[44px] items-center gap-1 px-2 text-sm text-brand-highlight hover:text-brand-secondary">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sorted.slice(0, 4).map((p) => (
              <button key={p.id} type="button" onClick={() => go(p.id, resumePath(p))} className="glass-panel card-interactive flex items-center gap-3 !rounded-2xl p-3 text-left">
                <ProjectCover p={p} className="h-16 w-24 flex-shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text-primary">{p.title}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS[p.status].cls)}>{STATUS[p.status].label}</span>
                    {formatRelativeTime(p.updatedAt)}
                  </span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className="block h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-highlight" style={{ width: `${projectProgress(p)}%` }} />
                  </span>
                </span>
              </button>
            ))}
          </div>

          <h2 className="mb-3 mt-8 font-heading text-lg font-semibold text-text-primary">Quick actions</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: Upload, label: 'Upload video', sub: 'Start a new project', to: '/studio/upload' },
              { icon: Sparkles, label: 'Explore demo', sub: 'Fully populated sample', to: '/studio/editor/demo-1' },
              { icon: FolderOpen, label: 'Library', sub: 'Manage projects', to: '/studio/projects' },
            ].map((a) => (
              <Link key={a.label} to={a.to} className="glass-panel card-interactive group flex items-center gap-3 !rounded-2xl p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                  <a.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-text-primary">{a.label}</span>
                  <span className="block text-xs text-text-muted">{a.sub}</span>
                </span>
              </Link>
            ))}
          </div>
        </motion.div>

        <motion.div {...fade(0.2)}>
          <h2 className="mb-3 font-heading text-lg font-semibold text-text-primary">Activity</h2>
          <Panel className="!p-2">
            {activity.length === 0 && <p className="p-6 text-center text-sm text-text-muted">No activity yet.</p>}
            <ul>
              {activity.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-xl px-3 py-3">
                  <span className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', a.kind === 'export' ? 'bg-status-success' : a.kind === 'delete' ? 'bg-status-error' : a.kind === 'process' ? 'bg-status-info' : 'bg-brand-primary')} />
                  <span className="flex-1 text-sm text-text-secondary">{a.text}</span>
                  <span className="whitespace-nowrap text-xs text-text-muted">{formatRelativeTime(a.at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </motion.div>
      </div>
    </div>
  )
}

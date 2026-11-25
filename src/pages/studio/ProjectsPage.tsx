import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Film, Clock, LayoutGrid, List, MoreVertical, Pencil, Copy, Trash2, Check, X, AlertTriangle, RotateCcw, ArrowRight, FlaskConical } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { projectProgress, resumePath } from '@/lib/workflow'
import { EmptyState, IconButton, Modal, Panel, Segmented } from '@/components/ui'
import { toast } from '@/store/useToast'
import type { Project, ProjectStatus } from '@/types'
import { cn, formatDate, formatDuration, formatRelativeTime } from '@/utils/helpers'

export const STATUS: Record<ProjectStatus, { cls: string; label: string }> = {
  uploading: { cls: 'text-brand-highlight bg-brand-primary/10', label: 'Uploading' },
  processing: { cls: 'text-status-warning bg-status-warning/10', label: 'Processing' },
  ready: { cls: 'text-status-info bg-status-info/10', label: 'In progress' },
  completed: { cls: 'text-status-success bg-status-success/10', label: 'Exported' },
}

type Sort = 'updated' | 'newest' | 'oldest' | 'az'

export function ProjectCover({ p, className }: { p: Project; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden bg-[#0d1015]', className)}>
      {p.thumbnail ? (
        <img src={p.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at ${20 + (p.title.length * 7) % 60}% 30%, rgba(255,91,22,0.35), transparent 60%), linear-gradient(160deg,#171c24,#0a0c10)` }} />
          <div className="grid-fade absolute inset-0 opacity-60" />
          <Film className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white/15" />
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
    </div>
  )
}

function CardMenu({ onRename, onDuplicate, onDelete }: { onRename: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('pointerdown', h)
      document.removeEventListener('keydown', k)
    }
  }, [open])
  const item = 'flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm'
  return (
    <div ref={ref} className="relative">
      <IconButton label="Project actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreVertical className="h-4 w-4" />
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.97 }} className="glass-panel absolute bottom-full right-0 z-30 mb-1 w-44 !rounded-2xl p-1.5">
            <button role="menuitem" type="button" className={cn(item, 'text-text-secondary hover:bg-white/[0.05] hover:text-text-primary')} onClick={() => (setOpen(false), onRename())}>
              <Pencil className="h-4 w-4" /> Rename
            </button>
            <button role="menuitem" type="button" className={cn(item, 'text-text-secondary hover:bg-white/[0.05] hover:text-text-primary')} onClick={() => (setOpen(false), onDuplicate())}>
              <Copy className="h-4 w-4" /> Duplicate
            </button>
            <button role="menuitem" type="button" className={cn(item, 'text-status-error hover:bg-status-error/10')} onClick={() => (setOpen(false), onDelete())}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ProjectsPage() {
  const { projects, updateProject, deleteProject, duplicateProject, resetDemoData, setCurrentProject } = useAppStore()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | ProjectStatus>('all')
  const [sort, setSort] = useState<Sort>('updated')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    let r = projects.filter((p) => (!term || p.title.toLowerCase().includes(term) || p.description.toLowerCase().includes(term)) && (status === 'all' || p.status === status))
    const t = (d: string) => new Date(d).getTime()
    r = [...r].sort((a, b) => (sort === 'updated' ? t(b.updatedAt) - t(a.updatedAt) : sort === 'newest' ? t(b.createdAt) - t(a.createdAt) : sort === 'oldest' ? t(a.createdAt) - t(b.createdAt) : a.title.localeCompare(b.title)))
    return r
  }, [projects, q, status, sort])

  const open = (p: Project) => {
    setCurrentProject(p.id)
    navigate(resumePath(p))
  }
  const startRename = (p: Project) => {
    setEditingId(p.id)
    setEditTitle(p.title)
  }
  const saveRename = () => {
    if (editingId && editTitle.trim()) {
      updateProject(editingId, { title: editTitle.trim() })
      toast('Project renamed')
    }
    setEditingId(null)
  }
  const dup = (p: Project) => {
    duplicateProject(p.id)
    toast(`Duplicated '${p.title}'`)
  }
  const target = projects.find((p) => p.id === deleteId)

  const titleEdit = (p: Project) =>
    editingId === p.id ? (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          saveRename()
        }}
      >
        <input autoFocus aria-label="Project title" className="input !min-h-[40px]" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditingId(null)} />
        <IconButton label="Save" type="submit" className="text-status-success">
          <Check className="h-4 w-4" />
        </IconButton>
        <IconButton label="Cancel" onClick={() => setEditingId(null)}>
          <X className="h-4 w-4" />
        </IconButton>
      </form>
    ) : (
      <h3 className="truncate font-heading font-semibold text-text-primary" title={p.title}>
        {p.title}
      </h3>
    )

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="mt-2 font-heading text-2xl font-bold text-text-primary sm:text-3xl">
            Your <span className="serif-accent text-brand-highlight">projects</span>
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {projects.length} project{projects.length === 1 ? '' : 's'} saved in this browser
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Restore demo projects" className="btn-secondary !px-4 !text-sm" onClick={() => (resetDemoData(), toast('Demo projects restored'))}>
            <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Restore demos</span>
          </button>
          <Link to="/studio/upload" className="btn-primary">
            <Plus className="h-4 w-4" /> New project
          </Link>
        </div>
      </motion.div>

      <Panel className="flex flex-col gap-3 !rounded-2xl p-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input type="search" aria-label="Search projects" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" />
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <select aria-label="Filter by status" className="select md:w-40" value={status} onChange={(e) => setStatus(e.target.value as 'all' | ProjectStatus)}>
            <option value="all">All status</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select aria-label="Sort" className="select md:w-40" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="updated">Recently edited</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A → Z</option>
          </select>
          <Segmented
            ariaLabel="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: <span className="sr-only">Grid</span>, icon: LayoutGrid },
              { value: 'list', label: <span className="sr-only">List</span>, icon: List },
            ]}
          />
        </div>
      </Panel>

      {list.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Film}
            title={projects.length ? 'No projects match' : 'No projects yet'}
            body={projects.length ? 'Try a different search or filter.' : 'Upload a video to create your first project.'}
            action={
              projects.length ? (
                <button className="btn-secondary" onClick={() => (setQ(''), setStatus('all'))}>
                  Clear filters
                </button>
              ) : (
                <Link to="/studio/upload" className="btn-primary">
                  <Plus className="h-4 w-4" /> Upload video
                </Link>
              )
            }
          />
        </Panel>
      ) : view === 'grid' ? (
        <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {list.map((p) => {
              const prog = projectProgress(p)
              return (
                <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} className="glass-panel card-interactive group overflow-hidden !p-0">
                  <button type="button" onClick={() => open(p)} className="relative block w-full text-left" aria-label={`Open ${p.title}`}>
                    <ProjectCover p={p} className="aspect-video" />
                    <span className={cn('absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur', STATUS[p.status].cls)}>{STATUS[p.status].label}</span>
                    {p.isDemo && (
                      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] text-white/80 backdrop-blur">
                        <FlaskConical className="h-3 w-3" /> Demo
                      </span>
                    )}
                    {p.duration > 0 && (
                      <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-white/90">{formatDuration(p.duration)}</span>
                    )}
                  </button>
                  <div className="p-4">
                    {titleEdit(p)}
                    <p className="mt-1 line-clamp-1 text-sm text-text-muted">{p.description}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-highlight" style={{ width: `${prog}%` }} />
                      </div>
                      <span className="font-mono text-[11px] text-text-muted">{prog}%</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 border-t border-white/[0.05] pt-2">
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <Clock className="h-3.5 w-3.5" /> {formatRelativeTime(p.updatedAt)}
                      </span>
                      <button type="button" onClick={() => open(p)} className="ml-auto inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-sm font-medium text-brand-highlight hover:bg-brand-primary/10">
                        {p.status === 'completed' ? 'Open' : 'Continue'} <ArrowRight className="h-4 w-4" />
                      </button>
                      <CardMenu onRename={() => startRename(p)} onDuplicate={() => dup(p)} onDelete={() => setDeleteId(p.id)} />
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      ) : (
        <Panel className="divide-y divide-white/[0.05] !p-0">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3 sm:gap-4">
              <button type="button" onClick={() => open(p)} className="flex-shrink-0 overflow-hidden rounded-xl" aria-label={`Open ${p.title}`}>
                <ProjectCover p={p} className="h-12 w-20 sm:h-14 sm:w-24" />
              </button>
              <div className="min-w-0 flex-1">
                {titleEdit(p)}
                <p className="text-xs text-text-muted">
                  {formatDate(p.createdAt)} · {projectProgress(p)}% complete
                </p>
              </div>
              <span className={cn('hidden rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline', STATUS[p.status].cls)}>{STATUS[p.status].label}</span>
              <span className="hidden font-mono text-xs text-text-muted md:inline">{formatDuration(p.duration)}</span>
              <button type="button" onClick={() => open(p)} className="hidden min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-brand-highlight hover:bg-brand-primary/10 sm:inline-flex">
                Open
              </button>
              <CardMenu onRename={() => startRename(p)} onDuplicate={() => dup(p)} onDelete={() => setDeleteId(p.id)} />
            </div>
          ))}
        </Panel>
      )}

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} labelledBy="del-title">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-status-error/10">
          <AlertTriangle className="h-6 w-6 text-status-error" />
        </span>
        <h3 id="del-title" className="text-center font-heading text-lg font-semibold text-text-primary">
          Delete “{target?.title}”?
        </h3>
        <p className="mt-2 text-center text-sm text-text-secondary">The project and its uploaded video will be permanently deleted. This can't be undone.</p>
        <div className="mt-6 flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={() => setDeleteId(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger flex-1"
            onClick={() => {
              if (deleteId) deleteProject(deleteId)
              setDeleteId(null)
              toast('Project deleted')
            }}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}

import { useState, type ComponentType } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Type, FileText, MessageSquare, Hash, RefreshCw, Copy, Loader, Plus, X, Download, Youtube, Instagram, Music2, Twitter, Linkedin, Facebook, PenTool } from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import { AIBadge, EmptyState, Field, IconButton, Notice, Panel, SimBadge, aiLabel, useAiStatus } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { PLATFORMS, TONES } from '@/data/mockData'
import { generateContentField, generateContentSet } from '@/lib/generators'
import { aiApi, aiContext, isAiUnavailable } from '@/lib/api'
import { toast, copyWithToast } from '@/store/useToast'
import type { ContentOutput, ContentType, Platform, Project, Tone } from '@/types'
import { cn, downloadText, slugify } from '@/utils/helpers'

const ICONS: Record<Platform, ComponentType<{ className?: string }>> = { youtube: Youtube, instagram: Instagram, tiktok: Music2, twitter: Twitter, linkedin: Linkedin, facebook: Facebook }
export const PLATFORM_LIMITS: Record<Platform, { title: number; body: number }> = {
  youtube: { title: 100, body: 5000 },
  instagram: { title: 125, body: 2200 },
  tiktok: { title: 100, body: 2200 },
  twitter: { title: 100, body: 280 },
  linkedin: { title: 150, body: 3000 },
  facebook: { title: 255, body: 63206 },
}
const ALL_TYPES: ContentType[] = ['title', 'description', 'caption', 'hashtags']

/** Shown once per session when the server has no AI provider configured. */
let warnedTemplates = false
function warnTemplates() {
  if (warnedTemplates) return
  warnedTemplates = true
  toast("AI isn't configured on the server — using templates", 'info')
}

const FIELDS: { type: Exclude<ContentType, 'hashtags'>; label: string; icon: ComponentType<{ className?: string }>; multiline: boolean }[] = [
  { type: 'title', label: 'Title', icon: Type, multiline: false },
  { type: 'description', label: 'Description', icon: FileText, multiline: true },
  { type: 'caption', label: 'Caption', icon: MessageSquare, multiline: true },
]

export function contentToMarkdown(p: Project) {
  const byPlatform = PLATFORMS.map((pl) => ({ pl, items: p.content.filter((c) => c.platform === pl.id) })).filter((x) => x.items.length)
  return [
    `# ${p.title} — content package`,
    '',
    '> Generated with the CREOVOX AI content writer. Review before publishing.',
    '',
    ...byPlatform.flatMap(({ pl, items }) => [
      `## ${pl.name}`,
      '',
      ...(['title', 'description', 'caption', 'hashtags'] as ContentType[]).flatMap((t) => {
        const c = items.find((i) => i.type === t)
        return c ? [`### ${t[0].toUpperCase() + t.slice(1)}`, '', c.content, ''] : []
      }),
    ]),
  ].join('\n')
}

function Content({ project }: { project: Project }) {
  const updateProject = useAppStore((s) => s.updateProject)
  const [platform, setPlatform] = useState<Platform>('youtube')
  const existingTone = project.content.find((c) => c.platform === platform)?.tone
  const [tone, setTone] = useState<Tone>(existingTone ?? 'professional')
  const [busy, setBusy] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const ai = useAiStatus()
  /** Where each output (by id) came from in this session. */
  const [source, setSource] = useState<Record<string, 'ai' | 'template'>>({})
  const markSource = (ids: string[], src: 'ai' | 'template') => setSource((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, src])) }))

  const items = project.content.filter((c) => c.platform === platform)
  const get = (t: ContentType) => items.find((c) => c.type === t)
  const limits = PLATFORM_LIMITS[platform]

  const upsert = (outs: ContentOutput[]) =>
    updateProject(project.id, (p) => {
      const rest = p.content.filter((c) => !outs.some((o) => o.platform === c.platform && o.type === c.type))
      return { content: [...rest, ...outs] }
    })

  /** Ask the AI for `types`; falls back to local templates when AI isn't configured. */
  const write = async (types: ContentType[], variant: number): Promise<ContentOutput[] | null> => {
    const previous = types.map((t) => get(t)?.content).filter((c): c is string => !!c)
    try {
      const { items: out } = await aiApi.content({ context: aiContext(project), platform, tone, types, variant, previous })
      const outs = out
        .filter((o) => types.includes(o.type))
        .map((o) => ({ ...o, id: `${platform}-${o.type}`, platform, tone, variant }))
      markSource(outs.map((o) => o.id), 'ai')
      return outs
    } catch (e) {
      if (!isAiUnavailable(e)) {
        toast(e instanceof Error ? e.message : 'Content generation failed', 'error')
        return null
      }
      warnTemplates()
      const outs =
        types.length === ALL_TYPES.length
          ? generateContentSet(project, platform, tone, variant)
          : types.map((type) => ({ id: `${platform}-${type}`, type, platform, tone, variant, content: generateContentField(project, type, platform, tone, variant) }))
      markSource(outs.map((o) => o.id), 'template')
      return outs
    }
  }

  const generateAll = async () => {
    setBusy('all')
    try {
      const v = (get('title')?.variant ?? -1) + 1
      const outs = await write(ALL_TYPES, v)
      if (outs?.length) {
        upsert(outs)
        toast(`${PLATFORMS.find((p) => p.id === platform)?.name} content generated`)
      }
    } finally {
      setBusy(null)
    }
  }

  const regenerate = async (type: ContentType) => {
    setBusy(type)
    try {
      const v = (get(type)?.variant ?? 0) + 1
      const outs = await write([type], v)
      if (outs?.length) upsert(outs)
    } finally {
      setBusy(null)
    }
  }

  const usedTemplates = items.some((c) => source[c.id] === 'template')
  const badgeFor = (id: string) =>
    source[id] === 'ai' ? <AIBadge label="AI" className="!px-2 !py-0.5" /> : source[id] === 'template' ? <SimBadge label="Template" className="!px-2 !py-0.5" /> : null

  const edit = (type: ContentType, content: string) => {
    const cur = get(type)
    upsert([{ id: `${platform}-${type}`, type, platform, tone: cur?.tone ?? tone, variant: cur?.variant ?? 0, content }])
  }

  const copy = (text: string, label: string) => copyWithToast(text, label)

  const tags = (get('hashtags')?.content ?? '').split(/\s+/).filter(Boolean)
  const addTag = () => {
    const t = newTag.trim().replace(/\s+/g, '')
    if (!t) return
    const tag = t.startsWith('#') ? t : `#${t}`
    if (!tags.includes(tag)) edit('hashtags', [...tags, tag].join(' '))
    setNewTag('')
  }

  return (
    <div className="space-y-5">
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2" role="tablist" aria-label="Platform">
          {PLATFORMS.map((p) => {
            const Icon = ICONS[p.id]
            const has = project.content.some((c) => c.platform === p.id)
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={platform === p.id}
                onClick={() => {
                  setPlatform(p.id)
                  const t = project.content.find((c) => c.platform === p.id)?.tone
                  if (t) setTone(t)
                }}
                className={cn('chip', platform === p.id && 'chip-active')}
              >
                <Icon className="h-4 w-4" /> {p.name}
                {has && <span className="h-1.5 w-1.5 rounded-full bg-status-success" aria-label="has content" />}
              </button>
            )
          })}
        </div>
      </div>

      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Tone" className="sm:w-60">
          <select className="select" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
            {TONES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" onClick={generateAll} disabled={!!busy} className="btn-primary">
          {busy === 'all' ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy === 'all' ? 'Writing…' : items.length ? 'Regenerate all' : 'Generate content'}
        </button>
        <div className="flex items-center gap-2 sm:ml-auto">
          {ai?.enabled && !usedTemplates ? <AIBadge label={aiLabel(ai)} /> : ai === undefined ? null : <SimBadge label="Templates" />}
          <button type="button" className="btn-secondary !px-4 !text-sm" disabled={!project.content.length} onClick={() => (downloadText(contentToMarkdown(project), `${slugify(project.title)}-content.md`, 'text/markdown'), toast('Content package downloaded'))}>
            <Download className="h-4 w-4" /> .md
          </button>
        </div>
      </Panel>

      <AnimatePresence mode="wait">
        {busy === 'all' ? (
          <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="glass-panel h-40 animate-pulse p-5">
                <div className="h-3 w-24 rounded bg-white/10" />
                <div className="mt-4 h-3 w-full rounded bg-white/5" />
                <div className="mt-2 h-3 w-4/5 rounded bg-white/5" />
              </div>
            ))}
          </motion.div>
        ) : items.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Panel>
              <EmptyState icon={PenTool} title={`No ${PLATFORMS.find((p) => p.id === platform)?.name} copy yet`} body="Generate a title, description, caption and hashtags built from your transcript keywords and highlights." action={<button className="btn-primary" onClick={generateAll}><Sparkles className="h-4 w-4" /> Generate content</button>} />
            </Panel>
          </motion.div>
        ) : (
          <motion.div key={platform} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 lg:grid-cols-2">
            {FIELDS.map(({ type, label, icon: Icon, multiline }) => {
              const c = get(type)
              const value = c?.content ?? ''
              const limit = type === 'title' ? limits.title : limits.body
              return (
                <Panel key={type} className={cn('p-5', type === 'description' && 'lg:row-span-2')}>
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-brand-primary" />
                    <span className="text-sm font-medium text-text-primary">{label}</span>
                    {c && badgeFor(c.id)}
                    <div className="ml-auto flex">
                      <IconButton label={`Copy ${label}`} onClick={() => copy(value, label)}>
                        <Copy className="h-4 w-4" />
                      </IconButton>
                      <IconButton label={`Regenerate ${label}`} onClick={() => regenerate(type)} disabled={!!busy}>
                        <RefreshCw className={cn('h-4 w-4', busy === type && 'animate-spin')} />
                      </IconButton>
                    </div>
                  </div>
                  {multiline ? (
                    <textarea aria-label={label} value={value} onChange={(e) => edit(type, e.target.value)} className={cn('input resize-y leading-relaxed', type === 'description' ? 'min-h-[260px]' : 'min-h-[120px]')} />
                  ) : (
                    <input aria-label={label} value={value} onChange={(e) => edit(type, e.target.value)} className="input" />
                  )}
                  <p className={cn('mt-2 text-right font-mono text-[11px]', value.length > limit ? 'text-status-error' : 'text-text-muted')}>
                    {value.length.toLocaleString()} / {limit.toLocaleString()}
                  </p>
                </Panel>
              )
            })}

            <Panel className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Hash className="h-4 w-4 text-brand-primary" />
                <span className="text-sm font-medium text-text-primary">Hashtags</span>
                <span className="font-mono text-[11px] text-text-muted">{tags.length}</span>
                {get('hashtags') && badgeFor(`${platform}-hashtags`)}
                <div className="ml-auto flex">
                  <IconButton label="Copy hashtags" onClick={() => copy(tags.join(' '), 'Hashtags')}>
                    <Copy className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Regenerate hashtags" onClick={() => regenerate('hashtags')} disabled={!!busy}>
                    <RefreshCw className={cn('h-4 w-4', busy === 'hashtags' && 'animate-spin')} />
                  </IconButton>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center rounded-full border border-white/[0.07] bg-white/[0.04] py-0.5 pl-3 text-sm text-text-secondary">
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => edit('hashtags', tags.filter((x) => x !== t).join(' '))} className="-my-1 flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:text-status-error">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {tags.length === 0 && <span className="text-sm text-text-muted">No hashtags.</span>}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  addTag()
                }}
              >
                <input className="input" placeholder="Add hashtag…" value={newTag} onChange={(e) => setNewTag(e.target.value)} aria-label="New hashtag" />
                <button type="submit" className="btn-secondary !px-3.5" aria-label="Add hashtag">
                  <Plus className="h-4 w-4" />
                </button>
              </form>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {ai?.enabled && !usedTemplates ? (
        <Notice>
          Copy is written by <strong className="text-brand-highlight">AI ({ai.provider})</strong> from your transcript, highlights and title, following each platform's limits. Review before
          publishing — edit freely, everything saves to the project.
        </Notice>
      ) : ai === undefined ? null : (
        <Notice>
          AI isn't configured on the server, so copy comes from <strong className="text-status-info">local templates</strong> that combine your project title, transcript keywords and
          highlight timestamps. Add a <code>GROQ_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> to the backend for AI-written copy. Edit freely — everything saves to the project.
        </Notice>
      )}
    </div>
  )
}

export default function ContentPage() {
  return (
    <ProjectShell step="content" title="AI Content Writer" subtitle="Platform-ready titles, descriptions, captions and hashtags.">
      {(p) => <Content project={p} />}
    </ProjectShell>
  )
}

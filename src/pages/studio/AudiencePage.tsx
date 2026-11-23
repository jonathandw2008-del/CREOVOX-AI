import { useState } from 'react'
import { GraduationCap, Briefcase, Users, Sparkles, Loader, Copy, Columns3, Rows3, RefreshCw, X, Plus, Download } from 'lucide-react'
import ProjectShell from '@/components/studio/ProjectShell'
import { EmptyState, Field, IconButton, Notice, Panel, Segmented, SimBadge } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import { LANGUAGES, TONES } from '@/data/mockData'
import { generateAudienceVariation } from '@/lib/generators'
import { toast } from '@/store/useToast'
import type { AudienceType, AudienceVariation, Project, Tone } from '@/types'
import { cn, copyToClipboard, downloadText, slugify, sleep } from '@/utils/helpers'

export const AUDIENCES = [
  { type: 'student' as AudienceType, icon: GraduationCap, label: 'Students', desc: 'Simple, structured, encouraging', color: 'text-status-info', tone: 'educational' as Tone },
  { type: 'professional' as AudienceType, icon: Briefcase, label: 'Professionals', desc: 'Strategic, concise, outcome-led', color: 'text-brand-highlight', tone: 'professional' as Tone },
  { type: 'general' as AudienceType, icon: Users, label: 'General', desc: 'Friendly, curious, shareable', color: 'text-status-success', tone: 'casual' as Tone },
]

export function audienceToMarkdown(p: Project) {
  return [
    `# ${p.title} — audience variations`,
    '',
    '> Simulated personalization. Review before publishing.',
    '',
    ...p.audienceVariations.flatMap((v) => [
      `## ${AUDIENCES.find((a) => a.type === v.audienceType)?.label} · ${v.tone} · ${v.language}`,
      '',
      `**Title:** ${v.title}`,
      '',
      v.description,
      '',
      `**Caption:** ${v.caption}`,
      '',
      v.hashtags.join(' '),
      '',
    ]),
  ].join('\n')
}

const copyText = async (t: string, label: string) => {
  const ok = await copyToClipboard(t)
  toast(ok ? `${label} copied` : 'Copy failed', ok ? 'success' : 'error')
}

function FieldBlock({ label, value, multiline, onChange }: { label: string; value: string; multiline?: boolean; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center">
        <span className="text-xs font-medium text-text-muted">{label}</span>
        <span className="ml-2 font-mono text-[10px] text-text-muted">{value.length}</span>
        <IconButton label={`Copy ${label}`} className="ml-auto !h-9 !w-9" onClick={() => copyText(value, label)}>
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {multiline ? (
        <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="input min-h-[96px] resize-y !text-sm leading-relaxed" />
      ) : (
        <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="input !text-sm" />
      )}
    </div>
  )
}

function VariationCard({ v, onChange, onRegenerate, busy }: { v: AudienceVariation; onChange: (u: Partial<AudienceVariation>) => void; onRegenerate: () => void; busy: boolean }) {
  const cfg = AUDIENCES.find((a) => a.type === v.audienceType)!
  const Icon = cfg.icon
  const [tag, setTag] = useState('')
  return (
    <Panel className={cn('space-y-4 p-5 transition-opacity', busy && 'opacity-50')}>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]">
          <Icon className={cn('h-[18px] w-[18px]', cfg.color)} />
        </span>
        <div className="min-w-0">
          <p className="font-heading font-semibold text-text-primary">{cfg.label}</p>
          <p className="text-[11px] capitalize text-text-muted">
            {v.tone} · {v.language}
          </p>
        </div>
        <div className="ml-auto flex">
          <IconButton label="Copy all fields" onClick={() => copyText(`${v.title}\n\n${v.description}\n\n${v.caption}\n\n${v.hashtags.join(' ')}`, `${cfg.label} variation`)}>
            <Copy className="h-4 w-4" />
          </IconButton>
          <IconButton label="Regenerate" onClick={onRegenerate} disabled={busy}>
            {busy ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </IconButton>
        </div>
      </div>
      <FieldBlock label="Title" value={v.title} onChange={(title) => onChange({ title })} />
      <FieldBlock label="Description" value={v.description} multiline onChange={(description) => onChange({ description })} />
      <FieldBlock label="Caption" value={v.caption} multiline onChange={(caption) => onChange({ caption })} />
      <div>
        <p className="mb-1.5 text-xs font-medium text-text-muted">Hashtags</p>
        <div className="flex flex-wrap gap-1.5">
          {v.hashtags.map((h) => (
            <span key={h} className="inline-flex items-center rounded-full bg-white/[0.04] pl-3 text-xs text-text-secondary">
              {h}
              <button type="button" aria-label={`Remove ${h}`} className="-my-1.5 flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:text-status-error" onClick={() => onChange({ hashtags: v.hashtags.filter((x) => x !== h) })}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const t = tag.trim().replace(/\s+/g, '')
            if (t) onChange({ hashtags: [...new Set([...v.hashtags, t.startsWith('#') ? t : `#${t}`])] })
            setTag('')
          }}
        >
          <input className="input !text-sm" placeholder="Add hashtag…" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="New hashtag" />
          <button type="submit" className="btn-secondary !px-3" aria-label="Add hashtag">
            <Plus className="h-4 w-4" />
          </button>
        </form>
      </div>
    </Panel>
  )
}

function Audience({ project }: { project: Project }) {
  const updateProject = useAppStore((s) => s.updateProject)
  const [selected, setSelected] = useState<AudienceType>('student')
  const [language, setLanguage] = useState('English')
  const [tone, setTone] = useState<Tone | 'auto'>('auto')
  const [view, setView] = useState<'compare' | 'single'>('compare')
  const [busy, setBusy] = useState<AudienceType | 'all' | null>(null)

  const vars = project.audienceVariations
  const byType = (t: AudienceType) => vars.find((v) => v.audienceType === t)

  const upsert = (v: AudienceVariation) => updateProject(project.id, (p) => ({ audienceVariations: [...p.audienceVariations.filter((x) => x.audienceType !== v.audienceType), v] }))
  const toneFor = (t: AudienceType) => (tone === 'auto' ? AUDIENCES.find((a) => a.type === t)!.tone : tone)

  const generate = async (t: AudienceType | 'all') => {
    setBusy(t)
    await sleep(t === 'all' ? 1100 : 600)
    const types = t === 'all' ? AUDIENCES.map((a) => a.type) : [t]
    const next = types.map((type) => generateAudienceVariation(project, type, toneFor(type), language, (byType(type)?.variant ?? -1) + 1))
    updateProject(project.id, (p) => ({ audienceVariations: [...p.audienceVariations.filter((x) => !types.includes(x.audienceType)), ...next] }))
    setBusy(null)
    toast(t === 'all' ? '3 audience variations generated' : 'Variation regenerated')
  }

  const ordered = AUDIENCES.map((a) => byType(a.type)).filter(Boolean) as AudienceVariation[]
  const shown = view === 'compare' ? ordered : ordered.filter((v) => v.audienceType === selected)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {AUDIENCES.map(({ type, icon: Icon, label, desc, color }) => (
          <button
            key={type}
            type="button"
            aria-pressed={selected === type}
            onClick={() => {
              setSelected(type)
              setView('single')
            }}
            className={cn('glass-panel card-interactive flex min-h-[72px] flex-col items-center gap-1.5 !rounded-2xl p-3 text-center sm:flex-row sm:gap-3 sm:p-4 sm:text-left', view === 'single' && selected === type && '!border-brand-primary/60 bg-brand-primary/[0.06]')}
          >
            <Icon className={cn('h-6 w-6 flex-shrink-0', color)} />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text-primary">{label}</span>
              <span className="hidden text-xs text-text-muted md:block">{desc}</span>
            </span>
          </button>
        ))}
      </div>

      <Panel className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:max-w-md">
          <Field label="Language">
            <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code}>{l.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tone">
            <select className="select" value={tone} onChange={(e) => setTone(e.target.value as Tone | 'auto')}>
              <option value="auto">Auto (per audience)</option>
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="button" className="btn-primary" disabled={!!busy} onClick={() => generate('all')}>
          {busy === 'all' ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {ordered.length ? 'Regenerate all' : 'Generate variations'}
        </button>
        <div className="flex items-center gap-2 lg:ml-auto">
          <Segmented
            ariaLabel="Layout"
            value={view}
            onChange={setView}
            options={[
              { value: 'compare', label: <span className="sr-only sm:not-sr-only">Compare</span>, icon: Columns3 },
              { value: 'single', label: <span className="sr-only sm:not-sr-only">Focus</span>, icon: Rows3 },
            ]}
          />
          <IconButton label="Download variations (.md)" disabled={!ordered.length} onClick={() => (downloadText(audienceToMarkdown(project), `${slugify(project.title)}-audiences.md`, 'text/markdown'), toast('Downloaded'))}>
            <Download className="h-4 w-4" />
          </IconButton>
        </div>
      </Panel>

      {language !== 'English' && (
        <Notice>
          <strong className="text-status-info">Translation is simulated.</strong> No translation service is connected, so text stays in English and is tagged {language}. Edit the fields to
          localise.
        </Notice>
      )}

      {ordered.length === 0 ? (
        <Panel>
          <EmptyState icon={Users} title="No variations yet" body="Repackage this video for students, professionals and a general audience in one click." action={<button className="btn-primary" onClick={() => generate('all')}><Sparkles className="h-4 w-4" /> Generate variations</button>} />
        </Panel>
      ) : (
        <div className={cn('grid gap-4', view === 'compare' ? 'md:grid-cols-2 xl:grid-cols-3' : 'mx-auto max-w-3xl')}>
          {shown.map((v) => (
            <VariationCard key={v.audienceType} v={v} busy={busy === v.audienceType || busy === 'all'} onChange={(u) => upsert({ ...v, ...u })} onRegenerate={() => generate(v.audienceType)} />
          ))}
          {view === 'single' && shown.length === 0 && (
            <Panel>
              <EmptyState icon={Sparkles} title="Not generated yet" action={<button className="btn-primary" onClick={() => generate(selected)}>Generate for this audience</button>} />
            </Panel>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-text-muted">
        <SimBadge /> Variations come from local templates seeded with your transcript keywords.
      </div>
    </div>
  )
}

export default function AudiencePage() {
  return (
    <ProjectShell step="audience" title="Audience Personalization" subtitle="One video, repackaged for every viewer.">
      {(p) => <Audience project={p} />}
    </ProjectShell>
  )
}

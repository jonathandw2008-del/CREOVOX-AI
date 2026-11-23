/**
 * SIMULATED AI.
 * These functions build plausible output from local templates and the project's own
 * data (title, transcript keywords, highlight timings, real audio energy when available).
 * No model is called and no data leaves the browser. The UI labels all of it as simulated.
 */
import type {
  AudienceType,
  AudienceVariation,
  ContentOutput,
  ContentType,
  Highlight,
  HighlightCategory,
  Platform,
  Project,
  ThumbnailDesign,
  Tone,
  TranscriptSegment,
} from '@/types'
import { DEMO_TRANSCRIPT } from '@/data/mockData'
import { formatDuration, generateId } from '@/utils/helpers'

/* ---------------------------- utilities ---------------------------- */

function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const pick = <T,>(arr: T[], i: number) => arr[((i % arr.length) + arr.length) % arr.length]

const STOP = new Set(
  'the a an and or but of to in on for with is are was were be been it this that these those we you they i our your their at by from as about into how what why can will just not now so if then than there here have has had do does did get got more most very really every right also up out over new one two five'.split(
    ' '
  )
)

/** Real (if simple) keyword extraction: word frequency over the transcript. */
export function extractKeywords(transcript: TranscriptSegment[], n = 6): string[] {
  const counts = new Map<string, number>()
  for (const seg of transcript) {
    for (const raw of seg.text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
      if (STOP.has(raw)) continue
      counts.set(raw, (counts.get(raw) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([w]) => w)
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const toTag = (s: string) => '#' + titleCase(s).replace(/[^a-zA-Z0-9]/g, '')

/* --------------------------- transcription -------------------------- */

const EXTRA_LINES = [
  "Let's take a closer look at what that means in practice.",
  'Here is the part most people overlook.',
  'This is where things get really interesting.',
  'Keep that in mind, because it comes back later.',
  'Now, let me walk you through a real example.',
  "If you remember one thing from this video, make it this.",
  'The results speak for themselves.',
  "Let's move on to the next idea.",
]

/** Simulated transcript spread across the real duration of the uploaded video. */
export function simulateTranscript(duration: number): TranscriptSegment[] {
  if (duration <= 0) return []
  const pool = [...DEMO_TRANSCRIPT.map((t) => t.text), ...EXTRA_LINES]
  const count = Math.max(1, Math.min(Math.ceil(duration / 4.6), 120))
  const interval = duration / count
  const segLen = Math.min(4.4, interval * 0.95)
  return Array.from({ length: count }, (_, i) => {
    const start = Math.round(i * interval * 10) / 10
    return {
      id: `t${i + 1}`,
      startTime: start,
      endTime: Math.min(duration, Math.round((start + segLen) * 10) / 10),
      text: pool[i % pool.length],
      speaker: 'Speaker 1',
    }
  })
}

/* ---------------------------- highlights ---------------------------- */

const HIGHLIGHT_TITLES = [
  'Opening hook',
  'Core idea explained',
  'Key takeaway',
  'Quotable moment',
  'Practical example',
  'Topic shift',
  'Strong close',
  'Audience question',
]
const CATS: HighlightCategory[] = ['key-moment', 'topic-change', 'quote', 'engagement-peak']

function energyBetween(waveform: number[] | undefined, start: number, end: number, duration: number) {
  if (!waveform?.length || duration <= 0) return null
  const a = Math.floor((start / duration) * waveform.length)
  const b = Math.max(a + 1, Math.ceil((end / duration) * waveform.length))
  const slice = waveform.slice(a, b)
  return slice.reduce((s, x) => s + x, 0) / slice.length
}

/**
 * Highlight candidates: windows aligned to transcript segments.
 * When the waveform came from real audio, confidence is weighted by actual loudness.
 */
export function simulateHighlights(
  transcript: TranscriptSegment[],
  duration: number,
  waveform?: number[],
  seed = 'creovox'
): Highlight[] {
  if (!transcript.length) return []
  const rand = seeded(seed)
  const target = Math.max(3, Math.min(8, Math.round(duration / 12)))
  const per = Math.max(1, Math.floor(transcript.length / target))
  const out: Highlight[] = []
  for (let i = 0; i < target; i++) {
    const first = transcript[i * per]
    const last = transcript[Math.min(transcript.length - 1, i * per + Math.max(0, Math.min(per, 3) - 1))]
    if (!first || !last) break
    const energy = energyBetween(waveform, first.startTime, last.endTime, duration)
    const base = 0.78 + rand() * 0.14
    const confidence = Math.min(0.99, energy !== null ? 0.55 * base + 0.45 * (0.6 + energy * 0.4) : base)
    out.push({
      id: `h${i + 1}-${generateId().slice(0, 4)}`,
      startTime: first.startTime,
      endTime: last.endTime,
      title: pick(HIGHLIGHT_TITLES, i),
      description: first.text.length > 110 ? first.text.slice(0, 107) + '…' : first.text,
      confidence: Math.round(confidence * 100) / 100,
      selected: false,
      category: pick(CATS, i),
    })
  }
  // Pre-select the strongest half.
  const sorted = [...out].sort((a, b) => b.confidence - a.confidence)
  const keep = new Set(sorted.slice(0, Math.ceil(out.length / 2)).map((h) => h.id))
  return out.map((h) => ({ ...h, selected: keep.has(h.id) }))
}

/* ---------------------------- thumbnails ---------------------------- */

export function defaultThumbnails(title: string): ThumbnailDesign[] {
  const short = title.length > 34 ? title.slice(0, 32).trim() + '…' : title
  return [
    { id: generateId(), title: 'Bold Impact', textOverlay: short, fontSize: 44, fontFamily: 'Space Grotesk', textColor: '#FFFFFF', textPosition: { x: 50, y: 50 }, backgroundColor: '#1a1a2e', style: 'bold', overlay: 0.45 },
    { id: generateId(), title: 'Minimal Clean', textOverlay: short, fontSize: 34, fontFamily: 'Inter', textColor: '#F5F2EE', textPosition: { x: 25, y: 75 }, backgroundColor: '#0f0f1a', style: 'minimal', overlay: 0.35 },
    { id: generateId(), title: 'Cinematic Warm', textOverlay: short, fontSize: 48, fontFamily: 'Space Grotesk', textColor: '#FFA45E', textPosition: { x: 50, y: 50 }, backgroundColor: '#11151B', style: 'cinematic', overlay: 0.3 },
    { id: generateId(), title: 'Editorial Focus', textOverlay: short, fontSize: 40, fontFamily: 'Instrument Serif', textColor: '#F5F2EE', textPosition: { x: 25, y: 50 }, backgroundColor: '#090B0F', style: 'editorial', overlay: 0.5 },
  ]
}

/* -------------------------- content writer -------------------------- */

interface Ctx {
  title: string
  keywords: string[]
  highlights: Highlight[]
  duration: number
}

function ctxFor(p: Project): Ctx {
  const kw = extractKeywords(p.transcript)
  return {
    title: p.title,
    keywords: kw.length ? kw : ['creativity', 'video', 'ideas'],
    highlights: [...p.highlights].sort((a, b) => a.startTime - b.startTime),
    duration: p.duration,
  }
}

const TONE_OPENERS: Record<Tone, string[]> = {
  professional: ['A concise breakdown of', 'An in-depth look at', 'Key insights on'],
  casual: ['Okay, let’s talk about', 'Real talk about', 'Here’s the deal with'],
  educational: ['Learn the essentials of', 'A step-by-step guide to', 'Understanding'],
  entertaining: ['You won’t believe', 'The wildest truth about', 'Nobody tells you this about'],
  inspirational: ['Unlock the potential of', 'Reimagine what’s possible with', 'The future belongs to'],
}

const TONE_EMOJI: Record<Tone, string> = {
  professional: '',
  casual: ' ✨',
  educational: ' 📚',
  entertaining: ' 🤯',
  inspirational: ' 🚀',
}

function genTitle(c: Ctx, platform: Platform, tone: Tone, v: number) {
  const k = titleCase(c.keywords[v % c.keywords.length])
  const opener = pick(TONE_OPENERS[tone], v)
  const forms = [
    `${c.title}`,
    `${opener} ${k} — ${c.title}`,
    `${c.highlights.length || 5} Things to Know About ${k}`,
    `${c.title}: ${pick(['The Complete Breakdown', 'What Actually Matters', 'Explained in Minutes'], v)}`,
  ]
  let t = pick(forms, v + 1 + (platform === 'youtube' ? 1 : 0))
  if (platform === 'twitter') t = t.slice(0, 90)
  return t + (platform === 'tiktok' || platform === 'instagram' ? TONE_EMOJI[tone] : '')
}

function chapters(c: Ctx) {
  if (!c.highlights.length) return ''
  return c.highlights.map((h) => `${formatDuration(h.startTime)} — ${h.title}`).join('\n')
}

function genDescription(c: Ctx, platform: Platform, tone: Tone, v: number) {
  const k = c.keywords.slice(0, 3).join(', ')
  const intro = pick(
    [
      `${pick(TONE_OPENERS[tone], v)} ${c.title.toLowerCase()}. We cover ${k} and more.`,
      `In this video we unpack ${k} — and why it matters right now.`,
      `Everything you need to know about ${c.keywords[0]}, in ${formatDuration(c.duration)}.`,
    ],
    v
  )
  if (platform === 'youtube') {
    const ch = chapters(c)
    return `${intro}\n\n${ch ? `📌 Chapters:\n${ch}\n\n` : ''}${c.keywords.slice(0, 3).map(toTag).join(' ')}`
  }
  if (platform === 'linkedin')
    return `${intro}\n\nKey points:\n${c.highlights
      .slice(0, 4)
      .map((h) => `→ ${h.title}`)
      .join('\n')}\n\nWhat’s your take? I’d love to hear how your team approaches this.`
  if (platform === 'twitter') return intro.slice(0, 260)
  return intro
}

function genCaption(c: Ctx, platform: Platform, tone: Tone, v: number) {
  const k = c.keywords[v % c.keywords.length]
  const hook = pick(
    [
      `Stop scrolling — this changes how you think about ${k}.`,
      `${titleCase(k)}, explained in under a minute.`,
      `The one thing about ${k} nobody talks about.`,
    ],
    v
  )
  const cta: Record<Platform, string> = {
    youtube: 'Watch the full breakdown and subscribe for more.',
    instagram: 'Save this for later and share it with a friend 👇',
    tiktok: 'Follow for part 2 👀',
    twitter: 'Full video ↓',
    linkedin: 'Thoughts? Let’s discuss in the comments.',
    facebook: 'Tap share if this helped!',
  }
  return `${hook}${TONE_EMOJI[tone]}\n\n${cta[platform]}`.slice(0, platform === 'twitter' ? 280 : 2200)
}

function genHashtags(c: Ctx, platform: Platform, v: number) {
  const base = c.keywords.map(toTag)
  const extra: Record<Platform, string[]> = {
    youtube: ['#YouTubeCreator', '#VideoEssay'],
    instagram: ['#Reels', '#CreatorTips', '#ContentCreator'],
    tiktok: ['#FYP', '#LearnOnTikTok', '#CreatorTok'],
    twitter: ['#Thread'],
    linkedin: ['#Leadership', '#Innovation'],
    facebook: ['#Video'],
  }
  const all = [...base.slice(v % 2), ...extra[platform]]
  const limit = platform === 'twitter' ? 3 : platform === 'linkedin' ? 5 : 10
  return [...new Set(all)].slice(0, limit).join(' ')
}

export function generateContentField(p: Project, type: ContentType, platform: Platform, tone: Tone, variant: number): string {
  const c = ctxFor(p)
  switch (type) {
    case 'title':
      return genTitle(c, platform, tone, variant)
    case 'description':
      return genDescription(c, platform, tone, variant)
    case 'caption':
      return genCaption(c, platform, tone, variant)
    case 'hashtags':
      return genHashtags(c, platform, variant)
  }
}

export function generateContentSet(p: Project, platform: Platform, tone: Tone, variant = 0): ContentOutput[] {
  return (['title', 'description', 'caption', 'hashtags'] as ContentType[]).map((type) => ({
    id: `${platform}-${type}`,
    type,
    platform,
    tone,
    variant,
    content: generateContentField(p, type, platform, tone, variant),
  }))
}

/* ------------------------------ audience ----------------------------- */

const AUDIENCE_FRAMES: Record<AudienceType, { lead: string[]; tags: string[]; caption: string[] }> = {
  student: {
    lead: ['A beginner-friendly guide to', 'Study notes:', 'Learn the basics of'],
    tags: ['#StudentLife', '#LearnSomethingNew', '#StudyTips'],
    caption: ['Perfect for your next study session 📚', 'Bookmark this before your exam!', 'Explained simply — no jargon.'],
  },
  professional: {
    lead: ['A strategic briefing on', 'Executive summary:', 'Industry analysis:'],
    tags: ['#Strategy', '#Leadership', '#ProfessionalDevelopment'],
    caption: ['Key implications for teams and decision makers.', 'Actionable insights you can apply this quarter.', 'A concise briefing for busy professionals.'],
  },
  general: {
    lead: ['The easy guide to', 'Everything you need to know about', 'Here’s why everyone is talking about'],
    tags: ['#DidYouKnow', '#Trending', '#MustWatch'],
    caption: ['Share this with someone who needs it 🙌', 'This one surprised us too!', 'Quick, simple and genuinely useful.'],
  },
}

export function generateAudienceVariation(p: Project, audience: AudienceType, tone: Tone, language: string, variant = 0): AudienceVariation {
  const c = ctxFor(p)
  const f = AUDIENCE_FRAMES[audience]
  const k = c.keywords.slice(0, 3)
  const lead = pick(f.lead, variant)
  const desc: Record<AudienceType, string> = {
    student: `${lead} ${c.title.toLowerCase()}. We break down ${k.join(', ')} step by step, with clear examples and a quick recap at the end.`,
    professional: `${lead} ${c.title}. This session examines ${k.join(', ')} and what they mean for strategy, workflows and measurable outcomes.`,
    general: `${lead} ${c.keywords[0]}. In just ${formatDuration(c.duration)} you’ll see why ${k.slice(1).join(' and ') || 'it'} matter${k.length > 2 ? '' : 's'} — no background needed.`,
  }
  return {
    id: `aud-${audience}`,
    audienceType: audience,
    language,
    tone,
    variant,
    title: `${lead} ${titleCase(c.keywords[variant % c.keywords.length])}${audience === 'professional' ? ` — ${c.title}` : ''}`,
    description: desc[audience],
    caption: `${pick(f.caption, variant)}${TONE_EMOJI[tone]}`,
    hashtags: [...new Set([...k.map(toTag), ...f.tags])].slice(0, 6),
  }
}

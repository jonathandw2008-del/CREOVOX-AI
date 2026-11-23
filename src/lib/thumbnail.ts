import type { ThumbnailDesign } from '@/types'

export const THUMB_W = 1280
export const THUMB_H = 720

const imageCache = new Map<string, HTMLImageElement>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached?.complete) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      imageCache.set(src, img)
      resolve(img)
    }
    img.onerror = reject
    img.src = src
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const test = line ? `${line} ${w}` : w
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line)
        line = w
      } else line = test
    }
    out.push(line)
  }
  return out
}

/** Draws a thumbnail design at 1280×720 onto the given context. */
export function drawThumbnail(ctx: CanvasRenderingContext2D, d: ThumbnailDesign, bg?: HTMLImageElement | null) {
  const W = THUMB_W
  const H = THUMB_H
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = d.backgroundColor
  ctx.fillRect(0, 0, W, H)

  if (bg) {
    const scale = Math.max(W / bg.width, H / bg.height)
    const w = bg.width * scale
    const h = bg.height * scale
    ctx.drawImage(bg, (W - w) / 2, (H - h) / 2, w, h)
    ctx.fillStyle = `rgba(9,11,15,${d.overlay})`
    ctx.fillRect(0, 0, W, H)
  } else {
    // Ember ambient light so empty designs never look flat.
    const g = ctx.createRadialGradient(W * 0.78, H * 0.2, 10, W * 0.78, H * 0.2, W * 0.7)
    g.addColorStop(0, 'rgba(255,91,22,0.35)')
    g.addColorStop(1, 'rgba(255,91,22,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  // Style-specific decoration
  if (d.style === 'cinematic') {
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.65)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, 64)
    ctx.fillRect(0, H - 64, W, 64)
  }
  if (d.style === 'bold') {
    ctx.fillStyle = '#FF5B16'
    ctx.fillRect(0, H - 18, W, 18)
  }

  const size = d.fontSize * 2
  const weight = d.style === 'minimal' ? 500 : 700
  const italic = d.style === 'editorial' ? 'italic ' : ''
  const family = d.style === 'editorial' && d.fontFamily !== 'Instrument Serif' ? `"Instrument Serif", "${d.fontFamily}"` : `"${d.fontFamily}"`
  ctx.font = `${italic}${weight} ${size}px ${family}, Inter, sans-serif`
  ctx.textBaseline = 'middle'
  const align: CanvasTextAlign = d.textPosition.x < 40 ? 'left' : d.textPosition.x > 60 ? 'right' : 'center'
  ctx.textAlign = align

  const text = d.style === 'bold' ? d.textOverlay.toUpperCase() : d.textOverlay
  const maxWidth = W * 0.84
  const lines = wrap(ctx, text, maxWidth)
  const lh = size * 1.12
  const cx = align === 'left' ? W * 0.08 : align === 'right' ? W * 0.92 : (d.textPosition.x / 100) * W
  const cy = (d.textPosition.y / 100) * H
  const startY = cy - ((lines.length - 1) * lh) / 2

  if (d.style === 'editorial') {
    ctx.fillStyle = '#FF5B16'
    const ruleX = align === 'center' ? cx - 60 : align === 'left' ? cx : cx - 120
    ctx.fillRect(ruleX, startY - lh * 0.95, 120, 4)
  }

  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 4
  lines.forEach((line, i) => {
    const y = startY + i * lh
    if (d.style === 'bold') {
      ctx.lineWidth = Math.max(4, size * 0.08)
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.lineJoin = 'round'
      ctx.strokeText(line, cx, y)
    }
    ctx.fillStyle = d.textColor
    ctx.fillText(line, cx, y)
  })
  ctx.restore()
}

export async function renderThumbnailBlob(d: ThumbnailDesign): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready
  const c = document.createElement('canvas')
  c.width = THUMB_W
  c.height = THUMB_H
  const ctx = c.getContext('2d')!
  const img = d.backgroundImage ? await loadImage(d.backgroundImage).catch(() => null) : null
  drawThumbnail(ctx, d, img)
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'))
}

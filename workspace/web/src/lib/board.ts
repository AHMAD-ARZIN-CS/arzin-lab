// Whiteboard engine: data model, rendering, hit-testing, lasso capture, Excalidraw import.
// Boards are JSON files (boards/<name>.board.json) in your code folder.
import { getStroke } from 'perfect-freehand'

export type Pt = [number, number, number] // x, y, pressure
export interface StrokeItem { id: string; kind: 'pen' | 'highlighter'; color: string; size: number; points: Pt[] }
export interface ImageItem { id: string; kind: 'image'; src: string; x: number; y: number; w: number; h: number }
export interface TextItem { id: string; kind: 'text'; x: number; y: number; text: string; color: string; size: number }
export type Item = StrokeItem | ImageItem | TextItem
export type Paper = 'dots' | 'grid' | 'lines' | 'plain'
export interface View { x: number; y: number; zoom: number } // screen = (world - view.xy) * zoom
export interface BoardDoc { version: 1; paper: Paper; items: Item[]; view?: View }

export const newId = () => Math.random().toString(36).slice(2, 10)
export const emptyBoard = (): BoardDoc => ({ version: 1, paper: 'dots', items: [] })

/** "ink" is the default pen color: dark on light paper, light on dark paper. */
export const INK = 'ink'
export const PEN_COLORS = [INK, '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c']
export const HIGHLIGHT_COLORS = ['#facc15', '#4ade80', '#60a5fa', '#f472b6']
export const SIZES = { pen: [2, 3.5, 6], highlighter: [14, 22, 32] }

export interface Palette { paper: string; dot: string; ink: string; selection: string }
export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: { paper: '#fdfdfc', dot: '#cfd4dd', ink: '#1c2230', selection: '#2f6bff' },
  dark: { paper: '#14171e', dot: '#2b3140', ink: '#e7ebf3', selection: '#7aa7ff' },
}
const colorOf = (c: string, pal: Palette) => (c === INK ? pal.ink : c)

// ---------- strokes → smooth outlines (perfect-freehand) ----------

// Cache outlines, keyed by stroke AND its point count: a stroke being drawn keeps growing,
// so a cached outline from fewer points must be recomputed (otherwise you only see the first dot).
const pathCache = new WeakMap<StrokeItem, { n: number; path: Path2D }>()

function strokePath(s: StrokeItem): Path2D {
  const hit = pathCache.get(s)
  if (hit && hit.n === s.points.length) return hit.path
  let p: Path2D
  const hasPressure = s.points.some((pt) => pt[2] !== 0.5)
  const outline = getStroke(s.points, {
    size: s.size * (s.kind === 'highlighter' ? 1 : 2.2),
    thinning: s.kind === 'highlighter' ? 0 : 0.55,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure: !hasPressure && s.kind === 'pen',
    start: { taper: s.kind === 'pen' && s.points.length > 3 ? 2 : 0, cap: true },
    end: { taper: 0, cap: true },
  })
  p = new Path2D()
  if (outline.length) {
    p.moveTo(outline[0][0], outline[0][1])
    for (let i = 1; i < outline.length - 1; i++) {
      const [x0, y0] = outline[i], [x1, y1] = outline[i + 1]
      p.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2) // smooth between outline points
    }
    p.closePath()
  }
  pathCache.set(s, { n: s.points.length, path: p })
  return p
}

const imageCache = new Map<string, HTMLImageElement>()
export function loadImage(src: string, onLoad: () => void): HTMLImageElement {
  let img = imageCache.get(src)
  if (!img) {
    img = new Image()
    img.onload = onLoad
    img.src = src
    imageCache.set(src, img)
  }
  return img
}

// ---------- drawing ----------

export function drawPaper(ctx: CanvasRenderingContext2D, w: number, h: number, view: View, paper: Paper, pal: Palette) {
  ctx.fillStyle = pal.paper
  ctx.fillRect(0, 0, w, h)
  if (paper === 'plain') return
  const step = 28 * view.zoom
  if (step < 6) return
  const ox = (-view.x * view.zoom) % step, oy = (-view.y * view.zoom) % step
  ctx.fillStyle = pal.dot
  ctx.strokeStyle = pal.dot
  ctx.lineWidth = 1
  if (paper === 'dots') {
    const r = Math.max(0.8, 1.1 * Math.min(view.zoom, 1.5))
    for (let x = ox; x < w; x += step) for (let y = oy; y < h; y += step) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill() }
  } else {
    ctx.beginPath()
    if (paper === 'grid') for (let x = ox; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
    for (let y = oy; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
    ctx.stroke()
  }
}

export function drawItem(ctx: CanvasRenderingContext2D, it: Item, pal: Palette, redraw: () => void) {
  if (it.kind === 'pen' || it.kind === 'highlighter') {
    ctx.save()
    ctx.fillStyle = colorOf(it.color, pal)
    if (it.kind === 'highlighter') ctx.globalAlpha = 0.38
    ctx.fill(strokePath(it))
    ctx.restore()
  } else if (it.kind === 'image') {
    const img = loadImage(it.src, redraw)
    if (img.complete && img.naturalWidth) ctx.drawImage(img, it.x, it.y, it.w, it.h)
    else { ctx.strokeStyle = pal.dot; ctx.strokeRect(it.x, it.y, it.w, it.h) }
  } else if (it.kind === 'text') {
    ctx.fillStyle = colorOf(it.color, pal)
    ctx.font = `${it.size}px ui-sans-serif, system-ui, sans-serif`
    ctx.textBaseline = 'top'
    it.text.split('\n').forEach((line, i) => ctx.fillText(line, it.x, it.y + i * it.size * 1.3))
  }
}

/** Draw highlighters first so ink stays crisp on top of them, like a real highlighter under the pen. */
export function drawItems(ctx: CanvasRenderingContext2D, items: Item[], pal: Palette, redraw: () => void) {
  for (const it of items) if (it.kind === 'image') drawItem(ctx, it, pal, redraw)
  for (const it of items) if (it.kind === 'highlighter') drawItem(ctx, it, pal, redraw)
  for (const it of items) if (it.kind === 'pen' || it.kind === 'text') drawItem(ctx, it, pal, redraw)
}

// ---------- geometry ----------

export interface Box { x: number; y: number; w: number; h: number }

export function bounds(it: Item): Box {
  if (it.kind === 'image') return { x: it.x, y: it.y, w: it.w, h: it.h }
  if (it.kind === 'text') {
    const lines = it.text.split('\n')
    return { x: it.x, y: it.y, w: Math.max(...lines.map((l) => l.length)) * it.size * 0.55, h: lines.length * it.size * 1.3 }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of it.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const pad = it.size
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 }
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function pointInPolygon(x: number, y: number, poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Items the lasso caught: strokes with most of their points inside, other items by their center. */
export function lassoSelect(items: Item[], poly: [number, number][]): Set<string> {
  const out = new Set<string>()
  for (const it of items) {
    if (it.kind === 'pen' || it.kind === 'highlighter') {
      const inside = it.points.filter(([x, y]) => pointInPolygon(x, y, poly)).length
      if (inside / it.points.length >= 0.5) out.add(it.id)
    } else {
      const b = bounds(it)
      if (pointInPolygon(b.x + b.w / 2, b.y + b.h / 2, poly)) out.add(it.id)
    }
  }
  return out
}

/** Eraser: strokes passing within `r` of (x, y). */
export function hitStrokes(items: Item[], x: number, y: number, r: number): string[] {
  return items.filter((it) => {
    if (it.kind === 'pen' || it.kind === 'highlighter') {
      const rr = r + it.size
      return it.points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < rr * rr)
    }
    const b = bounds(it)
    return it.kind === 'text' && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
  }).map((it) => it.id)
}

export function translateItem(it: Item, dx: number, dy: number): Item {
  if (it.kind === 'image') return { ...it, x: it.x + dx, y: it.y + dy }
  if (it.kind === 'text') return { ...it, x: it.x + dx, y: it.y + dy }
  return { ...it, points: it.points.map(([x, y, p]) => [x + dx, y + dy, p] as Pt) }
}

// ---------- "circle a problem": capture exactly what's inside the lasso as a PNG ----------

/** Renders everything visible inside the lasso (ink, highlights, pasted images) on white paper
 *  with dark ink — the clearest version for the AI to read — and masks out the rest. */
export function captureRegion(items: Item[], poly: [number, number][]): { dataUrl: string; base64: string } | null {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
  const pad = 12
  const box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 }
  if (box.w < 8 || box.h < 8) return null
  const scale = Math.min(2, 1600 / Math.max(box.w, box.h)) // keep it sharp but under ~1600px
  const c = document.createElement('canvas')
  c.width = Math.ceil(box.w * scale)
  c.height = Math.ceil(box.h * scale)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale)
  ctx.save()
  ctx.beginPath()
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.clip()
  drawItems(ctx, items, { ...PALETTES.light, paper: '#ffffff', ink: '#111111' }, () => {})
  ctx.restore()
  const dataUrl = c.toDataURL('image/png')
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }
}

// ---------- import old Excalidraw whiteboards ----------

interface ExElement {
  type: string; isDeleted?: boolean; x: number; y: number; width?: number; height?: number
  points?: [number, number][]; pressures?: number[]; strokeColor?: string; strokeWidth?: number
  text?: string; fontSize?: number; fileId?: string
}

/** Near-black or near-white colors become "ink" so old drawings adapt to light/dark mode. */
function mapColor(c = '#1e1e1e'): string {
  const m = c.match(/^#([0-9a-f]{6})$/i)
  if (!m) return INK
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255
  const lum = (r * 299 + g * 587 + b * 114) / 1000
  const sat = Math.max(r, g, b) - Math.min(r, g, b)
  return sat < 40 && (lum < 90 || lum > 200) ? INK : c
}

export function fromExcalidraw(json: string): BoardDoc {
  const data = JSON.parse(json) as { elements?: ExElement[]; files?: Record<string, { dataURL: string }> }
  const items: Item[] = []
  for (const el of data.elements ?? []) {
    if (el.isDeleted) continue
    const color = mapColor(el.strokeColor)
    const size = Math.max(1.5, (el.strokeWidth ?? 1) * 1.6)
    if ((el.type === 'freedraw' || el.type === 'line' || el.type === 'arrow') && el.points?.length) {
      items.push({
        id: newId(), kind: 'pen', color, size,
        points: el.points.map(([px, py], i) => [el.x + px, el.y + py, el.pressures?.[i] ?? 0.5] as Pt),
      })
    } else if ((el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse') && el.width && el.height) {
      const { x, y, width: w, height: h } = el as Required<ExElement>
      const pts: Pt[] = el.type === 'ellipse'
        ? Array.from({ length: 49 }, (_, i) => [x + w / 2 + (w / 2) * Math.cos((i / 48) * 2 * Math.PI), y + h / 2 + (h / 2) * Math.sin((i / 48) * 2 * Math.PI), 0.5] as Pt)
        : el.type === 'diamond'
          ? [[x + w / 2, y, 0.5], [x + w, y + h / 2, 0.5], [x + w / 2, y + h, 0.5], [x, y + h / 2, 0.5], [x + w / 2, y, 0.5]]
          : [[x, y, 0.5], [x + w, y, 0.5], [x + w, y + h, 0.5], [x, y + h, 0.5], [x, y, 0.5]]
      items.push({ id: newId(), kind: 'pen', color, size, points: pts })
    } else if (el.type === 'text' && el.text) {
      items.push({ id: newId(), kind: 'text', x: el.x, y: el.y, text: el.text, color, size: el.fontSize ?? 20 })
    } else if (el.type === 'image' && el.fileId && data.files?.[el.fileId]) {
      items.push({ id: newId(), kind: 'image', src: data.files[el.fileId].dataURL, x: el.x, y: el.y, w: el.width ?? 200, h: el.height ?? 200 })
    }
  }
  return { version: 1, paper: 'dots', items }
}

export function parseBoard(json: string): BoardDoc {
  const d = JSON.parse(json)
  if (d && d.version === 1 && Array.isArray(d.items)) return { paper: 'dots', ...d }
  if (d && d.type === 'excalidraw') return fromExcalidraw(json)
  throw new Error('Not a board file')
}

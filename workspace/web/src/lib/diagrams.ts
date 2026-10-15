// Diagrams in AI answers, rendered as real graphics:
//   ```plot     JSON spec → function graphs drawn by our own SVG plotter (formulas parsed by mathjs,
//               never eval'd, with mathjs' dangerous functions disabled)
//   ```mermaid  flowcharts, trees, call stacks, state machines (Mermaid, strict security)
// Both produce plain SVG, which can be put on a board as a picture.
import DOMPurify from 'dompurify'
import { prettyMath } from './math'
import { resolvedTheme } from './theme'

// ---------------- plot ----------------

export interface PlotSpec {
  title?: string
  x?: [number, number]
  y?: [number, number]
  functions?: { fn: string; label?: string; color?: string; dashed?: boolean }[]
  points?: { x: number; y: number; label?: string; color?: string }[]
  vlines?: { x: number; label?: string }[]
  areas?: { fn: string; from: number; to: number; color?: string; label?: string }[]
  xlabel?: string
  ylabel?: string
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4']
let mathPromise: Promise<(src: string) => (x: number) => number> | null = null

/** Safe formula compiler: mathjs, with functions that could reach outside plain math disabled. */
function compiler() {
  mathPromise ??= import('mathjs').then(({ create, all }) => {
    const math = create(all)
    const compile = math.compile
    const off = (n: string) => () => { throw new Error(`${n} is disabled`) }
    math.import({ import: off('import'), createUnit: off('createUnit'), evaluate: off('evaluate'), parse: off('parse'), simplify: off('simplify'), derivative: off('derivative') }, { override: true })
    return (src: string) => {
      const code = compile(src.replace(/\*\*/g, '^'))
      const scope = { x: 0 }
      return (x: number) => { scope.x = x; const r = code.evaluate(scope); return typeof r === 'number' ? r : Number(r) }
    }
  })
  return mathPromise
}

const nice = (v: number) => {
  const a = Math.abs(v)
  return a >= 1000 || (a < 0.01 && a > 0) ? v.toExponential(1) : String(Math.round(v * 100) / 100)
}

function ticks(lo: number, hi: number, count = 6) {
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step)
  return out
}

export async function renderPlot(spec: PlotSpec): Promise<string> {
  const compile = await compiler()
  const W = 560, H = 360, L = 48, R = 16, T = spec.title ? 34 : 14, B = 40
  const [x0, x1] = spec.x ?? [-10, 10]
  const fns = (spec.functions ?? []).map((f, i) => ({ ...f, color: f.color ?? COLORS[i % COLORS.length], f: compile(f.fn) }))
  const N = 400
  const samples = fns.map((f) => Array.from({ length: N + 1 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / N
    let y: number
    try { y = f.f(x) } catch { y = NaN }
    return [x, Number.isFinite(y) ? y : NaN] as [number, number]
  }))
  let [y0, y1] = spec.y ?? (() => {
    const ys = samples.flat().map((p) => p[1]).filter(Number.isFinite).concat((spec.points ?? []).map((p) => p.y))
    if (!ys.length) return [-10, 10]
    ys.sort((a, b) => a - b)
    const lo = ys[Math.floor(ys.length * 0.02)], hi = ys[Math.ceil(ys.length * 0.98) - 1] // ignore asymptote spikes
    const pad = (hi - lo || 2) * 0.12
    return [lo - pad, hi + pad]
  })()
  if (y0 === y1) { y0 -= 1; y1 += 1 }
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R)
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B)
  const parts: string[] = []
  // grid + axes
  for (const t of ticks(x0, x1)) parts.push(`<line x1="${sx(t)}" y1="${T}" x2="${sx(t)}" y2="${H - B}" stroke="currentColor" stroke-opacity="0.1"/><text x="${sx(t)}" y="${H - B + 16}" font-size="11" text-anchor="middle" fill="currentColor" fill-opacity="0.7">${nice(t)}</text>`)
  for (const t of ticks(y0, y1, 5)) parts.push(`<line x1="${L}" y1="${sy(t)}" x2="${W - R}" y2="${sy(t)}" stroke="currentColor" stroke-opacity="0.1"/><text x="${L - 6}" y="${sy(t) + 4}" font-size="11" text-anchor="end" fill="currentColor" fill-opacity="0.7">${nice(t)}</text>`)
  if (y0 < 0 && y1 > 0) parts.push(`<line x1="${L}" y1="${sy(0)}" x2="${W - R}" y2="${sy(0)}" stroke="currentColor" stroke-opacity="0.55"/>`)
  if (x0 < 0 && x1 > 0) parts.push(`<line x1="${sx(0)}" y1="${T}" x2="${sx(0)}" y2="${H - B}" stroke="currentColor" stroke-opacity="0.55"/>`)
  // shaded areas (e.g. integrals)
  for (const a of spec.areas ?? []) {
    const f = compile(a.fn)
    const pts: string[] = [`${sx(a.from)},${sy(Math.max(y0, Math.min(y1, 0)))}`]
    for (let i = 0; i <= 120; i++) {
      const x = a.from + ((a.to - a.from) * i) / 120
      let y = 0
      try { y = f(x) } catch { /* skip */ }
      pts.push(`${sx(x)},${sy(Math.max(y0, Math.min(y1, Number.isFinite(y) ? y : 0)))}`)
    }
    pts.push(`${sx(a.to)},${sy(Math.max(y0, Math.min(y1, 0)))}`)
    parts.push(`<polygon points="${pts.join(' ')}" fill="${a.color ?? '#3b82f6'}" fill-opacity="0.18"/>`)
  }
  // curves (broken where the function is undefined or jumps off-screen)
  fns.forEach((f, i) => {
    let d = '', pen = false
    for (const [x, y] of samples[i]) {
      if (!Number.isFinite(y) || y < y0 - (y1 - y0) || y > y1 + (y1 - y0)) { pen = false; continue }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`
      pen = true
    }
    parts.push(`<path d="${d}" fill="none" stroke="${f.color}" stroke-width="2.4"${f.dashed ? ' stroke-dasharray="6 5"' : ''}/>`)
  })
  for (const v of spec.vlines ?? []) parts.push(`<line x1="${sx(v.x)}" y1="${T}" x2="${sx(v.x)}" y2="${H - B}" stroke="#f59e0b" stroke-dasharray="5 4" stroke-width="1.5"/>${v.label ? `<text x="${sx(v.x) + 4}" y="${T + 12}" font-size="11" fill="#f59e0b">${esc(v.label)}</text>` : ''}`)
  for (const p of spec.points ?? []) parts.push(`<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4.5" fill="${p.color ?? '#ef4444'}"/>${p.label ? `<text x="${sx(p.x) + 8}" y="${sy(p.y) - 8}" font-size="12" fill="currentColor">${esc(p.label)}</text>` : ''}`)
  // legend
  fns.forEach((f, i) => parts.push(`<rect x="${L + 10}" y="${T + 8 + i * 18}" width="14" height="3" fill="${f.color}"/><text x="${L + 30}" y="${T + 13 + i * 18}" font-size="12" fill="currentColor">${esc(f.label ?? `y = ${f.fn}`)}</text>`))
  if (spec.title) parts.push(`<text x="${W / 2}" y="20" font-size="14" font-weight="600" text-anchor="middle" fill="currentColor">${esc(spec.title)}</text>`)
  if (spec.xlabel) parts.push(`<text x="${W - R}" y="${H - 6}" font-size="11" text-anchor="end" fill="currentColor" fill-opacity="0.7">${esc(spec.xlabel)}</text>`)
  if (spec.ylabel) parts.push(`<text x="12" y="${T + 4}" font-size="11" fill="currentColor" fill-opacity="0.7">${esc(spec.ylabel)}</text>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-sans-serif, system-ui, sans-serif">${parts.join('')}</svg>`
}

// Labels in graphs read like math: "x^2 - 4*x" → "x² − 4·x".
const esc = (s: string) => prettyMath(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// ---------------- mermaid ----------------

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
let mermaidTheme = ''
let seq = 0

export async function renderMermaid(code: string): Promise<string> {
  mermaidReady ??= import('mermaid').then((m) => m.default)
  const mermaid = await mermaidReady
  const theme = resolvedTheme() === 'dark' ? 'dark' : 'default'
  if (theme !== mermaidTheme) {
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      // Pure-SVG labels (no HTML inside SVG): safer, and the diagram can be turned into a picture for the board.
      htmlLabels: false, flowchart: { htmlLabels: false, curve: 'basis' },
    })
    mermaidTheme = theme
  }
  const { svg } = await mermaid.render(`mmd-${++seq}`, code)
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['style'] })
}

// ---------------- SVG → picture (for "Put on board") ----------------

/** Rasterize an SVG element to a PNG blob, with explicit colors and a paper background. */
export async function svgToPng(svg: SVGSVGElement, ink: string, paper: string): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const box = svg.getBoundingClientRect()
  const vb = svg.viewBox?.baseVal
  const w = vb && vb.width ? vb.width : box.width || 560
  const h = vb && vb.height ? vb.height : box.height || 360
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.style.color = ink // currentColor → the board's ink color
  const xml = new XMLSerializer().serializeToString(clone)
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  await img.decode()
  const scale = 2
  const pad = 16
  const c = document.createElement('canvas')
  c.width = (w + pad * 2) * scale
  c.height = (h + pad * 2) * scale
  const ctx = c.getContext('2d')!
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, pad * scale, pad * scale, w * scale, h * scale)
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('could not render'))), 'image/png'))
}

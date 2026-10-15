// The graphing engine behind ```plot blocks (static pictures and the interactive grapher).
// Formulas are parsed by mathjs (never eval'd) with its dangerous functions disabled.
import { prettyMath } from './math'

export interface PlotSlider { name: string; min: number; max: number; value?: number; step?: number; label?: string }
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
  /** Parameters used in the formulas (a, b, k…), shown as sliders that can be animated. */
  sliders?: PlotSlider[]
  /** Start with the trace point on (the point that moves along the curve). */
  trace?: boolean
}
export interface View { x0: number; x1: number; y0: number; y1: number }
export type Params = Record<string, number>
export type Fn = (x: number, p?: Params) => number

export const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4']
let compilerPromise: Promise<(src: string) => Fn> | null = null

/** Safe formula compiler. Variables: x plus any slider parameters. */
export function getCompiler() {
  compilerPromise ??= import('mathjs').then(({ create, all }) => {
    const math = create(all)
    const compile = math.compile
    const off = (n: string) => () => { throw new Error(`${n} is disabled`) }
    math.import({ import: off('import'), createUnit: off('createUnit'), evaluate: off('evaluate'), parse: off('parse'), simplify: off('simplify'), derivative: off('derivative') }, { override: true })
    return (src: string): Fn => {
      const code = compile(src.replace(/\*\*/g, '^'))
      return (x, p = {}) => {
        const r = code.evaluate({ ...p, x })
        return typeof r === 'number' ? r : Number(r)
      }
    }
  })
  return compilerPromise
}

export const defaultParams = (spec: PlotSpec): Params =>
  Object.fromEntries((spec.sliders ?? []).map((s) => [s.name, s.value ?? (s.min + s.max) / 2]))

const safe = (f: Fn, x: number, p: Params) => { try { const y = f(x, p); return Number.isFinite(y) ? y : NaN } catch { return NaN } }

/** A window that shows the interesting part: spec.x, and y from the curves (ignoring spikes). */
export function autoView(spec: PlotSpec, fns: Fn[], p: Params): View {
  const [x0, x1] = spec.x ?? [-10, 10]
  if (spec.y) return { x0, x1, y0: spec.y[0], y1: spec.y[1] }
  const ys: number[] = (spec.points ?? []).map((pt) => pt.y)
  for (const f of fns) for (let i = 0; i <= 200; i++) { const y = safe(f, x0 + ((x1 - x0) * i) / 200, p); if (Number.isFinite(y)) ys.push(y) }
  if (!ys.length) return { x0, x1, y0: -10, y1: 10 }
  ys.sort((a, b) => a - b)
  const lo = ys[Math.floor(ys.length * 0.02)], hi = ys[Math.ceil(ys.length * 0.98) - 1]
  const pad = (hi - lo || 2) * 0.12
  return { x0, x1, y0: lo - pad, y1: hi + pad }
}

const nice = (v: number) => {
  const a = Math.abs(v)
  if (a < 1e-12) return '0'
  return a >= 10000 || a < 0.001 ? v.toExponential(1) : String(Math.round(v * 1000) / 1000)
}
export const fmt = (v: number) => (Number.isFinite(v) ? nice(v) : 'undefined')

function ticks(lo: number, hi: number, count = 6) {
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step)
  return out
}

const esc = (s: string) => prettyMath(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export interface DrawOptions {
  view: View
  params?: Params
  width?: number
  height?: number
  /** x of the trace point (moves along every curve), with tangent and readout. */
  traceX?: number | null
  tangent?: boolean
  /** x under the mouse: light guide + values. */
  hoverX?: number | null
}

export const PAD = { L: 48, R: 16, T: 14, B: 40 }
let clipSeq = 0

/** Draw the plot as an SVG string (used for the static picture and every interactive frame). */
export function plotSvg(spec: PlotSpec, fns: Fn[], areaFns: Fn[], o: DrawOptions): string {
  const W = o.width ?? 560, H = o.height ?? 360
  const T = PAD.T + (spec.title ? 20 : 0), L = PAD.L, R = PAD.R, B = PAD.B
  const { x0, x1, y0, y1 } = o.view
  const p = o.params ?? {}
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R)
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B)
  const clip = `plot-clip-${++clipSeq}` // unique per drawing: several graphs can be on screen at once
  const parts: string[] = [`<defs><clipPath id="${clip}"><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/></clipPath></defs>`]
  for (const t of ticks(x0, x1, Math.max(3, Math.round((W - L - R) / 90)))) parts.push(`<line x1="${sx(t)}" y1="${T}" x2="${sx(t)}" y2="${H - B}" stroke="currentColor" stroke-opacity="0.1"/><text x="${sx(t)}" y="${H - B + 16}" font-size="11" text-anchor="middle" fill="currentColor" fill-opacity="0.7">${nice(t)}</text>`)
  for (const t of ticks(y0, y1, Math.max(3, Math.round((H - T - B) / 60)))) parts.push(`<line x1="${L}" y1="${sy(t)}" x2="${W - R}" y2="${sy(t)}" stroke="currentColor" stroke-opacity="0.1"/><text x="${L - 6}" y="${sy(t) + 4}" font-size="11" text-anchor="end" fill="currentColor" fill-opacity="0.7">${nice(t)}</text>`)
  if (y0 < 0 && y1 > 0) parts.push(`<line x1="${L}" y1="${sy(0)}" x2="${W - R}" y2="${sy(0)}" stroke="currentColor" stroke-opacity="0.55"/>`)
  if (x0 < 0 && x1 > 0) parts.push(`<line x1="${sx(0)}" y1="${T}" x2="${sx(0)}" y2="${H - B}" stroke="currentColor" stroke-opacity="0.55"/>`)

  const g: string[] = [] // clipped to the plot area
  ;(spec.areas ?? []).forEach((a, i) => {
    const f = areaFns[i]
    if (!f) return
    const base = sy(Math.max(y0, Math.min(y1, 0)))
    const pts = [`${sx(a.from)},${base}`]
    for (let k = 0; k <= 160; k++) {
      const x = a.from + ((a.to - a.from) * k) / 160
      const y = safe(f, x, p)
      pts.push(`${sx(x)},${sy(Math.max(y0 - 1e6, Math.min(y1 + 1e6, Number.isFinite(y) ? y : 0)))}`)
    }
    pts.push(`${sx(a.to)},${base}`)
    g.push(`<polygon points="${pts.join(' ')}" fill="${a.color ?? '#3b82f6'}" fill-opacity="0.18"/>`)
  })
  const N = Math.max(300, Math.round(W - L - R) * 2)
  ;(spec.functions ?? []).forEach((spec_f, i) => {
    const f = fns[i]
    let d = '', pen = false, prevY = NaN
    for (let k = 0; k <= N; k++) {
      const x = x0 + ((x1 - x0) * k) / N
      const y = safe(f, x, p)
      // Break the line at undefined points and at jumps (asymptotes like tan x or 1/x).
      const jump = Number.isFinite(prevY) && Math.abs(y - prevY) > (y1 - y0) * 2
      if (!Number.isFinite(y) || jump) { pen = false; prevY = y; if (!Number.isFinite(y)) continue }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(Math.max(y0 - (y1 - y0) * 5, Math.min(y1 + (y1 - y0) * 5, y))).toFixed(1)}`
      pen = true
      prevY = y
    }
    const color = spec_f.color ?? COLORS[i % COLORS.length]
    g.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"${spec_f.dashed ? ' stroke-dasharray="6 5"' : ''}/>`)
  })
  for (const v of spec.vlines ?? []) g.push(`<line x1="${sx(v.x)}" y1="${T}" x2="${sx(v.x)}" y2="${H - B}" stroke="#f59e0b" stroke-dasharray="5 4" stroke-width="1.5"/>${v.label ? `<text x="${sx(v.x) + 4}" y="${T + 12}" font-size="11" fill="#f59e0b">${esc(v.label)}</text>` : ''}`)
  for (const pt of spec.points ?? []) g.push(`<circle cx="${sx(pt.x)}" cy="${sy(pt.y)}" r="4.5" fill="${pt.color ?? '#ef4444'}"/>${pt.label ? `<text x="${sx(pt.x) + 8}" y="${sy(pt.y) - 8}" font-size="12" fill="currentColor">${esc(pt.label)}</text>` : ''}`)

  // Hover guide.
  if (o.hoverX != null && o.traceX == null) {
    g.push(`<line x1="${sx(o.hoverX)}" y1="${T}" x2="${sx(o.hoverX)}" y2="${H - B}" stroke="currentColor" stroke-opacity="0.25"/>`)
    fns.forEach((f, i) => { const y = safe(f, o.hoverX!, p); if (Number.isFinite(y)) g.push(`<circle cx="${sx(o.hoverX!)}" cy="${sy(y)}" r="3.5" fill="${spec.functions![i].color ?? COLORS[i % COLORS.length]}"/>`) })
  }
  // Trace point: on every curve, with tangent line and value labels.
  if (o.traceX != null) {
    const x = o.traceX
    g.push(`<line x1="${sx(x)}" y1="${T}" x2="${sx(x)}" y2="${H - B}" stroke="#f59e0b" stroke-opacity="0.5" stroke-dasharray="3 4"/>`)
    fns.forEach((f, i) => {
      const y = safe(f, x, p)
      if (!Number.isFinite(y)) return
      const color = spec.functions![i].color ?? COLORS[i % COLORS.length]
      if (o.tangent) {
        const h = (x1 - x0) * 1e-4, m = (safe(f, x + h, p) - safe(f, x - h, p)) / (2 * h)
        if (Number.isFinite(m)) {
          const span = (x1 - x0) * 0.18
          g.push(`<line x1="${sx(x - span)}" y1="${sy(y - m * span)}" x2="${sx(x + span)}" y2="${sy(y + m * span)}" stroke="${color}" stroke-width="1.6" stroke-dasharray="6 4" stroke-opacity="0.9"/>`)
        }
      }
      g.push(`<circle cx="${sx(x)}" cy="${sy(y)}" r="6" fill="${color}" stroke="white" stroke-width="2"/>`)
      const right = sx(x) < W - 150
      g.push(`<text x="${sx(x) + (right ? 10 : -10)}" y="${sy(y) - 10}" font-size="12.5" font-weight="600" text-anchor="${right ? 'start' : 'end'}" fill="currentColor" paint-order="stroke" stroke="var(--plot-bg, white)" stroke-width="4">(${fmt(x)}, ${fmt(y)})</text>`)
    })
  }
  parts.push(`<g clip-path="url(#${clip})">${g.join('')}</g>`)

  ;(spec.functions ?? []).forEach((f, i) => parts.push(`<rect x="${L + 10}" y="${T + 8 + i * 18}" width="14" height="3" fill="${f.color ?? COLORS[i % COLORS.length]}"/><text x="${L + 30}" y="${T + 13 + i * 18}" font-size="12" fill="currentColor">${esc(f.label ?? `y = ${f.fn}`)}</text>`))
  if (spec.title) parts.push(`<text x="${W / 2}" y="20" font-size="14" font-weight="600" text-anchor="middle" fill="currentColor">${esc(spec.title)}</text>`)
  if (spec.xlabel) parts.push(`<text x="${W - R}" y="${H - 6}" font-size="11" text-anchor="end" fill="currentColor" fill-opacity="0.7">${esc(spec.xlabel)}</text>`)
  if (spec.ylabel) parts.push(`<text x="12" y="${T + 4}" font-size="11" fill="currentColor" fill-opacity="0.7">${esc(spec.ylabel)}</text>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-sans-serif, system-ui, sans-serif">${parts.join('')}</svg>`
}

/** Compile everything in a spec once. */
export async function compileSpec(spec: PlotSpec) {
  const compile = await getCompiler()
  return {
    fns: (spec.functions ?? []).map((f) => compile(f.fn)),
    areaFns: (spec.areas ?? []).map((a) => compile(a.fn)),
  }
}

/** Static picture of a plot (default window, default parameters). */
export async function renderPlot(spec: PlotSpec): Promise<string> {
  const { fns, areaFns } = await compileSpec(spec)
  const params = defaultParams(spec)
  return plotSvg(spec, fns, areaFns, { view: autoView(spec, fns, params), params })
}

/** Rising or falling at x, from the slope. */
export function slopeWords(f: Fn, x: number, p: Params, span: number): { slope: number; words: string } {
  const h = span * 1e-4
  const m = (safe(f, x + h, p) - safe(f, x - h, p)) / (2 * h)
  if (!Number.isFinite(m)) return { slope: NaN, words: 'undefined here' }
  if (Math.abs(m) < 1e-6 * Math.max(1, span)) return { slope: m, words: 'flat (slope 0): a possible max or min' }
  return { slope: m, words: m > 0 ? 'increasing ↗' : 'decreasing ↘' }
}

// Diagrams in AI answers, rendered as real graphics:
//   ```plot     JSON spec → interactive graphs (engine in ./plot.ts, UI in components/InteractivePlot.tsx)
//   ```mermaid  flowcharts, trees, call stacks, state machines (Mermaid, strict security)
// Both produce plain SVG, which can be put on a board as a picture.
import DOMPurify from 'dompurify'
import { resolvedTheme } from './theme'

export { renderPlot, type PlotSpec } from './plot'

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
  clone.style.setProperty('--plot-bg', paper)
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

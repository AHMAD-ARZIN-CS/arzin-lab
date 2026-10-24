import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PALETTES } from '../lib/board'
import { renderMermaid, renderPlot, svgToPng, type PlotSpec } from '../lib/diagrams'
import { editorThemeName, monaco } from '../lib/monaco'
import { extractMath, insertMath, prettyMermaid } from '../lib/math'
import { getState, toast } from '../lib/store'
import { resolvedTheme } from '../lib/theme'
import { boardBridge } from './Board'
import { InteractivePlot } from './InteractivePlot'

export interface CodeAction { label: string; run: (code: string, lang: string) => void }

const CODE_LANGS = new Set(['cpp', 'c', 'cc', 'h', 'hpp', 'python', 'py', 'java', 'javascript', 'js', 'ts', 'typescript', 'bash', 'sh', 'go', 'rust', 'cs'])
const DIAGRAM_LANGS = new Set(['plot', 'mermaid', 'svg'])

/** Put a rendered diagram on the open board, drawn in the board's ink and paper colors.
 *  Graphs also carry their formulas, so they can be reopened as live graphs from the board. */
export async function placeOnBoard(svg: SVGSVGElement, plot?: PlotSpec) {
  if (!boardBridge.addImage || getState().mode !== 'board') return false
  const pal = PALETTES[resolvedTheme()]
  await boardBridge.addImage(await svgToPng(svg, pal.ink, pal.paper), plot ? { plot } : undefined)
  return true
}

/** Static picture of a plot as an element (for auto-placing a Visualize answer on the board). */
async function plotElement(spec: PlotSpec) {
  const holder = document.createElement('div')
  holder.innerHTML = await renderPlot(spec) // built by our plotter from numbers + escaped labels
  return holder.querySelector('svg') as SVGSVGElement
}

async function renderDiagram(lang: string, source: string): Promise<string> {
  if (lang === 'plot') return renderPlot(JSON.parse(source) as PlotSpec)
  if (lang === 'mermaid') return renderMermaid(prettyMermaid(source))
  const clean = DOMPurify.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true } })
  if (!clean.includes('<svg')) throw new Error('not a valid SVG')
  return clean
}

/** Renders Markdown safely (sanitized: AI text and notes never run as HTML/JS), with code-block
 *  buttons, and diagram blocks (plot / mermaid / svg) drawn as real graphics. */
export function Markdown({ text, codeActions = [], streaming = false, onDiagram, onAskAnimate }: {
  text: string; codeActions?: CodeAction[]; streaming?: boolean
  /** Called with the first diagram once it's drawn (used to put Visualize answers on the board). */
  onDiagram?: (svg: SVGSVGElement, plot?: PlotSpec) => void
  /** "Animate / make interactive" on a graph: ask the AI for a version with sliders. */
  onAskAnimate?: (spec: PlotSpec) => void
}) {
  const roots = useRef<Root[]>([])
  useEffect(() => () => { roots.current.forEach((r) => setTimeout(() => r.unmount())); roots.current = [] }, [])
  const html = useMemo(() => {
    // Math is taken out first (so Markdown doesn't mangle it), the rest is sanitized,
    // then KaTeX's typeset math (generated from text, trust: false) is put back.
    const { text: prose, math } = extractMath(text)
    const safe = DOMPurify.sanitize(marked.parse(prose, { async: false, gfm: true, breaks: false }) as string)
    return insertMath(safe, math)
  }, [text])
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el || streaming) return
    let first = true
    el.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement!
      if (pre.dataset.done) return
      pre.dataset.done = '1'
      const lang = (code.className.match(/language-([\w+#-]+)/)?.[1] ?? '').replace('c++', 'cpp').toLowerCase()
      const raw = code.textContent ?? ''

      if (lang === 'plot') {
        // Graphs are live: an interactive grapher (pan, zoom, trace, sliders), not a picture.
        const isFirst = first
        first = false
        let spec: PlotSpec
        try { spec = JSON.parse(raw) } catch (e) {
          const box = document.createElement('div')
          box.className = 'diagram-error'
          box.textContent = `Couldn't read this graph (${(e as Error).message}).`
          pre.replaceWith(box)
          return
        }
        const box = document.createElement('div')
        box.className = 'diagram live'
        pre.replaceWith(box)
        const root = createRoot(box)
        roots.current.push(root)
        root.render(<InteractivePlot spec={spec}
          onPutOnBoard={async (svg, s) => { if (!(await placeOnBoard(svg, s))) alertNoBoardToast() }}
          onAskAnimate={onAskAnimate ? () => onAskAnimate(spec) : undefined} />)
        if (isFirst && onDiagram) plotElement(spec).then((svg) => svg && onDiagram(svg, spec)).catch(() => {})
        return
      }

      if (DIAGRAM_LANGS.has(lang)) {
        const box = document.createElement('div')
        box.className = 'diagram'
        box.innerHTML = '<div class="diagram-loading">Drawing…</div>'
        pre.replaceWith(box)
        const isFirst = first
        first = false
        renderDiagram(lang, raw).then((svgText) => {
          // svgText is sanitized (DOMPurify) or built by our own plotter from escaped values.
          box.innerHTML = svgText
          const svg = box.querySelector('svg')
          if (!svg) throw new Error('nothing to draw')
          svg.removeAttribute('height')
          svg.style.maxWidth = '100%'
          const bar = document.createElement('div')
          bar.className = 'code-actions'
          const onBoard = document.createElement('button')
          onBoard.className = 'btn small'
          onBoard.textContent = 'Put on board'
          onBoard.title = 'Open a board first; the diagram goes next to what you circled'
          onBoard.onclick = async () => { if (!(await placeOnBoard(svg))) alertNoBoard(onBoard) }
          const src = document.createElement('button')
          src.className = 'btn small ghost'
          src.textContent = 'Show source'
          src.onclick = () => { const p = document.createElement('pre'); p.textContent = raw; bar.after(p); src.remove() }
          bar.append(onBoard, src)
          box.after(bar)
          if (isFirst) onDiagram?.(svg)
        }).catch((e: Error) => {
          box.innerHTML = ''
          const msg = document.createElement('div')
          msg.className = 'diagram-error'
          msg.textContent = `Couldn't draw this ${lang} diagram (${e.message}). Source:`
          const p = document.createElement('pre')
          p.textContent = raw
          box.append(msg, p)
        })
        return
      }

      if (lang) {
        code.setAttribute('data-lang', lang === 'py' ? 'python' : lang)
        monaco.editor.colorizeElement(code as HTMLElement, { theme: editorThemeName() }).catch(() => {})
      }
      // Buttons like "open as proposed version" only make sense for real code, not math or plain text.
      if (!codeActions.length || !CODE_LANGS.has(lang)) return
      const bar = document.createElement('div')
      bar.className = 'code-actions'
      for (const a of codeActions) {
        const b = document.createElement('button')
        b.className = 'btn small'
        b.textContent = a.label
        b.onclick = () => a.run(raw, lang)
        bar.appendChild(b)
      }
      pre.after(bar)
    })
  }, [html, streaming, codeActions, onDiagram, onAskAnimate])
  return <div className="md" ref={host} dangerouslySetInnerHTML={{ __html: html }} />
}

const alertNoBoardToast = () => toast('Open a board first (Board mode), then Put on board')

function alertNoBoard(btn: HTMLButtonElement) {
  btn.textContent = 'Open a board first'
  setTimeout(() => { btn.textContent = 'Put on board' }, 2200)
}

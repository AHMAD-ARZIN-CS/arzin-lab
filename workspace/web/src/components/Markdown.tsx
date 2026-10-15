import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useRef } from 'react'
import { PALETTES } from '../lib/board'
import { renderMermaid, renderPlot, svgToPng, type PlotSpec } from '../lib/diagrams'
import { editorThemeName, monaco } from '../lib/monaco'
import { getState } from '../lib/store'
import { resolvedTheme } from '../lib/theme'
import { boardBridge } from './Board'

export interface CodeAction { label: string; run: (code: string, lang: string) => void }

const CODE_LANGS = new Set(['cpp', 'c', 'cc', 'h', 'hpp', 'python', 'py', 'java', 'javascript', 'js', 'ts', 'typescript', 'bash', 'sh', 'go', 'rust', 'cs'])
const DIAGRAM_LANGS = new Set(['plot', 'mermaid', 'svg'])

/** Put a rendered diagram on the open board, drawn in the board's ink and paper colors. */
export async function placeOnBoard(svg: SVGSVGElement) {
  if (!boardBridge.addImage || getState().mode !== 'board') return false
  const pal = PALETTES[resolvedTheme()]
  await boardBridge.addImage(await svgToPng(svg, pal.ink, pal.paper))
  return true
}

async function renderDiagram(lang: string, source: string): Promise<string> {
  if (lang === 'plot') return renderPlot(JSON.parse(source) as PlotSpec)
  if (lang === 'mermaid') return renderMermaid(source)
  const clean = DOMPurify.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true } })
  if (!clean.includes('<svg')) throw new Error('not a valid SVG')
  return clean
}

/** Renders Markdown safely (sanitized: AI text and notes never run as HTML/JS), with code-block
 *  buttons, and diagram blocks (plot / mermaid / svg) drawn as real graphics. */
export function Markdown({ text, codeActions = [], streaming = false, onDiagram }: {
  text: string; codeActions?: CodeAction[]; streaming?: boolean
  /** Called with the first diagram once it's drawn (used to put Visualize answers on the board). */
  onDiagram?: (svg: SVGSVGElement) => void
}) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: false }) as string), [text])
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
  }, [html, streaming, codeActions, onDiagram])
  return <div className="md" ref={host} dangerouslySetInnerHTML={{ __html: html }} />
}

function alertNoBoard(btn: HTMLButtonElement) {
  btn.textContent = 'Open a board first'
  setTimeout(() => { btn.textContent = 'Put on board' }, 2200)
}

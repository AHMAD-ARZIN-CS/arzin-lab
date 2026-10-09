import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useRef } from 'react'
import { editorThemeName, monaco } from '../lib/monaco'

export interface CodeAction { label: string; run: (code: string, lang: string) => void }

const CODE_LANGS = new Set(['cpp', 'c', 'cc', 'h', 'hpp', 'python', 'py', 'java', 'javascript', 'js', 'ts', 'typescript', 'bash', 'sh', 'go', 'rust', 'cs'])

/** ```svg blocks from the AI become real diagrams. Sanitized with DOMPurify's SVG profile:
 *  no scripts, no event handlers, no external references. */
function renderSvgBlocks(text: string, streaming: boolean) {
  if (streaming) return text
  return text.replace(/```svg\n([\s\S]*?)```/g, (_, svg: string) => {
    const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
    return clean.includes('<svg') ? `\n<div class="md-svg">${clean}</div>\n` : '```\n(diagram could not be rendered safely)\n```'
  })
}

/** Renders Markdown safely (sanitized: AI text and notes never run as HTML/JS) with code-block buttons. */
export function Markdown({ text, codeActions = [], streaming = false }: { text: string; codeActions?: CodeAction[]; streaming?: boolean }) {
  const html = useMemo(() => {
    const md = marked.parse(renderSvgBlocks(text, streaming), { async: false, gfm: true, breaks: false }) as string
    return DOMPurify.sanitize(md, { ADD_TAGS: ['svg', 'path', 'circle', 'line', 'polyline', 'polygon', 'rect', 'text', 'g', 'tspan', 'defs', 'marker', 'ellipse'], ADD_ATTR: ['viewBox', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'text-anchor', 'font-size', 'font-family', 'transform', 'marker-end', 'marker-start', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'opacity', 'dominant-baseline'] })
  }, [text, streaming])
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el || streaming) return
    el.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement!
      if (pre.dataset.done) return
      pre.dataset.done = '1'
      const lang = (code.className.match(/language-([\w+#-]+)/)?.[1] ?? '').replace('c++', 'cpp')
      const raw = code.textContent ?? ''
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
  }, [html, streaming, codeActions])
  return <div className="md" ref={host} dangerouslySetInnerHTML={{ __html: html }} />
}

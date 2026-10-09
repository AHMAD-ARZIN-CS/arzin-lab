import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useRef } from 'react'
import { monaco } from '../lib/monaco'

export interface CodeAction { label: string; run: (code: string, lang: string) => void }

/** Renders Markdown safely (sanitized: AI text and notes never run as HTML/JS) with code-block buttons. */
export function Markdown({ text, codeActions = [], streaming = false }: { text: string; codeActions?: CodeAction[]; streaming?: boolean }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks: false }) as string), [text])
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
        monaco.editor.colorizeElement(code as HTMLElement, { theme: 'lab' }).catch(() => {})
      }
      if (!codeActions.length) return
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

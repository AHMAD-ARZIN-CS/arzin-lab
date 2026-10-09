// In-app replacements for window.prompt / window.confirm.
import { useEffect, useRef, useState } from 'react'

interface Req { kind: 'prompt' | 'confirm'; message: string; value: string; danger?: boolean; resolve: (v: string | null) => void }
let push: ((r: Req) => void) | null = null

export function askText(message: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => push?.({ kind: 'prompt', message, value, resolve }))
}
export function askConfirm(message: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => push?.({ kind: 'confirm', message, value: '', danger, resolve: (v) => resolve(v !== null) }))
}

export function Dialogs() {
  const [req, setReq] = useState<Req | null>(null)
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { push = (r) => { setReq(r); setValue(r.value) }; return () => { push = null } }, [])
  useEffect(() => {
    if (req?.kind === 'prompt') setTimeout(() => {
      const el = input.current
      if (!el) return
      el.focus()
      const dot = el.value.lastIndexOf('.'), slash = el.value.lastIndexOf('/')
      el.setSelectionRange(slash + 1, dot > slash ? dot : el.value.length) // select the name, not the folder or extension
    }, 0)
  }, [req])
  if (!req) return null
  const close = (v: string | null) => { req.resolve(v); setReq(null) }
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <form className="dialog" onSubmit={(e) => { e.preventDefault(); close(req.kind === 'prompt' ? value.trim() || null : 'ok') }}
        onKeyDown={(e) => e.key === 'Escape' && close(null)}>
        <p>{req.message}</p>
        {req.kind === 'prompt' && <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={() => close(null)}>Cancel</button>
          <button type="submit" className={`btn ${req.danger ? 'danger' : 'primary'}`} autoFocus={req.kind === 'confirm'}>{req.kind === 'prompt' ? 'OK' : req.danger ? 'Yes, do it' : 'OK'}</button>
        </div>
      </form>
    </div>
  )
}

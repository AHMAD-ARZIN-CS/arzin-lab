import { useEffect, useRef, useState } from 'react'
import { files } from '../lib/api'
import { getState, openBoard, refreshTree, setState, toast, useStore, newBoard, boardList, type Thread } from '../lib/store'
import { revealLine } from './CodeEditor'
import { Markdown } from './Markdown'

/** Notes for a code file live at notes/<file>.md — plain files, so they're in your repo too. */
export const notesPath = (file: string) => `notes/${file}.md`

export async function appendNote(t: Thread) {
  const file = t.file ?? getState().active
  if (!file) return toast('Open a file first')
  const path = notesPath(file)
  const existing = await files.read(path).catch(() => `# Notes: ${file}\n`)
  const link = t.lines ? ` ([${file}:${t.lines[0]}](#line-${t.lines[0]}))` : ''
  const body = [t.answer, ...t.followUps.map((f) => `**Q: ${f.q}**\n\n${f.a}`)].join('\n\n')
  await files.write(path, `${existing.trimEnd()}\n\n## ${t.title}${link}\n_${new Date().toLocaleString()}_\n\n${body}\n`)
  window.dispatchEvent(new CustomEvent('lab:notes-changed', { detail: path }))
  setState({ rightTab: 'notes', rightOpen: true })
  refreshTree()
  toast(`Saved to ${path}`)
}

export function NotesPanel() {
  const active = useStore((s) => s.active)
  const tree = useStore((s) => s.tree)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(true)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const saveTimer = useRef(0)

  const load = (file: string) => files.read(notesPath(file)).then(setText, () => setText('')).finally(() => setLoadedFor(file))
  useEffect(() => { if (active) load(active) }, [active])
  useEffect(() => {
    const h = (e: Event) => { if (active && (e as CustomEvent).detail === notesPath(active)) load(active) }
    window.addEventListener('lab:notes-changed', h)
    return () => window.removeEventListener('lab:notes-changed', h)
  }, [active])

  const onChange = (v: string) => {
    setText(v)
    clearTimeout(saveTimer.current)
    const file = active
    if (!file) return
    saveTimer.current = window.setTimeout(() => files.write(notesPath(file), v).then(() => refreshTree()), 800)
  }

  // Links like (#line-12) in notes jump to that line of the code file.
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    const m = a?.getAttribute('href')?.match(/^#line-(\d+)$/)
    if (m) { e.preventDefault(); revealLine(Number(m[1])) }
  }

  const boardFor = active ? `boards/${active.replace(/\//g, '-')}.board.json` : null
  const openFileBoard = () => {
    if (!boardFor || !active) return
    if (boardList(tree).includes(boardFor)) openBoard(boardFor)
    else newBoard(active.replace(/\//g, '-'))
  }

  if (!active) return <div className="pane-empty">Open a file: notes are saved per file.</div>
  return (
    <div className="notes">
      <div className="pane-toolbar">
        <span className="muted small">Notes for <b>{active.split('/').pop()}</b></span>
        <div className="row-gap">
          <button className="btn small ghost" onClick={openFileBoard} title="A whiteboard tied to this file">Board for this file</button>
          <button className="btn small" onClick={() => setEditing(!editing)}>{editing ? 'Preview' : 'Edit'}</button>
        </div>
      </div>
      {loadedFor === active && (
        editing
          ? <textarea className="notes-text" value={text} onChange={(e) => onChange(e.target.value)} spellCheck
              placeholder={`Plan your approach, trace an example, write down what confused you.\nSaved explanations land here too. Markdown works.`} />
          : <div className="notes-preview" onClick={onClick}><Markdown text={text || '_Nothing yet._'} /></div>
      )}
      <div className="pane-foot">Saved to <code>{notesPath(active)}</code></div>
    </div>
  )
}

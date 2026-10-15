import { useCallback, useState } from 'react'
import { askText } from './Dialogs'
import { appendNote } from './NotesPanel'
import { Markdown, placeOnBoard, type CodeAction } from './Markdown'
import { revealLine } from './CodeEditor'
import { askAi, contextLabel, createFile, currentContext, deleteThread, followUp, markPlaced, getState, openFile, propose, toast, useStore, type Thread } from '../lib/store'

const SESSION_START = Date.now()

const codeActions: CodeAction[] = [
  { label: 'Open as proposed version (diff)', run: (code) => propose(code, 'from an explanation') },
  { label: 'Copy', run: (code) => navigator.clipboard.writeText(code).then(() => toast('Copied')) },
  {
    label: 'New file from this',
    run: async (code, lang) => {
      const ext = { cpp: 'cpp', c: 'c', python: 'py', py: 'py', javascript: 'js', js: 'js', java: 'java' }[lang] ?? 'txt'
      const name = await askText('Save this code as a new file:', `scratch/example.${ext}`)
      if (name) createFile(name, code)
    },
  },
]

export function ExplainPanel() {
  const all = useStore((s) => s.threads)
  const here = useStore((s) => currentContext(s))
  useStore((s) => s.problems) // re-render labels when problem titles load
  const [scope, setScope] = useState<'here' | 'all'>('here')
  const [q, setQ] = useState('')
  const threads = scope === 'all' ? all : all.filter((t) => t.context === here)
  const hereCount = all.filter((t) => t.context === here).length
  return (
    <div className="explain">
      <form className="ask-box" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { askAi({ action: 'ask', question: q.trim() }); setQ('') } }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about this code…" />
        <button className="btn" disabled={!q.trim()}>Ask</button>
      </form>
      <div className="seg slim">
        <button className={scope === 'here' ? 'on' : ''} onClick={() => setScope('here')} title="Explanations about what you have open">
          {here === 'general' ? 'Here' : contextLabel(here)} ({hereCount})
        </button>
        <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>All ({all.length})</button>
      </div>
      {scope === 'here' && threads.length === 0 && all.length > 0 && (
        <p className="pane-empty">No saved explanations for <b>{contextLabel(here)}</b> yet. Earlier ones about other problems are under <button className="link-btn" onClick={() => setScope('all')}>All</button>.</p>
      )}
      {all.length === 0 && (
        <div className="viz-empty">
          <h3>Ask about any part of your code</h3>
          <p>Select a word, expression, line or block in the editor, then right-click (or use <b>Explain</b> in the toolbar):</p>
          <ul className="muted">
            <li>Explain this</li><li>Show what this does visually</li><li>Explain why this error happened</li>
            <li>Give me a small example</li><li>Give me a hint</li><li>Compare another approach</li>
          </ul>
          <p className="muted">The explanation uses your selection, the whole file, your input, errors, and the current visualizer step.</p>
        </div>
      )}
      {threads.map((t) => <ThreadView key={t.id} t={t} showContext={scope === 'all'} />)}
      {all.length > 0 && <p className="pane-foot-note muted small">Explanations are saved automatically in <code>my-code/.chats/</code>, grouped by problem, file, board or lecture.</p>}
    </div>
  )
}

function ThreadView({ t, showContext }: { t: Thread; showContext: boolean }) {
  // Explanations from earlier visits start collapsed: a tidy list of titles to reopen.
  const [collapsed, setCollapsed] = useState(() => t.status !== 'streaming' && Date.parse(t.time ?? '') < SESSION_START)
  const [more, setMore] = useState('')
  const busy = t.status === 'streaming'
  // "Visualize" on the board: the first diagram goes onto the board next to what you circled (once).
  const autoPlace = useCallback((svg: SVGSVGElement) => {
    if (t.action !== 'visual' || !t.image || t.placed || t.status !== 'done') return
    placeOnBoard(svg).then((ok) => { if (ok) { markPlaced(t.id); toast('Diagram added to your board, next to what you circled') } })
  }, [t.action, t.image, t.placed, t.status, t.id])
  const when = t.time ? new Date(t.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
  return (
    <div className={`thread ${t.status}`}>
      <div className="thread-head" onClick={() => setCollapsed(!collapsed)}>
        <span className="caret">{collapsed ? '▸' : '▾'}</span>
        <span className="thread-title">{t.title}</span>
        {showContext && <span className="ctx-chip">{contextLabel(t.context)}</span>}
        {t.file && t.lines && (
          <button className="link-btn small" onClick={async (e) => { e.stopPropagation(); if (getState().active !== t.file) await openFile(t.file!); revealLine(t.lines![0]) }}>
            {t.file.split('/').pop()}:{t.lines[0]}
          </button>
        )}
        <span className="muted small">{when}</span>
        {!busy && <button className="tab-x" title="Delete this explanation" onClick={(e) => { e.stopPropagation(); deleteThread(t.id) }}>×</button>}
      </div>
      {!collapsed && (
        <div className="thread-body">
          {t.image && <img className="thread-img" src={t.image} alt="The circled region that was sent" title="What the AI received" />}
          {t.answer ? <Markdown text={t.answer} codeActions={codeActions} streaming={busy && !t.followUps.length} onDiagram={autoPlace} /> : busy && <div className="muted"><span className="spinner" /> Thinking…</div>}
          {t.followUps.map((f, i) => (
            <div key={i} className="follow">
              <div className="follow-q">› {f.q}</div>
              {f.a ? <Markdown text={f.a} codeActions={codeActions} streaming={busy && i === t.followUps.length - 1} /> : <div className="muted"><span className="spinner" /> Thinking…</div>}
            </div>
          ))}
          {t.status === 'error' && <div className="error">⚠ {t.error}</div>}
          {t.status === 'done' && (
            <div className="thread-actions">
              <button className="btn small primary" onClick={() => followUp(t.id, 'Explain this again with a clear diagram (a plot for math, a mermaid diagram for code, processes or data structures), then walk me through the diagram.', { wantDiagram: true })}>Explain with a diagram</button>
              <button className="btn small" onClick={() => followUp(t.id, 'Go deeper: explain this in more detail, with what happens in memory and one more example.')}>Go deeper</button>
              <button className="btn small" onClick={() => followUp(t.id, 'Explain it more simply, like I am new to programming.')}>Simpler</button>
              <button className="btn small" onClick={() => appendNote(t)}>Save to notes</button>
              <form onSubmit={(e) => { e.preventDefault(); if (more.trim()) { followUp(t.id, more.trim()); setMore('') } }}>
                <input value={more} onChange={(e) => setMore(e.target.value)} placeholder="Follow-up question…" />
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { disposeModel } from '../lib/monaco'
import { closeFile, getState, languageOf, setState, useStore } from '../lib/store'
import { CodeEditor } from './CodeEditor'
import { DiffView } from './DiffView'

export function EditorArea() {
  const open = useStore((s) => s.open)
  const active = useStore((s) => s.active)
  const proposal = useStore((s) => s.proposal)
  const lang = useStore((s) => languageOf(s.active))

  const close = (path: string) => {
    closeFile(path)
    if (!getState().open.some((f) => f.path === path)) disposeModel(path)
  }

  return (
    <div className="editor-area">
      <div className="tabs" role="tablist">
        {open.map((f) => (
          <div key={f.path} className={`tab ${f.path === active ? 'active' : ''}`} title={f.path}
            onClick={() => setState({ active: f.path })} onAuxClick={(e) => e.button === 1 && close(f.path)}>
            <span>{f.path.split('/').pop()}</span>
            {f.content !== f.saved && <span className="dirty" title="Unsaved (Ctrl+S)">●</span>}
            <button className="tab-x" onClick={(e) => { e.stopPropagation(); close(f.path) }} aria-label="Close">×</button>
          </div>
        ))}
        {active && (
          <div className="tab-info">
            {lang ? <>{lang.name} · {lang.trace ? <span className="ok">run + visualize</span> : <span className="warn" title={lang.traceNote}>run only</span>}</> : <span className="muted">not runnable</span>}
          </div>
        )}
      </div>
      <div className="editor-body">
        <div className="editor-stack" hidden={!!proposal}>
          {active ? <CodeEditor /> : <EmptyEditor />}
        </div>
        {proposal && <DiffView />}
      </div>
    </div>
  )
}

function EmptyEditor() {
  return (
    <div className="empty-editor">
      <h2>Nothing open</h2>
      <p>Open a file on the left, create one with <b>New File</b>, or <b>Upload</b> your own code.</p>
      <p className="muted">Shortcuts: Ctrl+S save · Ctrl+Enter run · Ctrl+Shift+Enter visualize · Ctrl+Shift+E explain selection</p>
    </div>
  )
}

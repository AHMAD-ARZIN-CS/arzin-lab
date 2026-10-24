import { useEffect, useRef } from 'react'
import { editorThemeName, monaco, monacoLanguage } from '../lib/monaco'
import { applyProposal, compareProposal, saveProposalAs, setState, updateProposed, useStore } from '../lib/store'

/** A proposed change (from the AI, or an old version) shown side by side before anything changes. */
export function DiffView() {
  const host = useRef<HTMLDivElement>(null)
  const p = useStore((s) => s.proposal)!
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

  useEffect(() => {
    const ed = monaco.editor.createDiffEditor(host.current!, {
      theme: editorThemeName(), automaticLayout: true, fontSize: 13, renderSideBySide: true, originalEditable: false,
      minimap: { enabled: false }, scrollBeyondLastLine: false,
    })
    editor.current = ed
    return () => {
      const m = ed.getModel()
      ed.dispose()
      m?.original.dispose(); m?.modified.dispose()
    }
  }, [])

  useEffect(() => {
    const ed = editor.current!
    const lang = monacoLanguage(p.file)
    const old = ed.getModel()
    const original = monaco.editor.createModel(p.original, lang)
    const modified = monaco.editor.createModel(p.proposed, lang)
    ed.setModel({ original, modified })
    old?.original.dispose(); old?.modified.dispose()
    const sub = modified.onDidChangeContent(() => updateProposed(modified.getValue()))
    return () => sub.dispose()
  }, [p.file, p.original, p.title]) // eslint-disable-line react-hooks/exhaustive-deps

  const c = p.compare
  return (
    <div className="diff-view">
      <div className="diff-bar">
        <div className="diff-title">
          <strong>{p.kind === 'ai' ? 'Proposed change' : p.kind === 'reference' ? 'Your solution vs the reference' : 'Older version'}</strong>
          <span className="muted"> · {p.title}</span>
          <div className="diff-legend"><span>Left: your current <code>{p.file}</code></span><span>Right: {p.kind === 'ai' ? 'proposal (you can edit it)' : p.kind === 'reference' ? 'reference solution' : 'that version'}</span></div>
        </div>
        <div className="diff-actions">
          <button className="btn" onClick={compareProposal} disabled={c?.running} title="Run the same tests against both versions">{c?.running ? 'Testing both…' : 'Test both'}</button>
          <button className="btn" onClick={saveProposalAs} title="Keep yours unchanged; save the proposal as a new file">Save as new file</button>
          <button className="btn primary" onClick={applyProposal} title="Your current version is saved in History first">{p.kind === 'ai' ? 'Apply' : p.kind === 'reference' ? 'Replace mine with it' : 'Restore this version'}</button>
          <button className="btn ghost" onClick={() => setState({ proposal: null })}>{p.kind === 'reference' ? 'Close' : 'Discard'}</button>
        </div>
      </div>
      <div className="diff-host" ref={host} />
    </div>
  )
}

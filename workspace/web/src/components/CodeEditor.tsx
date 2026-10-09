import { useEffect, useRef } from 'react'
import { editorThemeName, modelFor, monaco } from '../lib/monaco'
import { askAi, editActive, getState, run, saveFile, setState, useStore, visualize, type AiAction } from '../lib/store'

/** The editor actions that use your selection. Also in the right-click menu. */
export const SELECTION_ACTIONS: { action: AiAction | 'show-visual'; label: string; key?: number }[] = [
  { action: 'explain', label: 'Explain this', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE },
  { action: 'show-visual', label: 'Show what this does visually' },
  { action: 'error', label: 'Explain why this error happened' },
  { action: 'example', label: 'Give me a small example' },
  { action: 'hint', label: 'Give me a hint' },
  { action: 'compare', label: 'Compare another approach' },
]

let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null
const cursorListeners = new Set<(line: number, col: number) => void>()
export function onCursor(f: (line: number, col: number) => void) { cursorListeners.add(f); return () => cursorListeners.delete(f) }

/** The selected text, or the word/line under the cursor when nothing is selected. */
export function currentSelection(): { text: string; lines: [number, number] } | null {
  const ed = editorInstance
  const model = ed?.getModel()
  const sel = ed?.getSelection()
  if (!ed || !model || !sel) return null
  if (!sel.isEmpty()) return { text: model.getValueInRange(sel), lines: [sel.startLineNumber, sel.endLineNumber] }
  const line = sel.startLineNumber
  const word = model.getWordAtPosition(sel.getPosition())
  const lineText = model.getLineContent(line)
  return { text: word && lineText.trim().length > 40 ? word.word : lineText.trim() || (word?.word ?? ''), lines: [line, line] }
}

export function runSelectionAction(action: AiAction | 'show-visual') {
  const sel = currentSelection()
  if (!sel || !sel.text.trim()) return
  if (action === 'show-visual') {
    // Real execution first: jump the visualizer to where these lines run, then explain alongside.
    const s = getState()
    const fresh = s.trace?.trace && s.trace.file === s.active && s.trace.source === s.open.find((f) => f.path === s.active)?.content
    if (fresh) {
      const steps = s.trace!.trace!.steps
      const i = steps.findIndex((st) => st.line >= sel.lines[0] && st.line <= sel.lines[1])
      setState({ focusLines: sel.lines, rightTab: 'visualize', rightOpen: true, ...(i >= 0 ? { step: i } : {}) })
    } else {
      visualize({ jumpTo: sel.lines })
    }
    askAi({ action: 'visual', selection: sel.text, lines: sel.lines })
    return
  }
  askAi({ action, selection: sel.text, lines: sel.lines })
}

export function revealLine(line: number) {
  editorInstance?.revealLineInCenter(line)
  editorInstance?.setPosition({ lineNumber: line, column: 1 })
  editorInstance?.focus()
}

export const focusEditor = () => editorInstance?.focus()

export function CodeEditor() {
  const host = useRef<HTMLDivElement>(null)
  const active = useStore((s) => s.active)
  const file = useStore((s) => s.open.find((f) => f.path === s.active))
  const diagnostics = useStore((s) => (s.active ? s.diagnostics[s.active] : undefined))
  const trace = useStore((s) => s.trace)
  const step = useStore((s) => s.step)
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)

  useEffect(() => {
    const ed = monaco.editor.create(host.current!, {
      theme: editorThemeName(), automaticLayout: true, fontSize: 14, minimap: { enabled: false },
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'SF Mono', Consolas, monospace",
      fontLigatures: false, // show << as two characters, like the compiler sees it
      scrollBeyondLastLine: false, tabSize: 4, glyphMargin: true, renderWhitespace: 'selection',
      padding: { top: 10 }, smoothScrolling: true, cursorSmoothCaretAnimation: 'on', roundedSelection: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    })
    editorInstance = ed
    decorations.current = ed.createDecorationsCollection()
    ed.onDidChangeModelContent(() => {
      const v = ed.getValue()
      if (getState().open.find((f) => f.path === getState().active)?.content !== v) editActive(v)
    })
    ed.onDidChangeCursorPosition((e) => cursorListeners.forEach((f) => f(e.position.lineNumber, e.position.column)))
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveFile())
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run())
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => visualize())
    SELECTION_ACTIONS.forEach((a, i) => ed.addAction({
      id: `lab.${a.action}`, label: a.label, contextMenuGroupId: '0_lab', contextMenuOrder: i,
      keybindings: a.key ? [a.key] : undefined, run: () => runSelectionAction(a.action),
    }))
    return () => { ed.dispose(); editorInstance = null }
  }, [])

  // Switch model when the active file changes.
  useEffect(() => {
    const ed = editorInstance
    if (!ed) return
    if (!active || !file) { ed.setModel(null); return }
    const model = modelFor(active, file.content)
    if (ed.getModel() !== model) ed.setModel(model)
  }, [active, file?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  // External content changes (applied proposal, restored version) flow into the model.
  useEffect(() => {
    const model = editorInstance?.getModel()
    if (model && file && model.getValue() !== file.content) model.pushEditOperations([], [{ range: model.getFullModelRange(), text: file.content }], () => null)
  }, [file?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compiler/runtime errors as squiggles.
  useEffect(() => {
    const model = editorInstance?.getModel()
    if (!model) return
    monaco.editor.setModelMarkers(model, 'lab', (diagnostics ?? []).filter((d) => d.line <= model.getLineCount()).map((d) => ({
      startLineNumber: d.line, startColumn: d.col ?? 1, endLineNumber: d.line, endColumn: model.getLineMaxColumn(d.line),
      message: `${d.phase === 'runtime' ? 'Runtime: ' : ''}${d.message}`,
      severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
    })))
  }, [diagnostics, active])

  // Visualizer: highlight the line that just ran and the next line to run.
  useEffect(() => {
    const steps = trace?.trace?.steps
    if (!steps?.length || trace?.file !== active) { decorations.current?.clear(); return }
    const cur = steps[step], prev = steps[step - 1]
    const ds: monaco.editor.IModelDeltaDecoration[] = []
    if (prev && prev.line !== cur?.line) ds.push({ range: new monaco.Range(prev.line, 1, prev.line, 1), options: { isWholeLine: true, className: 'line-prev', glyphMarginClassName: 'glyph-prev' } })
    if (cur) ds.push({ range: new monaco.Range(cur.line, 1, cur.line, 1), options: { isWholeLine: true, className: cur.event === 'error' || cur.event === 'exception' ? 'line-error' : 'line-next', glyphMarginClassName: 'glyph-next' } })
    decorations.current?.set(ds)
    if (cur) editorInstance?.revealLineInCenterIfOutsideViewport(cur.line)
  }, [trace, step, active])

  return <div className="code-editor" ref={host} />
}

import { useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { BottomPanel } from './components/BottomPanel'
import { askText, Dialogs } from './components/Dialogs'
import { runSelectionAction, SELECTION_ACTIONS } from './components/CodeEditor'
import { EditorArea } from './components/EditorArea'
import { ExplainPanel } from './components/ExplainPanel'
import { FileExplorer, starterFor } from './components/FileExplorer'
import { HistoryPanel } from './components/HistoryPanel'
import { NotesPanel } from './components/NotesPanel'
import { PracticePanel } from './components/PracticePanel'
import { Visualizer } from './components/Visualizer'
import { askAi, createFile, run, setState, stop, uploadFiles, useStore, visualize } from './lib/store'

export function App() {
  const focus = useStore((s) => s.focusMode)
  const showNotes = useStore((s) => s.showNotes)
  const left = usePanelRef(), right = usePanelRef(), bottom = usePanelRef()

  // Distraction-free mode: collapse everything around the editor (panels stay alive).
  useEffect(() => {
    for (const p of [left, right, bottom]) {
      if (focus) p.current?.collapse()
      else if (p.current?.isCollapsed()) p.current.expand()
    }
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focus) setState({ focusMode: false })
      if (e.key === 'F11' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f')) { e.preventDefault(); setState({ focusMode: !focus }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus])

  return (
    <div className={`app ${focus ? 'focus' : ''}`}>
      <Toolbar />
      <SandboxBanner />
      <div className="workspace">
        <Group orientation="horizontal" id="lab-h">
          <Panel id="left" panelRef={left} defaultSize="19%" minSize="12%" collapsible collapsedSize="0%">
            <LeftPanel />
          </Panel>
          <Separator className="sep v" />
          <Panel id="center" minSize="25%">
            <Group orientation="vertical" id="lab-v">
              <Panel id="editor" defaultSize="66%" minSize="20%"><EditorArea /></Panel>
              <Separator className="sep h" />
              <Panel id="bottom" panelRef={bottom} defaultSize="34%" minSize="10%" collapsible collapsedSize="0%"><BottomPanel /></Panel>
            </Group>
          </Panel>
          <Separator className="sep v" />
          <Panel id="right" panelRef={right} defaultSize="31%" minSize="15%" collapsible collapsedSize="0%">
            {showNotes ? (
              <Group orientation="vertical" id="lab-r">
                <Panel id="rtop" defaultSize="55%" minSize="15%"><RightPanel /></Panel>
                <Separator className="sep h" />
                <Panel id="notes" defaultSize="45%" minSize="15%"><NotesPanel /></Panel>
              </Group>
            ) : <RightPanel />}
          </Panel>
        </Group>
      </div>
      <Toast />
      <Dialogs />
    </div>
  )
}

function Toolbar() {
  const active = useStore((s) => s.active)
  const runState = useStore((s) => s.run)
  const tracing = useStore((s) => s.tracing)
  const focus = useStore((s) => s.focusMode)
  const showNotes = useStore((s) => s.showNotes)
  const connected = useStore((s) => s.connected)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<'explain' | 'upload' | 'ai' | null>(null)
  const running = runState && runState.status !== 'done'

  const newFile = async () => {
    const name = await askText('New file name (folders allowed, e.g. week1/loops.cpp):', 'scratch/main.cpp')
    if (name) createFile(name, starterFor(name))
  }

  return (
    <header className="toolbar" onClick={() => menu && setMenu(null)}>
      <div className="brand">Arzin Lab <span className="muted">workspace</span></div>
      <div className="tb-group">
        <button className="btn" onClick={newFile}>New File</button>
        <div className="dropdown">
          <button className="btn" onClick={(e) => { e.stopPropagation(); setMenu(menu === 'upload' ? null : 'upload') }}>Upload ▾</button>
          {menu === 'upload' && (
            <div className="menu">
              <button onClick={() => fileInput.current?.click()}>Files…</button>
              <button onClick={() => folderInput.current?.click()}>A whole project folder…</button>
            </div>
          )}
        </div>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }} />
        <input ref={folderInput} type="file" hidden {...{ webkitdirectory: '' }} onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }} />
      </div>
      <div className="tb-group">
        <button className="btn run" onClick={run} disabled={!active || !!running} title="Compile & run (Ctrl+Enter)">{runState?.status === 'compiling' ? 'Compiling…' : running ? 'Running…' : '▶ Run'}</button>
        <button className="btn danger" onClick={stop} disabled={!running} title="Stop the running program">■ Stop</button>
        <button className="btn viz" onClick={() => visualize()} disabled={!active || tracing} title="Run and record every step (Ctrl+Shift+Enter)">{tracing ? 'Tracing…' : '◉ Visualize'}</button>
      </div>
      <div className="tb-group">
        <div className="dropdown split">
          <button className="btn" onClick={() => runSelectionAction('explain')} disabled={!active} title="Explain the selected code (Ctrl+Shift+E)">Explain Selection</button>
          <button className="btn caret" disabled={!active} onClick={(e) => { e.stopPropagation(); setMenu(menu === 'explain' ? null : 'explain') }}>▾</button>
          {menu === 'explain' && (
            <div className="menu">
              {SELECTION_ACTIONS.map((a) => <button key={a.action} onClick={() => runSelectionAction(a.action)}>{a.label}</button>)}
            </div>
          )}
        </div>
        <div className="dropdown">
          <button className="btn" disabled={!active} onClick={(e) => { e.stopPropagation(); setMenu(menu === 'ai' ? null : 'ai') }}>Improve ▾</button>
          {menu === 'ai' && (
            <div className="menu">
              <button onClick={() => askAi({ action: 'fix' })}>Suggest a fix (shown as a diff)</button>
              <button onClick={() => askAi({ action: 'optimize' })}>Optimize &amp; compare with mine</button>
              <button onClick={() => askAi({ action: 'compare' })}>Show another approach</button>
            </div>
          )}
        </div>
      </div>
      <div className="tb-spacer" />
      <div className="tb-group">
        <button className={`btn ghost ${showNotes ? 'on' : ''}`} onClick={() => setState({ showNotes: !showNotes })} title="Notes & whiteboard for this file">Notes</button>
        <button className={`btn ghost ${focus ? 'on' : ''}`} onClick={() => setState({ focusMode: !focus })} title="Distraction-free (Ctrl+Shift+F, Esc to exit)">Focus</button>
        <SandboxPill />
        {!connected && <span className="pill bad">server offline</span>}
      </div>
    </header>
  )
}

function SandboxPill() {
  const sb = useStore((s) => s.sandbox)
  const cls = sb.state === 'ready' ? 'ok' : sb.state === 'building' || sb.state === 'starting' ? 'busy' : 'bad'
  return <span className={`pill ${cls}`} title={sb.message}>sandbox: {sb.state}</span>
}

function SandboxBanner() {
  const sb = useStore((s) => s.sandbox)
  if (sb.state === 'ready') return null
  return (
    <div className={`top-banner ${sb.state}`}>
      {sb.state === 'no-docker' && <>Docker isn't running, so code can't run yet. Start <b>Docker Desktop</b> and the sandbox connects automatically. You can still edit files, take notes and ask questions.</>}
      {sb.state === 'building' && <>Building the sandbox image with compilers for C, C++, Python, Node and Java (first time only, a few minutes): <code>{sb.message}</code></>}
      {sb.state === 'starting' && <>{sb.message}</>}
      {sb.state === 'error' && <>{sb.message}</>}
    </div>
  )
}

function LeftPanel() {
  const tab = useStore((s) => s.leftTab)
  return (
    <div className="left-panel">
      <div className="subtabs">
        {(['files', 'practice', 'history'] as const).map((t) => (
          <button key={t} className={`subtab ${tab === t ? 'active' : ''}`} onClick={() => setState({ leftTab: t })}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      <div className="left-body">
        {tab === 'files' && <FileExplorer />}
        {tab === 'practice' && <PracticePanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>
    </div>
  )
}

function RightPanel() {
  const tab = useStore((s) => s.rightTab)
  const streaming = useStore((s) => s.threads.some((t) => t.status === 'streaming'))
  return (
    <div className="right-panel">
      <div className="subtabs">
        <button className={`subtab ${tab === 'visualize' ? 'active' : ''}`} onClick={() => setState({ rightTab: 'visualize' })}>Visualize</button>
        <button className={`subtab ${tab === 'explain' ? 'active' : ''}`} onClick={() => setState({ rightTab: 'explain' })}>Explain{streaming && tab !== 'explain' ? ' •' : ''}</button>
      </div>
      <div className="right-body">
        <div hidden={tab !== 'visualize'} className="fill"><Visualizer /></div>
        <div hidden={tab !== 'explain'} className="fill"><ExplainPanel /></div>
      </div>
    </div>
  )
}

function Toast() {
  const t = useStore((s) => s.toast)
  return t ? <div className="toast" onClick={() => setState({ toast: null })}>{t}</div> : null
}

import {
  ChevronDown, Code2, FolderTree, History, Maximize2, Minimize2, Moon, PanelBottom, PanelLeft, PanelRight,
  PenLine, Play, Search, Sparkles, Square, Sun, Target, Wand2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { Board } from './components/Board'
import { BoardsPanel } from './components/BoardsPanel'
import { BottomPanel } from './components/BottomPanel'
import { onCursor, runSelectionAction, SELECTION_ACTIONS } from './components/CodeEditor'
import { CommandPalette } from './components/CommandPalette'
import { askText, Dialogs } from './components/Dialogs'
import { EditorArea } from './components/EditorArea'
import { ExplainPanel } from './components/ExplainPanel'
import { FileExplorer, starterFor } from './components/FileExplorer'
import { HistoryPanel } from './components/HistoryPanel'
import { NotesPanel } from './components/NotesPanel'
import { PracticePanel } from './components/PracticePanel'
import { Visualizer } from './components/Visualizer'
import {
  askAi, boardName, createFile, languageOf, run, setState, showRight, showSide, stop, uploadFiles, useStore, visualize,
  type State,
} from './lib/store'
import { toggleTheme, useTheme } from './lib/theme'

export function App() {
  // Only the layout fields: subscribing to the whole store would re-render on every AI token.
  const s = {
    sideOpen: useStore((x) => x.sideOpen), rightOpen: useStore((x) => x.rightOpen), bottomOpen: useStore((x) => x.bottomOpen),
    focusMode: useStore((x) => x.focusMode), paletteOpen: useStore((x) => x.paletteOpen), mode: useStore((x) => x.mode),
  }
  const left = usePanelRef(), right = usePanelRef(), bottom = usePanelRef()
  const [animating, setAnimating] = useState(false)
  const animTimer = useRef(0)

  // Panels stay mounted (the terminal keeps running) and collapse/expand smoothly.
  const sideVisible = s.sideOpen && !s.focusMode
  const rightVisible = s.rightOpen && !s.focusMode
  const bottomVisible = s.bottomOpen && !s.focusMode
  useEffect(() => {
    setAnimating(true)
    clearTimeout(animTimer.current)
    animTimer.current = window.setTimeout(() => setAnimating(false), 260)
    const sync = (p: typeof left, open: boolean) => {
      if (!p.current) return
      if (open && p.current.isCollapsed()) p.current.expand()
      if (!open && !p.current.isCollapsed()) p.current.collapse()
    }
    sync(left, sideVisible); sync(right, rightVisible); sync(bottom, bottomVisible)
  }, [sideVisible, rightVisible, bottomVisible, s.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Global shortcuts (capture phase, so they work inside the editor too).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      let handled = true
      if (mod && k === 'k') setState((x) => ({ paletteOpen: !x.paletteOpen }))
      else if (mod && k === 'p' && !e.shiftKey) setState({ paletteOpen: true })
      else if (mod && e.altKey && k === 'b') setState((x) => ({ rightOpen: !x.rightOpen }))
      else if (mod && k === 'b') setState((x) => ({ sideOpen: !x.sideOpen }))
      else if (mod && k === 'j') setState((x) => ({ bottomOpen: !x.bottomOpen, mode: 'code' }))
      else if (mod && k === '1') setState({ mode: 'code' })
      else if (mod && k === '2') setState({ mode: 'board' })
      else if (mod && e.shiftKey && k === 'f') setState((x) => ({ focusMode: !x.focusMode }))
      else if (e.key === 'Escape' && s.focusMode && !s.paletteOpen) setState({ focusMode: false })
      else handled = false
      if (handled) { e.preventDefault(); e.stopPropagation() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [s.focusMode, s.paletteOpen])

  const closeOnDrag = (key: 'sideOpen' | 'rightOpen' | 'bottomOpen') => (size: { asPercentage: number }) => {
    if (size.asPercentage === 0 && !s.focusMode && s[key]) setState({ [key]: false } as Partial<State>)
  }

  return (
    <div className={`app ${s.focusMode ? 'focus' : ''}`}>
      <TopBar />
      <SandboxBanner />
      <div className="body">
        <ActivityBar />
        <div className={`main ${animating ? 'animating' : ''}`}>
          <Group orientation="horizontal" id="lab-h">
            <Panel id="side" panelRef={left} defaultSize="20%" minSize="13%" collapsible collapsedSize="0%" onResize={closeOnDrag('sideOpen')}>
              <div className="card"><SidePanel /></div>
            </Panel>
            <Separator className="sep v" />
            <Panel id="center" minSize="28%">
              <div className="center" hidden={s.mode !== 'code'}>
                <Group orientation="vertical" id="lab-v">
                  <Panel id="editor" defaultSize="64%" minSize="20%"><div className="card"><EditorArea /></div></Panel>
                  <Separator className="sep h" />
                  <Panel id="bottom" panelRef={bottom} defaultSize="36%" minSize="12%" collapsible collapsedSize="0%" onResize={closeOnDrag('bottomOpen')}>
                    <div className="card"><BottomPanel /></div>
                  </Panel>
                </Group>
              </div>
              <div className="center card" hidden={s.mode !== 'board'}><Board /></div>
            </Panel>
            <Separator className="sep v" />
            <Panel id="right" panelRef={right} defaultSize="30%" minSize="18%" collapsible collapsedSize="0%" onResize={closeOnDrag('rightOpen')}>
              <div className="card"><RightPanel /></div>
            </Panel>
          </Group>
        </div>
      </div>
      <StatusBar />
      <CommandPalette />
      <Dialogs />
      <Toast />
    </div>
  )
}

// ---------------- top bar ----------------

function TopBar() {
  const mode = useStore((s) => s.mode)
  const active = useStore((s) => s.active)
  const board = useStore((s) => s.activeBoard)
  const runState = useStore((s) => s.run)
  const tracing = useStore((s) => s.tracing)
  const focus = useStore((s) => s.focusMode)
  const theme = useTheme()
  const [menu, setMenu] = useState<'explain' | 'improve' | 'new' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const running = !!runState && runState.status !== 'done'

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  const crumbs = mode === 'code' ? (active?.split('/') ?? []) : board ? ['boards', boardName(board)] : ['boards']
  const newFile = async () => {
    const name = await askText('New file name (folders allowed, e.g. week1/loops.cpp):', 'scratch/main.cpp')
    if (name) createFile(name, starterFor(name))
  }

  return (
    <header className="topbar">
      <div className="tb-left">
        <div className="logo"><Code2 size={16} /></div>
        <span className="brand">Arzin Lab</span>
        <span className="crumb-sep">/</span>
        <div className="crumbs" title={crumbs.join('/')}>
          {crumbs.length ? crumbs.map((c, i) => <span key={i} className={i === crumbs.length - 1 ? 'crumb last' : 'crumb'}>{c}</span>) : <span className="crumb muted">no file open</span>}
        </div>
      </div>

      <div className="mode-switch" role="tablist" aria-label="Mode">
        <button className={mode === 'code' ? 'on' : ''} onClick={() => setState({ mode: 'code' })} title="Code (Ctrl+1)"><Code2 size={14} /> <span className="lbl">Code</span></button>
        <button className={mode === 'board' ? 'on' : ''} onClick={() => setState({ mode: 'board', sideView: 'boards', sideOpen: true })} title="Whiteboard (Ctrl+2)"><PenLine size={14} /> <span className="lbl">Board</span></button>
      </div>

      <div className="tb-right">
        {mode === 'code' && (
          <>
            <div className="dropdown">
              <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setMenu(menu === 'new' ? null : 'new') }}><span className="lbl">New</span> <ChevronDown size={13} /></button>
              {menu === 'new' && (
                <div className="menu" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setMenu(null); newFile() }}>New file…</button>
                  <button onClick={() => { setMenu(null); fileInput.current?.click() }}>Upload files…</button>
                  <button onClick={() => { setMenu(null); folderInput.current?.click() }}>Upload a project folder…</button>
                </div>
              )}
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }} />
              <input ref={folderInput} type="file" hidden {...{ webkitdirectory: '' }} onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }} />
            </div>
            <div className="dropdown split">
              <button className="btn ghost" disabled={!active} onClick={() => runSelectionAction('explain')} title="Explain the selected code (Ctrl+Shift+E)"><Sparkles size={14} /> <span className="lbl">Explain</span></button>
              <button className="btn ghost caret" disabled={!active} onClick={(e) => { e.stopPropagation(); setMenu(menu === 'explain' ? null : 'explain') }}><ChevronDown size={13} /></button>
              {menu === 'explain' && (
                <div className="menu" onClick={(e) => e.stopPropagation()}>
                  {SELECTION_ACTIONS.map((a) => <button key={a.action} onClick={() => { setMenu(null); runSelectionAction(a.action) }}>{a.label}</button>)}
                  <hr />
                  <button onClick={() => { setMenu(null); askAi({ action: 'fix' }) }}>Suggest a fix (as a diff)</button>
                  <button onClick={() => { setMenu(null); askAi({ action: 'optimize' }) }}>Optimize &amp; compare with mine</button>
                  <button onClick={() => { setMenu(null); askAi({ action: 'compare' }) }}>Show another approach</button>
                </div>
              )}
            </div>
            <span className="tb-div" />
            <button className="btn viz" onClick={() => visualize()} disabled={!active || tracing} title="Run and record every step (Ctrl+Shift+Enter)"><Wand2 size={14} /> <span className="lbl">{tracing ? 'Tracing…' : 'Visualize'}</span></button>
            {running
              ? <button className="btn stop" onClick={stop} title="Stop the program"><Square size={12} fill="currentColor" /> Stop</button>
              : <button className="btn run" onClick={run} disabled={!active} title="Compile & run (Ctrl+Enter)"><Play size={13} fill="currentColor" /> Run</button>}
          </>
        )}
        {mode === 'board' && <span className="muted small hide-narrow">Lasso (L) around anything, then ask AI</span>}
        <span className="tb-div" />
        <button className="icon-btn" title="Search & commands (Ctrl+K)" onClick={() => setState({ paletteOpen: true })}><Search size={16} /></button>
        <button className="icon-btn" title={focus ? 'Exit focus (Esc)' : 'Focus mode (Ctrl+Shift+F)'} onClick={() => setState({ focusMode: !focus })}>{focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        <button className="icon-btn" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      </div>
    </header>
  )
}

// ---------------- activity bar (left icon rail) ----------------

function ActivityBar() {
  const view = useStore((s) => s.sideView)
  const open = useStore((s) => s.sideOpen)
  const rightOpen = useStore((s) => s.rightOpen)
  const bottomOpen = useStore((s) => s.bottomOpen)
  const mode = useStore((s) => s.mode)
  const items: { id: State['sideView']; icon: ReactNode; label: string }[] = [
    { id: 'files', icon: <FolderTree size={19} />, label: 'Files' },
    { id: 'practice', icon: <Target size={19} />, label: 'Practice' },
    { id: 'boards', icon: <PenLine size={19} />, label: 'Boards' },
    { id: 'history', icon: <History size={19} />, label: 'History' },
  ]
  return (
    <nav className="activity" aria-label="Views">
      {items.map((it) => (
        <button key={it.id} className={`act ${view === it.id && open ? 'on' : ''}`} title={it.label} onClick={() => { showSide(it.id); if (it.id === 'boards') setState({ mode: 'board' }) }}>
          {it.icon}<span className="act-label">{it.label}</span>
        </button>
      ))}
      <div className="act-spacer" />
      <button className={`act small ${open ? 'on-soft' : ''}`} title="Toggle side panel (Ctrl+B)" onClick={() => setState((s) => ({ sideOpen: !s.sideOpen }))}><PanelLeft size={17} /></button>
      {mode === 'code' && <button className={`act small ${bottomOpen ? 'on-soft' : ''}`} title="Toggle output & terminal (Ctrl+J)" onClick={() => setState((s) => ({ bottomOpen: !s.bottomOpen }))}><PanelBottom size={17} /></button>}
      <button className={`act small ${rightOpen ? 'on-soft' : ''}`} title="Toggle visualize & explain (Ctrl+Alt+B)" onClick={() => setState((s) => ({ rightOpen: !s.rightOpen }))}><PanelRight size={17} /></button>
    </nav>
  )
}

function SidePanel() {
  const view = useStore((s) => s.sideView)
  return (
    <div className="side">
      {view === 'files' && <FileExplorer />}
      {view === 'practice' && <PracticePanel />}
      {view === 'history' && <HistoryPanel />}
      {view === 'boards' && <BoardsPanel />}
    </div>
  )
}

function RightPanel() {
  const tab = useStore((s) => s.rightTab)
  const streaming = useStore((s) => s.threads.some((t) => t.status === 'streaming'))
  const tabs: [State['rightTab'], string][] = [['visualize', 'Visualize'], ['explain', 'Explain'], ['notes', 'Notes']]
  return (
    <div className="right">
      <div className="tabs-pill">
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => showRight(id)}>
            {label}{id === 'explain' && streaming && tab !== 'explain' ? <span className="live-dot" /> : null}
          </button>
        ))}
      </div>
      <div className="right-body">
        <div hidden={tab !== 'visualize'} className="fill"><Visualizer /></div>
        <div hidden={tab !== 'explain'} className="fill"><ExplainPanel /></div>
        <div hidden={tab !== 'notes'} className="fill"><NotesPanel /></div>
      </div>
    </div>
  )
}

// ---------------- status bar ----------------

function StatusBar() {
  const sb = useStore((s) => s.sandbox)
  const connected = useStore((s) => s.connected)
  const runState = useStore((s) => s.run)
  const mode = useStore((s) => s.mode)
  const nErr = useStore((s) => Object.values(s.diagnostics).flat().filter((d) => d.severity === 'error').length)
  const nWarn = useStore((s) => Object.values(s.diagnostics).flat().filter((d) => d.severity === 'warning').length)
  const lang = useStore((s) => languageOf(s.active))
  const [pos, setPos] = useState<[number, number]>([1, 1])
  useEffect(() => { const off = onCursor((l, c) => setPos([l, c])); return () => { off() } }, [])
  const sbState = !connected ? 'bad' : sb.state === 'ready' ? 'ok' : sb.state === 'building' || sb.state === 'starting' ? 'busy' : 'bad'

  return (
    <footer className="statusbar">
      <span className={`st-item st-${sbState}`} title={sb.message}><span className="dot" />{!connected ? 'Server offline' : sb.state === 'ready' ? 'Sandbox ready' : `Sandbox: ${sb.state}`}</span>
      <button className="st-item" onClick={() => setState({ mode: 'code', bottomOpen: true, bottomTab: 'problems' })} title="Problems">
        ✖ {nErr} &nbsp;⚠ {nWarn}
      </button>
      {runState && <span className="st-item">{runState.status === 'done' ? (runState.exit?.code === 0 ? 'Last run: OK' : `Last run: ${runState.exit?.description}`) : runState.status === 'compiling' ? 'Compiling…' : 'Running…'}</span>}
      <span className="st-spacer" />
      {mode === 'code' && <span className="st-item">Ln {pos[0]}, Col {pos[1]}</span>}
      {mode === 'code' && lang && <span className="st-item">{lang.name} · {lang.trace ? 'run + visualize' : 'run only'}</span>}
      <span className="st-item">Ctrl+K commands</span>
    </footer>
  )
}

function SandboxBanner() {
  const sb = useStore((s) => s.sandbox)
  if (sb.state === 'ready' || sb.state === 'starting') return null
  return (
    <div className={`top-banner ${sb.state}`}>
      {sb.state === 'no-docker' && <>Docker isn't running, so code can't run yet. Start <b>Docker Desktop</b> and the sandbox connects automatically. Editing, boards, notes and questions still work.</>}
      {sb.state === 'building' && <>Building the sandbox (first time only, a few minutes): <code>{sb.message}</code></>}
      {sb.state === 'error' && <>{sb.message}</>}
    </div>
  )
}

function Toast() {
  const t = useStore((s) => s.toast)
  return t ? <div className="toast" onClick={() => setState({ toast: null })}>{t}</div> : null
}

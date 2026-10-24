// Ctrl+K: jump to any file, board or problem, or run any command, without touching the mouse.
import { Command, FileCode2, PenLine, Search, Target } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { allFiles, boardList, boardName, createFile, newBoard, openBoard, openFile, run, runTests, setState, showSide, stop, useStore, visualize } from '../lib/store'
import { toggleTheme } from '../lib/theme'
import { runSelectionAction } from './CodeEditor'
import { askText } from './Dialogs'
import { starterFor } from './FileExplorer'

interface Entry { id: string; label: string; hint?: string; kind: 'file' | 'board' | 'problem' | 'command'; run: () => void }

/** Subsequence match: "vlp" matches "vector_loop.cpp". Higher score = better. */
function score(query: string, text: string): number {
  if (!query) return 1
  const q = query.toLowerCase(), t = text.toLowerCase()
  if (t.includes(q)) return 100 - t.indexOf(q) + (t.split('/').pop()!.startsWith(q) ? 50 : 0)
  let ti = 0, s = 0
  for (const ch of q) {
    const i = t.indexOf(ch, ti)
    if (i < 0) return 0
    s += i === ti ? 3 : 1
    ti = i + 1
  }
  return s
}

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen)
  const tree = useStore((s) => s.tree)
  const problems = useStore((s) => s.problems)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => input.current?.focus(), 0) } }, [open])

  const entries = useMemo<Entry[]>(() => {
    const close = (f: () => void) => () => { setState({ paletteOpen: false }); f() }
    const cmds: Entry[] = [
      { id: 'run', label: 'Run current file', hint: 'Ctrl+Enter', kind: 'command', run: close(() => run()) },
      { id: 'viz', label: 'Visualize current file', hint: 'Ctrl+Shift+Enter', kind: 'command', run: close(() => visualize()) },
      { id: 'stop', label: 'Stop the running program', kind: 'command', run: close(() => stop()) },
      { id: 'tests', label: 'Run tests', kind: 'command', run: close(() => runTests()) },
      { id: 'explain', label: 'Explain selection', hint: 'Ctrl+Shift+E', kind: 'command', run: close(() => runSelectionAction('explain')) },
      { id: 'newfile', label: 'New file…', kind: 'command', run: close(async () => { const n = await askText('New file name:', 'scratch/main.cpp'); if (n) createFile(n, starterFor(n)) }) },
      { id: 'newboard', label: 'New board…', kind: 'command', run: close(async () => { const n = await askText('Name the new board:', `board-${new Date().toISOString().slice(0, 10)}`); if (n) newBoard(n) }) },
      { id: 'code', label: 'Switch to Code', hint: 'Ctrl+1', kind: 'command', run: close(() => setState({ mode: 'code' })) },
      { id: 'board', label: 'Switch to Board', hint: 'Ctrl+2', kind: 'command', run: close(() => setState({ mode: 'board' })) },
      { id: 'theme', label: 'Toggle light / dark theme', kind: 'command', run: close(toggleTheme) },
      { id: 'side', label: 'Toggle side panel', hint: 'Ctrl+B', kind: 'command', run: close(() => setState((s) => ({ sideOpen: !s.sideOpen }))) },
      { id: 'bottom', label: 'Toggle output / terminal panel', hint: 'Ctrl+J', kind: 'command', run: close(() => setState((s) => ({ bottomOpen: !s.bottomOpen }))) },
      { id: 'right', label: 'Toggle visualize / explain panel', hint: 'Ctrl+Alt+B', kind: 'command', run: close(() => setState((s) => ({ rightOpen: !s.rightOpen }))) },
      { id: 'focus', label: 'Focus mode (editor only)', hint: 'Ctrl+Shift+F', kind: 'command', run: close(() => setState((s) => ({ focusMode: !s.focusMode }))) },
      { id: 'terminal', label: 'Open terminal', kind: 'command', run: close(() => setState({ mode: 'code', bottomOpen: true, bottomTab: 'terminal' })) },
      { id: 'practice', label: 'Show practice problems', kind: 'command', run: close(() => showSide('practice')) },
      { id: 'history', label: 'Show file history', kind: 'command', run: close(() => showSide('history')) },
    ]
    const fileEntries: Entry[] = allFiles(tree).filter((p) => !p.endsWith('.board.json')).map((p) => ({ id: `f:${p}`, label: p, kind: 'file', run: close(() => openFile(p)) }))
    const boardEntries: Entry[] = boardList(tree).map((p) => ({ id: `b:${p}`, label: boardName(p), hint: 'board', kind: 'board', run: close(() => openBoard(p)) }))
    const probEntries: Entry[] = problems.map((p) => ({ id: `p:${p.slug}`, label: p.title, hint: `${p.topic} · ${p.difficulty}`, kind: 'problem', run: close(() => { openFile(`${p.folder}/${p.starter}`); showSide('practice') }) }))
    return [...cmds, ...boardEntries, ...probEntries, ...fileEntries]
  }, [tree, problems])

  const shown = useMemo(() => {
    const query = q.startsWith('>') ? q.slice(1).trim() : q.trim()
    const pool = q.startsWith('>') ? entries.filter((e) => e.kind === 'command') : entries
    return pool.map((e) => ({ e, s: score(query, e.label) })).filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (query ? 0 : kindOrder(a.e) - kindOrder(b.e))).slice(0, 40).map((x) => x.e)
  }, [q, entries])

  if (!open) return null
  const choose = (e?: Entry) => e?.run()
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setState({ paletteOpen: false })}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <Search size={16} />
          <input ref={input} value={q} placeholder="Search files, boards, problems… or type > for commands"
            onChange={(e) => { setQ(e.target.value); setIdx(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, shown.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); choose(shown[idx]) }
              else if (e.key === 'Escape') setState({ paletteOpen: false })
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {shown.map((e, i) => {
            const Icon = e.kind === 'file' ? FileCode2 : e.kind === 'board' ? PenLine : e.kind === 'problem' ? Target : Command
            return (
              <button key={e.id} className={`palette-row ${i === idx ? 'on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => choose(e)}>
                <Icon size={15} className="row-icon" /><span className="row-name">{e.label}</span>{e.hint && <span className="row-hint">{e.hint}</span>}
              </button>
            )
          })}
          {!shown.length && <div className="pane-empty">No matches</div>}
        </div>
      </div>
    </div>
  )
}

const kindOrder = (e: Entry) => ({ command: 0, board: 2, problem: 1, file: 3 })[e.kind]
export const openPalette = () => setState({ paletteOpen: true })

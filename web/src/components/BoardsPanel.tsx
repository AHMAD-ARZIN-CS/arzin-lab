import { PenLine, Plus } from 'lucide-react'
import { askConfirm, askText } from './Dialogs'
import { boardList, boardName, deletePath, newBoard, openBoard, renamePath, useStore } from '../lib/store'

export function BoardsPanel() {
  const tree = useStore((s) => s.tree)
  const active = useStore((s) => s.activeBoard)
  const mode = useStore((s) => s.mode)
  const boards = boardList(tree)

  const create = async () => {
    const name = await askText('Name the new board:', `board-${new Date().toISOString().slice(0, 10)}`)
    if (name) newBoard(name)
  }

  return (
    <div className="side-section">
      <div className="side-head">
        <span>Boards</span>
        <button className="icon-btn" title="New board" onClick={create}><Plus size={15} /></button>
      </div>
      {boards.length === 0 && (
        <div className="side-empty">
          <p>Boards are notebooks for handwriting, sketches and pasted problems.</p>
          <button className="btn primary small" onClick={create}>New board</button>
        </div>
      )}
      <div className="list">
        {boards.map((b) => (
          <div key={b} className={`list-row ${b === active && mode === 'board' ? 'active' : ''}`} onClick={() => openBoard(b)}
            onContextMenu={async (e) => {
              e.preventDefault()
              const name = await askText('Rename board (clear the name to delete it):', boardName(b))
              if (name === null) return
              if (!name.trim()) { if (await askConfirm(`Move board "${boardName(b)}" to the trash?`, true)) deletePath(b); return }
              const to = b.replace(/[^/]+\.board\.json$/, `${name.trim()}.board.json`)
              if (to !== b) renamePath(b, to)
            }}>
            <PenLine size={14} className="row-icon" />
            <span className="row-name">{boardName(b)}</span>
          </div>
        ))}
      </div>
      <p className="side-foot">Right-click a board to rename or delete it. Boards are saved in <code>boards/</code>.</p>
    </div>
  )
}

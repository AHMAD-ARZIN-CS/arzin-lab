import { useState } from 'react'
import { files, type TreeNode } from '../lib/api'
import { askConfirm, askText } from './Dialogs'
import { createFile, createFolder, deletePath, openFile, refreshTree, renamePath, uploadFiles, useStore } from '../lib/store'

const ICON: Record<string, string> = { cpp: 'C++', cc: 'C++', c: 'C', h: 'H', hpp: 'H', py: 'Py', js: 'JS', java: 'Jv', sh: '$', md: 'Md', json: '{}', txt: 'Tx' }

export function FileExplorer() {
  const tree = useStore((s) => s.tree)
  const active = useStore((s) => s.active)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode | null } | null>(null)
  const [dropDir, setDropDir] = useState<string | null>(null)

  const toggle = (p: string) => setCollapsed((c) => { const n = new Set(c); n.has(p) ? n.delete(p) : n.add(p); return n })
  const dirOf = (n: TreeNode | null) => (!n ? '' : n.type === 'dir' ? n.path : n.path.split('/').slice(0, -1).join('/'))

  const newFile = async (dir: string) => {
    const name = await askText(`New file in ${dir || 'the workspace root'} (e.g. main.cpp, notes.md):`, 'main.cpp')
    if (name) createFile(dir ? `${dir}/${name}` : name, starterFor(name))
  }
  const newFolder = async (dir: string) => {
    const name = await askText(`New folder in ${dir || 'the workspace root'}:`)
    if (name) createFolder(dir ? `${dir}/${name}` : name)
  }

  const render = (nodes: TreeNode[], depth: number) => nodes.map((n) => {
    const ext = n.name.split('.').pop()?.toLowerCase() ?? ''
    return (
      <div key={n.path}>
        <div
          className={`tree-row ${n.path === active ? 'active' : ''} ${dropDir === n.path ? 'drop' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => (n.type === 'dir' ? toggle(n.path) : openFile(n.path))}
          onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, node: n }) }}
          onDragOver={(e) => { if (n.type === 'dir') { e.preventDefault(); setDropDir(n.path) } }}
          onDragLeave={() => setDropDir(null)}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDropDir(null); if (n.type === 'dir') uploadFiles(e.dataTransfer.files, n.path) }}
        >
          {n.type === 'dir'
            ? <span className="tree-caret">{collapsed.has(n.path) ? '▸' : '▾'}</span>
            : <span className={`tree-icon ext-${ext}`}>{ICON[ext] ?? '·'}</span>}
          <span className="tree-name">{n.name}</span>
        </div>
        {n.type === 'dir' && !collapsed.has(n.path) && render(n.children ?? [], depth + 1)}
      </div>
    )
  })

  const act = async (what: string) => {
    const n = menu?.node ?? null
    setMenu(null)
    if (what === 'new-file') newFile(dirOf(n))
    else if (what === 'new-folder') newFolder(dirOf(n))
    else if (what === 'rename' && n) {
      const to = await askText('Rename / move to (change the folder part to move it):', n.path)
      if (to && to !== n.path) renamePath(n.path, to)
    } else if (what === 'delete' && n) {
      if (await askConfirm(`Move ${n.path} to the trash? You can recover it from .lab/trash.`, true)) deletePath(n.path)
    } else if (what === 'download' && n) files.download(n.path)
    else if (what === 'duplicate' && n) {
      const dot = n.path.lastIndexOf('.')
      const to = await askText('Copy to:', dot > 0 ? `${n.path.slice(0, dot)}_copy${n.path.slice(dot)}` : `${n.path}_copy`)
      if (to) createFile(to, await files.read(n.path))
    }
  }

  return (
    <div className="explorer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files) }}
      onContextMenu={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, node: null }) } }}
      onClick={() => setMenu(null)}>
      <div className="panel-head">
        <span>Files</span>
        <div className="head-actions">
          <button className="icon-btn" title="New file" onClick={() => newFile(dirOf(null))}>+</button>
          <button className="icon-btn" title="New folder" onClick={() => newFolder('')}>⊞</button>
          <button className="icon-btn" title="Refresh (files changed in the terminal)" onClick={refreshTree}>↻</button>
        </div>
      </div>
      <div className="tree">{render(tree, 0)}</div>
      <p className="explorer-hint muted">Drop files here to upload. Right-click for more. Deleted files go to <code>.lab/trash</code>.</p>
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => act('new-file')}>New file…</button>
          <button onClick={() => act('new-folder')}>New folder…</button>
          {menu.node && <>
            <hr />
            <button onClick={() => act('rename')}>Rename / move…</button>
            {menu.node.type === 'file' && <button onClick={() => act('duplicate')}>Duplicate…</button>}
            {menu.node.type === 'file' && <button onClick={() => act('download')}>Download</button>}
            <button className="danger" onClick={() => act('delete')}>Delete</button>
          </>}
        </div>
      )}
    </div>
  )
}

export function starterFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'cpp' || ext === 'cc') return '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n'
  if (ext === 'c') return '#include <stdio.h>\n\nint main(void) {\n    \n    return 0;\n}\n'
  if (ext === 'java') {
    const cls = name.split('/').pop()!.replace(/\.java$/, '')
    return `public class ${cls} {\n    public static void main(String[] args) {\n        \n    }\n}\n`
  }
  if (ext === 'py') return '\n'
  return ''
}

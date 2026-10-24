import { useEffect, useState } from 'react'
import { files, type Version } from '../lib/api'
import { propose, toast, useStore } from '../lib/store'

const LABELS: Record<string, string> = {
  original: 'Original (before this session\'s first save)', autosave: 'Autosave', manual: 'Saved version',
  'before-ai-change': 'Before applying an AI change', 'before-restore': 'Before restoring an older version',
}

/** Every file's earlier versions. Click one to compare it with the current code, and restore if you want. */
export function HistoryPanel() {
  const active = useStore((s) => s.active)
  const saved = useStore((s) => s.open.find((f) => f.path === s.active)?.saved)
  const [versions, setVersions] = useState<Version[]>([])
  const load = () => { if (active) files.versions(active).then(setVersions, () => setVersions([])) }
  useEffect(load, [active, saved])

  if (!active) return <div className="muted pad">Open a file to see its history.</div>
  return (
    <div className="history">
      <div className="panel-head">
        <span>History · {active.split('/').pop()}</span>
        <button className="btn small" onClick={async () => { await files.snapshot(active, 'manual'); load(); toast('Version saved') }}>Save version now</button>
      </div>
      {versions.length === 0 && <p className="muted pad">No earlier versions yet. Versions are kept automatically: the original before your first save, every 10 minutes of edits, and before any AI change is applied.</p>}
      {versions.map((v) => (
        <button key={v.id} className="version" onClick={async () => propose(await files.version(active, v.id), `${LABELS[v.label] ?? v.label} · ${new Date(v.time).toLocaleString()}`, 'version', v.id)}>
          <span>{LABELS[v.label] ?? v.label}</span>
          <span className="muted small">{new Date(v.time).toLocaleString()} · {v.size} B</span>
        </button>
      ))}
    </div>
  )
}

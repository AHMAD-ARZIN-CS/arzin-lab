// Excalidraw whiteboard (MIT). Loaded only when opened, because it is large.
import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useEffect, useRef, useState } from 'react'
import { files } from '../lib/api'

export default function Whiteboard({ path }: { path: string }) {
  const [initial, setInitial] = useState<{ elements: unknown[]; appState: Record<string, unknown>; files?: unknown } | null | undefined>(undefined)
  const timer = useRef(0)
  const last = useRef('')

  useEffect(() => {
    files.read(path).then((t) => {
      last.current = t
      const d = JSON.parse(t)
      setInitial({ elements: d.elements ?? [], appState: { ...(d.appState ?? {}), collaborators: new Map() }, files: d.files })
    }, () => setInitial(null))
  }, [path])

  if (initial === undefined) return <div className="muted pad">Loading…</div>
  return (
    <div className="whiteboard">
      <Excalidraw
        theme="dark"
        initialData={(initial ?? { elements: [], appState: {} }) as never}
        onChange={(elements, appState, bin) => {
          clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            const json = serializeAsJSON(elements, appState, bin, 'local')
            if (json !== last.current && elements.length) { last.current = json; files.write(path, json) }
          }, 1200)
        }}
      />
    </div>
  )
}

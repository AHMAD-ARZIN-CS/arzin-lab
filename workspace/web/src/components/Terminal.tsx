import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { newId, request, send } from '../lib/socket'
import { refreshTree, useStore } from '../lib/store'

/** A real bash shell inside the sandbox, starting in your code folder (/work). */
export function Terminal({ visible }: { visible: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const sandbox = useStore((s) => s.sandbox.state)
  const [session, setSession] = useState(0)
  const [exited, setExited] = useState(false)

  useEffect(() => {
    if (sandbox !== 'ready') return
    const term = new XTerm({
      fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: 13, cursorBlink: true,
      theme: { background: '#0b0d18', foreground: '#dfe5ff', cursor: '#6ec8ff' }, scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current!)
    const id = newId()
    setExited(false)
    try { fit.fit() } catch { /* hidden */ }
    const sub = request({ t: 'term-open', id, cols: term.cols, rows: term.rows }, (m) => {
      if (m.t === 'term-data') term.write(m.data)
      else if (m.t === 'term-exit') { setExited(true); refreshTree() }
      else if (m.t === 'error') term.write(`\r\n\x1b[31m${m.message}\x1b[0m\r\n`)
    })
    const input = term.onData((data) => {
      send({ t: 'term-in', id, data })
      // Files created by commands (touch, g++ -o, mkdir) should appear in the explorer.
      if (data.includes('\r')) setTimeout(refreshTree, 700)
    })
    const ro = new ResizeObserver(() => {
      if (!host.current?.offsetParent) return
      try { fit.fit(); send({ t: 'term-resize', id, cols: term.cols, rows: term.rows }) } catch { /* not laid out */ }
    })
    ro.observe(host.current!)
    return () => { ro.disconnect(); input.dispose(); send({ t: 'term-close', id }); sub.unsubscribe(); term.dispose() }
  }, [sandbox, session])

  return (
    <div className="terminal-wrap" hidden={!visible}>
      {sandbox !== 'ready' && <div className="muted pad">The terminal opens when the sandbox is ready.</div>}
      {exited && <button className="btn term-restart" onClick={() => setSession((n) => n + 1)}>Shell exited — start a new one</button>}
      <div className="terminal-host" ref={host} />
    </div>
  )
}

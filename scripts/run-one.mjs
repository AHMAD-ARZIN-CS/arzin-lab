// Debug helper: run one file through the workspace server and print every message.
//   node scripts/run-one.mjs <path-in-my-code> [stdin]
import WebSocket from 'ws'
import { PORT } from './paths.mjs'

const [file, stdin = ''] = process.argv.slice(2)
const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { Origin: `http://localhost:${PORT}` } })
ws.on('open', () => ws.send(JSON.stringify({ t: 'run', id: 'one', file, stdin })))
ws.on('message', (raw) => {
  const m = JSON.parse(raw)
  if (m.id !== 'one') return
  console.log(JSON.stringify(m))
  if (m.t === 'exit') process.exit(0)
})

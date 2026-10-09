// One WebSocket to the server. Requests carry an id; replies with that id go to the
// handler registered for it. Reconnects automatically if the server restarts.
type Handler = (m: Record<string, any>) => void

let ws: WebSocket | null = null
let queue: string[] = []
const byId = new Map<string, Handler>()
const byType = new Map<string, Set<Handler>>()
let connected = false
const connListeners = new Set<(c: boolean) => void>()

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
  ws.onopen = () => {
    connected = true
    connListeners.forEach((f) => f(true))
    queue.forEach((m) => ws!.send(m))
    queue = []
  }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    byType.get(m.t)?.forEach((h) => h(m))
    if (m.id) byId.get(m.id)?.(m)
  }
  ws.onclose = () => {
    connected = false
    connListeners.forEach((f) => f(false))
    setTimeout(connect, 1000)
  }
}
connect()

export const newId = () => Math.random().toString(36).slice(2, 10)

export function send(m: Record<string, unknown>) {
  const s = JSON.stringify(m)
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(s)
  else queue.push(s)
}

/** Send a request and receive every reply for it until `unsubscribe()` is called. */
export function request(m: Record<string, unknown> & { t: string }, onReply: Handler): { id: string; unsubscribe: () => void } {
  const id = (m.id as string) ?? newId()
  byId.set(id, onReply)
  send({ ...m, id })
  return { id, unsubscribe: () => byId.delete(id) }
}

export function onType(t: string, h: Handler) {
  if (!byType.has(t)) byType.set(t, new Set())
  byType.get(t)!.add(h)
  return () => byType.get(t)!.delete(h)
}

export function onConnection(f: (c: boolean) => void) {
  connListeners.add(f)
  f(connected)
  return () => connListeners.delete(f)
}

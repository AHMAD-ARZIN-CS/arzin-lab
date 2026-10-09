// Workspace server: files API (HTTP) + live sessions (WebSocket) for run, terminal, trace, AI.
// It listens on 127.0.0.1 only. Because this server can run code, it also defends against
// web pages you visit trying to call it: API requests need a custom header (browsers block
// cross-site pages from sending it), and WebSockets must come from the workspace's own origin.
import express, { type NextFunction, type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { DEV_WEB_PORT, PORT, ROOT, WORKSPACE_DIR } from './config.js'
import * as files from './files.js'
import { publicLanguages } from './languages.js'
import { createProblem, listProblems, seedRoot } from './practice.js'
import { getBuildLog, getStatus, watchDocker } from './sandbox.js'
import { handleSocket } from './sessions.js'

const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `localhost:${DEV_WEB_PORT}`, `127.0.0.1:${DEV_WEB_PORT}`])
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map((h) => `http://${h}`))

const app = express()
app.disable('x-powered-by')

app.use((req, res, next) => {
  // DNS-rebinding defense: only answer requests addressed to localhost.
  if (!ALLOWED_HOSTS.has(req.headers.host ?? '')) return res.status(403).send('Forbidden host')
  next()
})
app.use('/api', (req, res, next) => {
  if (req.headers['x-lab'] !== '1') return res.status(403).json({ error: 'Missing X-Lab header' })
  next()
})
app.use('/api', express.json({ limit: '8mb' }))

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).then((data) => { if (!res.headersSent) res.json(data ?? { ok: true }) }).catch(next)

const q = (req: Request, name: string) => {
  const v = req.query[name]
  if (typeof v !== 'string') throw new files.FsError(`missing ?${name}=`)
  return v
}

app.get('/api/status', wrap(async () => ({ sandbox: getStatus(), buildLog: getBuildLog(), root: ROOT, languages: publicLanguages() })))
app.get('/api/tree', wrap(async () => files.tree()))
app.get('/api/file', wrap(async (req) => ({ path: q(req, 'path'), content: await files.readText(q(req, 'path')) })))
app.put('/api/file', wrap(async (req) => { await files.writeFile(req.body.path, String(req.body.content ?? ''), { snapshot: req.body.snapshot }) }))
app.post('/api/mkdir', wrap(async (req) => { await files.mkdir(req.body.path) }))
app.post('/api/rename', wrap(async (req) => { await files.rename(req.body.from, req.body.to) }))
app.post('/api/delete', wrap(async (req) => { await files.remove(req.body.path) }))
app.get('/api/raw', wrap(async (req, res) => {
  const p = q(req, 'path')
  res.setHeader('Content-Disposition', `attachment; filename="${path.posix.basename(p).replace(/"/g, '')}"`)
  res.type('application/octet-stream').send(await files.readBytes(p))
}))
app.put('/api/raw', express.raw({ type: '*/*', limit: '8mb' }), wrap(async (req) => {
  await files.writeFile(q(req, 'path'), req.body as Buffer)
}))
app.get('/api/versions', wrap(async (req) => files.listVersions(q(req, 'path'))))
app.get('/api/version', wrap(async (req) => ({ content: await files.readVersion(q(req, 'path'), q(req, 'id')) })))
app.post('/api/snapshot', wrap(async (req) => { await files.snapshot(req.body.path, req.body.label ?? 'manual') }))
app.get('/api/practice', wrap(async () => listProblems()))
app.post('/api/practice', wrap(async (req) => createProblem(req.body)))

app.use('/api', (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof files.FsError ? err.status : 500
  res.status(status).json({ error: err.message })
})

// Production: serve the built web app. (In development, Vite serves it on :5173.)
const dist = path.join(WORKSPACE_DIR, 'web', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const server = http.createServer(app)
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 })
server.on('upgrade', (req, socket, head) => {
  if (!ALLOWED_ORIGINS.has(req.headers.origin ?? '') || !ALLOWED_HOSTS.has(req.headers.host ?? '') || req.url !== '/ws') {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
    return socket.destroy()
  }
  wss.handleUpgrade(req, socket, head, (ws) => handleSocket(ws))
})

await files.ensureRoot(seedRoot)
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Arzin Lab workspace server on http://localhost:${PORT}`)
  console.log(`Your code folder: ${ROOT}`)
})
watchDocker()

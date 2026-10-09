// The file system API. Every path from the browser is RELATIVE to ROOT and is checked
// so nothing can escape it (no "../../Windows/System32", no symlinks pointing outside).
import fs from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { LIMITS, META_DIR, ROOT } from './config.js'

export class FsError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const HIDDEN = new Set(['.lab', '.git', 'node_modules', '__pycache__', '.DS_Store'])

export function resolveSafe(rel: string): string {
  if (typeof rel !== 'string') throw new FsError('path must be a string')
  const cleaned = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (cleaned.split('/').some((p) => p === '..')) throw new FsError('".." is not allowed in paths')
  const abs = path.resolve(ROOT, cleaned)
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) throw new FsError('path escapes the workspace')
  // Follow symlinks for the part that exists and make sure it is still inside ROOT.
  let probe = abs
  while (!existsSync(probe) && probe !== ROOT) probe = path.dirname(probe)
  const real = realpathSync(probe)
  const realRoot = realpathSync(ROOT)
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new FsError('path escapes the workspace')
  return abs
}

export const toRel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join('/')

export interface TreeNode { name: string; path: string; type: 'file' | 'dir'; children?: TreeNode[] }

export async function tree(rel = ''): Promise<TreeNode[]> {
  const dir = resolveSafe(rel)
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nodes: TreeNode[] = []
  for (const e of entries) {
    if (HIDDEN.has(e.name)) continue
    const p = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) nodes.push({ name: e.name, path: p, type: 'dir', children: await tree(p) })
    else if (e.isFile()) nodes.push({ name: e.name, path: p, type: 'file' })
  }
  return nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
}

export async function readText(rel: string): Promise<string> {
  const abs = resolveSafe(rel)
  const st = await fs.stat(abs).catch(() => { throw new FsError(`No such file: ${rel}`, 404) })
  if (!st.isFile()) throw new FsError(`${rel} is not a file`)
  if (st.size > LIMITS.maxFileBytes) throw new FsError(`${rel} is too large to open (${st.size} bytes)`)
  return fs.readFile(abs, 'utf8')
}

export async function readBytes(rel: string): Promise<Buffer> {
  return fs.readFile(resolveSafe(rel))
}

export async function writeFile(rel: string, content: string | Buffer, opts: { snapshot?: string } = {}) {
  const abs = resolveSafe(rel)
  if (Buffer.byteLength(content) > LIMITS.maxFileBytes) throw new FsError('file too large')
  await fs.mkdir(path.dirname(abs), { recursive: true })
  if (existsSync(abs)) await autoSnapshot(rel, opts.snapshot)
  await fs.writeFile(abs, content)
}

export async function mkdir(rel: string) {
  await fs.mkdir(resolveSafe(rel), { recursive: true })
}

export async function rename(from: string, to: string) {
  const a = resolveSafe(from), b = resolveSafe(to)
  if (existsSync(b)) throw new FsError(`${to} already exists`, 409)
  await fs.mkdir(path.dirname(b), { recursive: true })
  await fs.rename(a, b)
}

/** Delete = move to .lab/trash, so nothing is ever lost by a misclick. */
export async function remove(rel: string) {
  const abs = resolveSafe(rel)
  if (abs === ROOT) throw new FsError('cannot delete the workspace root')
  const dest = path.join(META_DIR, 'trash', new Date().toISOString().replace(/[:.]/g, '-'), rel)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.rename(abs, dest)
}

// ---------------- version history ----------------
// Every file gets snapshots: the first time it's overwritten in a session ("original"),
// before AI changes are applied, when you click "Save version", and at most every 10 minutes.

const histDir = (rel: string) => path.join(META_DIR, 'history', ...rel.split('/'))
const lastAuto = new Map<string, number>()

export interface Version { id: string; label: string; time: string; size: number }

export async function snapshot(rel: string, label: string) {
  const abs = resolveSafe(rel)
  if (!existsSync(abs)) return
  const content = await fs.readFile(abs)
  const dir = histDir(rel)
  await fs.mkdir(dir, { recursive: true })
  const existing = await listVersions(rel)
  if (existing[0]) {
    const prev = await fs.readFile(path.join(dir, existing[0].id))
    if (prev.equals(content)) return // nothing changed since the last snapshot
  }
  const id = `${Date.now()}__${label.replace(/[^a-z0-9-]+/gi, '-').slice(0, 40)}`
  await fs.writeFile(path.join(dir, id), content)
}

async function autoSnapshot(rel: string, label?: string) {
  if (label) return snapshot(rel, label)
  const last = lastAuto.get(rel)
  if (last === undefined) {
    lastAuto.set(rel, Date.now())
    return snapshot(rel, 'original')
  }
  if (Date.now() - last > 10 * 60_000) {
    lastAuto.set(rel, Date.now())
    return snapshot(rel, 'autosave')
  }
}

export async function listVersions(rel: string): Promise<Version[]> {
  resolveSafe(rel)
  const dir = histDir(rel)
  if (!existsSync(dir)) return []
  const out: Version[] = []
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue
    const [ms, label] = e.name.split('__')
    const st = await fs.stat(path.join(dir, e.name))
    out.push({ id: e.name, label: label ?? '', time: new Date(Number(ms)).toISOString(), size: st.size })
  }
  return out.sort((a, b) => b.id.localeCompare(a.id))
}

export async function readVersion(rel: string, id: string): Promise<string> {
  resolveSafe(rel)
  if (!/^\d+__[\w-]*$/.test(id)) throw new FsError('bad version id')
  return fs.readFile(path.join(histDir(rel), id), 'utf8')
}

export async function ensureRoot(seed: () => Promise<void>) {
  const fresh = !existsSync(ROOT)
  await fs.mkdir(path.join(META_DIR, 'tmp'), { recursive: true })
  if (fresh || !existsSync(path.join(ROOT, 'practice'))) await seed()
}

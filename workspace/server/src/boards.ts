// Board storage, built like a tiny database instead of one ever-growing file.
//
//   boards/notes.board.json            ← manifest: paper, view, list of segments (small)
//   boards/notes.board/seg-0001.json   ← up to SEG_ITEMS items each ("pages" of strokes)
//   boards/notes.board/seg-0002.json
//   boards/notes.board/assets/<sha>.png ← pictures, stored once, named by their content hash
//
// Why: new strokes are appended at the end, so saving only rewrites the LAST segment —
// full segments are never touched again (the same idea as database pages / log segments).
// Pictures live in their own files: inline base64 made them 33% bigger and bloated every save,
// and naming them by hash means the same screenshot pasted twice is stored once.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { FsError, resolveSafe } from './files.js'

const SEG_ITEMS = 300               // items per segment
const SEG_BYTES = 2 * 1024 * 1024   // or ~2 MB, whichever comes first

interface Manifest { version: 2; paper: string; view?: unknown; segments: string[]; itemCount: number }
type Item = { id: string; kind: string; src?: string; [k: string]: unknown }

export const boardDir = (rel: string) => rel.replace(/\.board\.json$/, '.board')

function checkBoardPath(rel: string) {
  if (!/\.board\.json$/.test(rel)) throw new FsError('not a board file')
  return resolveSafe(rel)
}

/** Load a board (either format) as one document for the editor. */
export async function loadBoard(rel: string) {
  const abs = checkBoardPath(rel)
  const raw = JSON.parse(await fs.readFile(abs, 'utf8'))
  if (raw.version !== 2) return { ...raw, version: 1, items: raw.items ?? [] } // old single-file board (or Excalidraw)
  const m = raw as Manifest
  const dir = resolveSafe(boardDir(rel))
  const items: Item[] = []
  for (const seg of m.segments) {
    if (!/^seg-\d+\.json$/.test(seg)) continue
    try { items.push(...JSON.parse(await fs.readFile(path.join(dir, seg), 'utf8'))) } catch { /* a missing segment loses only its own strokes */ }
  }
  return { version: 1, paper: m.paper, view: m.view, items }
}

const lastWritten = new Map<string, string>() // segment file → hash of what we last wrote

async function writeIfChanged(file: string, content: string) {
  const h = crypto.createHash('sha1').update(content).digest('hex')
  if (lastWritten.get(file) === h) return false
  if (!lastWritten.has(file) && existsSync(file)) {
    const old = await fs.readFile(file, 'utf8').catch(() => '')
    if (crypto.createHash('sha1').update(old).digest('hex') === h) { lastWritten.set(file, h); return false }
  }
  await fs.writeFile(file, content)
  lastWritten.set(file, h)
  return true
}

/** Pictures embedded the old way (data: URLs) move into assets/<sha>.<ext>. */
async function externalizeImages(items: Item[], dir: string) {
  for (const it of items) {
    const m = typeof it.src === 'string' && it.src.match(/^data:image\/(png|jpeg|gif|webp);base64,(.+)$/)
    if (!m) continue
    const bytes = Buffer.from(m[2], 'base64')
    const name = `${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
    await fs.mkdir(path.join(dir, 'assets'), { recursive: true })
    const file = path.join(dir, 'assets', name)
    if (!existsSync(file)) await fs.writeFile(file, bytes)
    it.src = `asset:${name}`
  }
}

/** Save: split items into segments, write only the segments that changed. */
export async function saveBoard(rel: string, doc: { paper?: string; view?: unknown; items: Item[] }) {
  const abs = checkBoardPath(rel)
  if (!Array.isArray(doc?.items)) throw new FsError('board items must be a list')
  const dir = resolveSafe(boardDir(rel))
  await fs.mkdir(dir, { recursive: true })
  await externalizeImages(doc.items, dir)

  const segments: string[] = []
  let chunk: Item[] = [], bytes = 0
  const flush = async () => {
    if (!chunk.length) return
    const name = `seg-${String(segments.length + 1).padStart(4, '0')}.json`
    await writeIfChanged(path.join(dir, name), JSON.stringify(chunk))
    segments.push(name)
    chunk = []; bytes = 0
  }
  for (const it of doc.items) {
    const size = JSON.stringify(it).length
    if (chunk.length >= SEG_ITEMS || (chunk.length && bytes + size > SEG_BYTES)) await flush()
    chunk.push(it); bytes += size
  }
  await flush()
  // Segments past the end (after deleting lots of strokes) are removed.
  for (const name of await fs.readdir(dir)) {
    if (/^seg-\d+\.json$/.test(name) && !segments.includes(name)) {
      await fs.rm(path.join(dir, name), { force: true })
      lastWritten.delete(path.join(dir, name))
    }
  }
  const manifest: Manifest = { version: 2, paper: doc.paper ?? 'dots', view: doc.view, segments, itemCount: doc.items.length }
  await fs.writeFile(abs, JSON.stringify(manifest, null, 1))
  return { segments: segments.length, items: doc.items.length }
}

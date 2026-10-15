// Checks the segmented board storage against a running server (throwaway board, cleaned up after).
//   node scripts/board-storage-test.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'my-code')
const BASE = 'http://localhost:4317'
const H = { 'X-Lab': '1', 'Content-Type': 'application/json' }
const BOARD = 'boards/zz-storage-test.board.json'
const DIR = path.join(ROOT, 'boards', 'zz-storage-test.board')
let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) fail++ }

const stroke = (i) => ({ id: `s${i}`, kind: 'pen', color: 'ink', size: 3.5, points: Array.from({ length: 60 }, (_, k) => [i * 3 + k * 0.5, 100 + Math.sin(k / 5) * 20, 0.5]) })
// a 1x1 red PNG, embedded the old way
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const items = [{ id: 'img', kind: 'image', src: png, x: 0, y: 0, w: 10, h: 10 }, ...Array.from({ length: 700 }, (_, i) => stroke(i))]

const put = (doc) => fetch(`${BASE}/api/board`, { method: 'PUT', headers: H, body: JSON.stringify({ path: BOARD, doc }) }).then((r) => r.json())
const get = () => fetch(`${BASE}/api/board?path=${encodeURIComponent(BOARD)}`, { headers: H }).then((r) => r.json())

try {
  // Boards are created as a file first (like "New board" does).
  fs.writeFileSync(path.join(ROOT, BOARD), JSON.stringify({ version: 1, paper: 'dots', items: [] }))
  const r1 = await put({ paper: 'dots', items })
  const segs = fs.readdirSync(DIR).filter((f) => f.startsWith('seg-')).sort()
  check('700 strokes split into segments of 300', r1.segments === 3 && segs.length === 3, JSON.stringify(r1))
  const assets = fs.existsSync(path.join(DIR, 'assets')) ? fs.readdirSync(path.join(DIR, 'assets')) : []
  check('embedded picture moved to assets/ (by content hash)', assets.length === 1 && assets[0].endsWith('.png'), assets.join(','))
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, BOARD), 'utf8'))
  check('manifest is small', fs.statSync(path.join(ROOT, BOARD)).size < 1000 && manifest.version === 2, `${fs.statSync(path.join(ROOT, BOARD)).size} bytes`)

  const back = await get()
  check('loads back all items in order', back.items.length === 701 && back.items[1].id === 's0' && back.items[700].id === 's699' && back.items[0].src.startsWith('asset:'), `${back.items.length} items, image src ${back.items[0].src}`)

  // Add one stroke: only the last segment should be rewritten.
  const before = segs.map((s) => fs.statSync(path.join(DIR, s)).mtimeMs)
  await new Promise((r) => setTimeout(r, 50))
  await put({ paper: 'dots', items: [...back.items, stroke(700)] })
  const after = segs.map((s) => fs.statSync(path.join(DIR, s)).mtimeMs)
  check('adding a stroke rewrites only the last segment', after[0] === before[0] && after[1] === before[1] && after[2] !== before[2], `mtimes changed: ${after.map((a, i) => a !== before[i])}`)

  // Delete most strokes: extra segments are removed.
  await put({ paper: 'dots', items: back.items.slice(0, 50) })
  check('deleting strokes removes empty segments', fs.readdirSync(DIR).filter((f) => f.startsWith('seg-')).length === 1)

  // Old single-file boards still load.
  fs.writeFileSync(path.join(ROOT, 'boards', 'zz-old.board.json'), JSON.stringify({ version: 1, paper: 'grid', items: [stroke(1)] }))
  const old = await fetch(`${BASE}/api/board?path=${encodeURIComponent('boards/zz-old.board.json')}`, { headers: H }).then((r) => r.json())
  check('old-format boards still load', old.items.length === 1 && old.paper === 'grid')

  // A deleted board can't be brought back by a late autosave.
  fs.rmSync(path.join(ROOT, BOARD))
  const late = await fetch(`${BASE}/api/board`, { method: 'PUT', headers: H, body: JSON.stringify({ path: BOARD, doc: { paper: 'dots', items: [] } }) })
  check('saving a deleted board is refused', late.status === 410 && !fs.existsSync(path.join(ROOT, BOARD)), `HTTP ${late.status}`)
} finally {
  fs.rmSync(DIR, { recursive: true, force: true })
  fs.rmSync(path.join(ROOT, BOARD), { force: true })
  fs.rmSync(path.join(ROOT, 'boards', 'zz-old.board.json'), { force: true })
}
console.log(fail ? `\n${fail} FAILED` : '\nAll board storage checks passed')
process.exit(fail ? 1 : 0)

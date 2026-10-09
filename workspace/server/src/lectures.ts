// Lecture slides: upload a PDF / PPTX / MD / TXT into lectures/<name>/, then the sandbox
// extracts the text and renders PDF pages to images (the file is never parsed on Windows).
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './config.js'
import { FsError, resolveSafe } from './files.js'
import { execCollect, toContainerPath } from './sandbox.js'

export interface LecturePage { n: number; text: string; image: string | null; images: string[] }
export interface Lecture { slug: string; title: string; source: string; kind: string; pages: LecturePage[]; warnings: string[] }

const LECT = path.join(ROOT, 'lectures')

export async function listLectures() {
  if (!existsSync(LECT)) return []
  const out = []
  for (const e of await fs.readdir(LECT, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    try {
      const doc = JSON.parse(await fs.readFile(path.join(LECT, e.name, 'lecture.json'), 'utf8'))
      out.push({ slug: e.name, title: e.name.replace(/-/g, ' '), source: doc.source, kind: doc.kind, pageCount: doc.pages.length, hasImages: doc.pages.some((p: LecturePage) => p.image || p.images?.length), warnings: doc.warnings ?? [] })
    } catch { out.push({ slug: e.name, title: e.name.replace(/-/g, ' '), source: '', kind: '', pageCount: 0, hasImages: false, warnings: ['Not processed yet'], pending: true }) }
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug))
}

export async function readLecture(slug: string): Promise<Lecture> {
  const dir = resolveSafe(`lectures/${slug}`)
  const doc = JSON.parse(await fs.readFile(path.join(dir, 'lecture.json'), 'utf8'))
  return { slug, title: slug.replace(/-/g, ' '), ...doc }
}

/** Text of the lecture for the AI, with page markers, capped so prompts stay reasonable. */
export async function lectureText(slug: string, maxChars = 60_000) {
  const l = await readLecture(slug)
  let text = l.pages.map((p) => `--- Slide ${p.n} ---\n${p.text}`).join('\n\n')
  if (text.length > maxChars) text = text.slice(0, maxChars) + '\n\n[... rest of the lecture truncated ...]'
  return { title: l.title, text }
}

/** Run the extractor in the sandbox on an uploaded file (path relative to your code folder). */
export async function importLecture(fileRel: string) {
  const m = fileRel.match(/^lectures\/([\w.-]+)\/[^/]+\.(pdf|pptx|md|txt)$/i)
  if (!m) throw new FsError('Upload slides as lectures/<name>/<file>.pdf|pptx|md|txt')
  resolveSafe(fileRel)
  const dirRel = `lectures/${m[1]}`
  const r = await execCollect(['timeout', '-s', 'KILL', '900', 'python3', '/opt/lab/slides.py', toContainerPath(fileRel), toContainerPath(dirRel)])
  const last = r.stdout.trim().split('\n').at(-1) ?? ''
  let info: { ok?: boolean; error?: string; pages?: number; warnings?: string[] } = {}
  try { info = JSON.parse(last) } catch { /* fall through */ }
  if (!info.ok) throw new Error(info.error ?? `Could not read the slides: ${(r.stderr || r.stdout).slice(-400)}`)
  return { slug: m[1], pages: info.pages ?? 0, warnings: info.warnings ?? [] }
}

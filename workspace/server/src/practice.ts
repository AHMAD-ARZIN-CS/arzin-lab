// Practice problems are just folders:  practice/<slug>/{problem.md, tests.json, main.cpp}
// You can edit them like any other file, and add your own with "New problem".
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { ROOT, WORKSPACE_DIR } from './config.js'
import { FsError, resolveSafe } from './files.js'

export interface ProblemMeta {
  slug: string
  title: string
  topic: string
  difficulty: string
  language: string
  starter: string
  folder: string
  testCount: number
}

export async function listProblems(): Promise<ProblemMeta[]> {
  const dir = path.join(ROOT, 'practice')
  if (!existsSync(dir)) return []
  const out: ProblemMeta[] = []
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    try {
      const meta = JSON.parse(await fs.readFile(path.join(dir, e.name, 'tests.json'), 'utf8'))
      out.push({
        slug: e.name, title: meta.title ?? e.name, topic: meta.topic ?? 'custom', difficulty: meta.difficulty ?? '',
        language: meta.language ?? 'cpp', starter: meta.starter ?? 'main.cpp',
        folder: `practice/${e.name}`, testCount: (meta.tests ?? []).length,
      })
    } catch { /* not a problem folder */ }
  }
  const order = ['fundamentals', 'debugging', 'data structures', 'algorithms', 'custom']
  return out.sort((a, b) => (order.indexOf(a.topic) - order.indexOf(b.topic)) || a.title.localeCompare(b.title))
}

const EXT: Record<string, string> = { cpp: 'cpp', c: 'c', python: 'py', javascript: 'js', java: 'java' }

export async function createProblem(p: { title: string; statement: string; starter?: string; language?: string; tests?: { input: string; expected: string }[]; topic?: string }) {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'problem'
  const rel = `practice/${slug}`
  const abs = resolveSafe(rel)
  if (existsSync(abs)) throw new FsError(`A problem named "${slug}" already exists`, 409)
  const language = p.language ?? 'cpp'
  const starter = `main.${EXT[language] ?? 'cpp'}`
  await fs.mkdir(abs, { recursive: true })
  await fs.writeFile(path.join(abs, 'problem.md'), `# ${p.title}\n\n${p.statement.trim()}\n`)
  await fs.writeFile(path.join(abs, 'tests.json'), JSON.stringify({
    title: p.title, topic: p.topic ?? 'custom', difficulty: '', language, starter, tests: p.tests ?? [],
  }, null, 2) + '\n')
  await fs.writeFile(path.join(abs, starter), p.starter?.trim() ? p.starter : '')
  return { folder: rel, starter: `${rel}/${starter}` }
}

/** First start: copy the starter set of problems and a hello-world into your code folder. */
export async function seedRoot() {
  const seed = path.join(WORKSPACE_DIR, 'seed')
  await fs.cp(seed, ROOT, { recursive: true, force: false, errorOnExist: false })
}

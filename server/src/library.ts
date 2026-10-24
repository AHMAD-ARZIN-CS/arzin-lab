// The problem library (built-in, verified), installing problems into your practice folder,
// reference solutions (only when you ask), and your progress.
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { META_DIR, ROOT, APP_DIR } from './config.js'
import { FsError, resolveSafe } from './files.js'

const LIB = path.join(APP_DIR, 'library')

interface LibProblem {
  slug: string; title: string; topic: string; difficulty: string; concepts: string[]
  statement: string; starter: string; tests: { name: string; input: string; expected: string }[]
}

let cache: LibProblem[] | null = null
async function problems(): Promise<LibProblem[]> {
  cache ??= JSON.parse(await fs.readFile(path.join(LIB, 'library.json'), 'utf8')).problems
  return cache!
}

// ---------- progress: my-code/progress.json (yours, so it's committed with your code) ----------

const PROGRESS = path.join(ROOT, 'progress.json')
interface Progress { solved: Record<string, string>; attempts: Record<string, number> }

export async function readProgress(): Promise<Progress> {
  try {
    const p = JSON.parse(await fs.readFile(PROGRESS, 'utf8'))
    return { solved: p.solved ?? {}, attempts: p.attempts ?? {} }
  } catch {
    return { solved: {}, attempts: {} }
  }
}

/** Called after every test run of a practice problem. Solved = every test passed. */
export async function recordAttempt(file: string, allPassed: boolean) {
  const m = file.match(/^practice\/([^/]+)\//)
  if (!m) return
  const p = await readProgress()
  p.attempts[m[1]] = (p.attempts[m[1]] ?? 0) + 1
  if (allPassed && !p.solved[m[1]]) p.solved[m[1]] = new Date().toISOString()
  await fs.writeFile(PROGRESS, JSON.stringify(p, null, 2) + '\n')
}

// ---------- library ----------

export async function listLibrary() {
  const progress = await readProgress()
  return (await problems()).map(({ slug, title, topic, difficulty, concepts, tests }) => ({
    slug, title, topic, difficulty, concepts, testCount: tests.length,
    installed: existsSync(path.join(ROOT, 'practice', slug)),
    solved: !!progress.solved[slug],
  }))
}

export async function installProblem(slug: string) {
  const p = (await problems()).find((x) => x.slug === slug)
  if (!p) throw new FsError(`No library problem "${slug}"`, 404)
  const dir = resolveSafe(`practice/${slug}`)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'problem.md'), p.statement)
  // Never overwrite your own code if the problem was installed before.
  if (!existsSync(path.join(dir, 'main.cpp'))) await fs.writeFile(path.join(dir, 'main.cpp'), p.starter)
  await fs.writeFile(path.join(dir, 'tests.json'), JSON.stringify({
    title: p.title, topic: p.topic, difficulty: p.difficulty, language: 'cpp', starter: 'main.cpp',
    source: 'library', concepts: p.concepts, tests: p.tests,
  }, null, 2) + '\n')
  return { folder: `practice/${slug}`, starter: `practice/${slug}/main.cpp` }
}

/** Reference solution: from the library, or the verified one saved when a problem was generated. */
export async function referenceSolution(slug: string): Promise<string> {
  if (!/^[\w-]+$/.test(slug)) throw new FsError('bad slug')
  const generated = path.join(META_DIR, 'solutions', `${slug}.cpp`)
  if (existsSync(generated)) return fs.readFile(generated, 'utf8')
  const lib = path.join(LIB, 'src', slug, 'solution.cpp')
  if (existsSync(lib)) return fs.readFile(lib, 'utf8')
  throw new FsError('No reference solution for this problem (it was written by you).', 404)
}

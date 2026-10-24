// Builds library/library.json from library/src/<slug>/.
// Expected outputs are never typed by hand: each reference solution is compiled and run in the
// sandbox, and its real output becomes the expected answer. Starters must compile too.
//   npx tsx scripts/build-library.ts        (Docker must be running)
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { META_DIR } from '../server/src/config.js'
import { toRel } from '../server/src/files.js'
import { languageFor } from '../server/src/languages.js'
import { compile, runOnce } from '../server/src/runner.js'
import { toContainerPath } from '../server/src/sandbox.js'

const LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'library')
const order: string[] = JSON.parse(await fs.readFile(path.join(LIB, 'order.json'), 'utf8'))
const lang = languageFor('x.cpp')!
const out = []
let failed = 0

for (const slug of order) {
  const dir = path.join(LIB, 'src', slug)
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'))
  const statement = await fs.readFile(path.join(dir, 'problem.md'), 'utf8')
  const starter = await fs.readFile(path.join(dir, 'starter.cpp'), 'utf8')
  const scratch = path.join(META_DIR, 'tmp', 'lib', slug)
  await fs.mkdir(scratch, { recursive: true })
  await fs.copyFile(path.join(dir, 'solution.cpp'), path.join(scratch, 'solution.cpp'))
  await fs.writeFile(path.join(scratch, 'starter.cpp'), starter)
  const solRel = toRel(path.join(scratch, 'solution.cpp'))
  const starterRel = toRel(path.join(scratch, 'starter.cpp'))

  const sc = await compile(starterRel, lang)
  if (!sc.ok) { console.log(`FAIL ${slug}: starter does not compile\n${sc.output}`); failed++; continue }
  const build = `/tmp/lab/build/lib_${slug.replace(/\W/g, '_')}`
  const c = await compile(solRel, lang, toContainerPath(solRel), build)
  if (!c.ok) { console.log(`FAIL ${slug}: solution does not compile\n${c.output}`); failed++; continue }

  const tests = []
  for (const t of meta.tests) {
    const r = await runOnce(lang, toContainerPath(solRel), build, t.input, 10)
    if (r.code !== 0) { console.log(`FAIL ${slug} / ${t.name}: ${r.description}\n${r.stderr}`); failed++; continue }
    tests.push({ name: t.name, input: t.input, expected: r.stdout.replace(/\s+$/, '') })
  }
  // The example in the statement is the first test, so it always matches the real answer.
  const ex = tests[0]
  const fullStatement = `${statement.trimEnd()}\n\n**Example**\n\nInput\n\`\`\`\n${ex.input.trimEnd() || '(empty line)'}\n\`\`\`\nOutput\n\`\`\`\n${ex.expected || '(nothing)'}\n\`\`\`\n`
  out.push({ ...meta, statement: fullStatement, starter, tests })
  console.log(`ok   ${slug.padEnd(28)} ${tests.length} tests   e.g. ${JSON.stringify(ex.expected.split('\n')[0]).slice(0, 50)}`)
}

await fs.rm(path.join(META_DIR, 'tmp', 'lib'), { recursive: true, force: true })
await fs.writeFile(path.join(LIB, 'library.json'), JSON.stringify({ version: 1, builtAt: new Date().toISOString(), problems: out }, null, 1) + '\n')
console.log(`\n${out.length} problems written to library/library.json${failed ? `, ${failed} FAILURES` : ''}`)
process.exit(failed ? 1 : 0)

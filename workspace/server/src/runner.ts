// Compile, run, stop, trace and test programs inside the sandbox.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { LIMITS, META_DIR } from './config.js'
import { readText, resolveSafe, toRel } from './files.js'
import { languageFor, type Language } from './languages.js'
import { demux, execCollect, execStart, exitCode, fromContainerPath, toContainerPath } from './sandbox.js'

export interface Diagnostic {
  file: string
  line: number
  col?: number
  severity: 'error' | 'warning' | 'note'
  message: string
  phase: 'compile' | 'runtime'
}

export interface CompileResult { ok: boolean; output: string; diagnostics: Diagnostic[]; ms: number }

const buildDir = (rel: string) => `/tmp/lab/build/${rel.replace(/[^a-zA-Z0-9]+/g, '_')}`

export function requireLanguage(rel: string): Language {
  const lang = languageFor(rel)
  if (!lang) throw new Error(`Don't know how to run ${path.posix.extname(rel) || 'files without an extension'} files yet. Supported: .cpp .c .py .js .java .sh`)
  return lang
}

// ---------- error parsing: turns compiler/runtime text into clickable line markers ----------

export function parseDiagnostics(text: string, phase: Diagnostic['phase']): Diagnostic[] {
  const out: Diagnostic[] = []
  const clean = fromContainerPath(text)
  for (const line of clean.split('\n')) {
    let m = line.match(/^(.+?):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/) // gcc/g++
    if (m) {
      out.push({ file: m[1], line: +m[2], col: +m[3], severity: m[4] === 'fatal error' ? 'error' : (m[4] as Diagnostic['severity']), message: m[5], phase })
      continue
    }
    m = line.match(/^(.+\.java):(\d+): (error|warning): (.*)$/) // javac
    if (m) out.push({ file: m[1], line: +m[2], severity: m[3] as Diagnostic['severity'], message: m[4], phase })
  }
  if (phase === 'runtime') {
    // Python: the deepest 'File "...", line N' in the traceback + the final "XError: message" line
    const py = [...clean.matchAll(/File "([^"]+)", line (\d+)/g)].filter((x) => !x[1].startsWith('/usr/'))
    const last = clean.trim().split('\n').at(-1) ?? ''
    if (py.length) out.push({ file: py.at(-1)![1], line: +py.at(-1)![2], severity: 'error', message: last, phase })
    // Node / Java stack frames: (file.js:12:5) or (Main.java:12)
    const js = clean.match(/^(\S+\.m?js):(\d+)\n/m)
    if (!py.length && js) out.push({ file: js[1], line: +js[2], severity: 'error', message: clean.match(/^\w*Error: .*$/m)?.[0] ?? 'Runtime error', phase })
    const java = clean.match(/at [\w.$<>]+\((\w+\.java):(\d+)\)/)
    if (!py.length && !js && java) out.push({ file: java[1], line: +java[2], severity: 'error', message: clean.match(/^Exception in thread .*$/m)?.[0] ?? 'Exception', phase })
  }
  return out
}

const SIGNAL_NAMES: Record<number, string> = {
  4: 'SIGILL (illegal instruction)', 6: 'SIGABRT (aborted: uncaught exception or failed assert)',
  8: 'SIGFPE (arithmetic error, e.g. division by zero)', 9: 'SIGKILL (killed: time limit or stopped)',
  11: 'SIGSEGV (segmentation fault: invalid memory access)', 24: 'SIGXCPU (CPU time limit exceeded: infinite loop?)',
  25: 'SIGXFSZ (output file too large)',
}
export const describeExit = (code: number) =>
  code > 128 && SIGNAL_NAMES[code - 128] ? `killed by signal ${SIGNAL_NAMES[code - 128]}` : `exit code ${code}`

// ---------- compile ----------

export async function compile(rel: string, lang: Language, srcPath = toContainerPath(rel), out = buildDir(rel)): Promise<CompileResult> {
  if (!lang.compile) return { ok: true, output: '', diagnostics: [], ms: 0 }
  const t0 = Date.now()
  const cmd = lang.compile(srcPath, out)
  const r = await execCollect(['sh', '-c', `mkdir -p '${out}' && exec "$@"`, 'sh', ...cmd])
  const output = fromContainerPath(r.stdout + r.stderr)
  return { ok: r.code === 0, output, diagnostics: parseDiagnostics(output, 'compile'), ms: Date.now() - t0 }
}

/** Wrap a command with limits. Writes its process-group id so Stop can kill the whole group. */
function limited(cmd: string[], id: string, cpu: number, wall: number) {
  const script = `mkdir -p /tmp/lab/run; echo $$ > /tmp/lab/run/${id}.pid; ulimit -t ${cpu}; ulimit -f 200000; exec timeout -s KILL ${wall} "$@"`
  return ['sh', '-c', script, 'sh', ...cmd]
}

// ---------- interactive run ----------

export interface RunHandlers {
  onCompile: (r: CompileResult) => void
  onStdout: (s: string) => void
  onStderr: (s: string) => void
  onExit: (r: { code: number; description: string; ms: number; diagnostics: Diagnostic[] }) => void
}

export interface RunControl { write(data: string): void; eof(): void; stop(): Promise<void> }

export async function startRun(rel: string, stdin: string, h: RunHandlers): Promise<RunControl | null> {
  const lang = requireLanguage(rel)
  resolveSafe(rel)
  const comp = await compile(rel, lang)
  h.onCompile(comp)
  if (!comp.ok) return null

  const id = crypto.randomBytes(6).toString('hex')
  const out = buildDir(rel)
  const cmd = limited(lang.run(toContainerPath(rel), out), id, LIMITS.runCpuSeconds, LIMITS.runWallSeconds)
  const workdir = path.posix.dirname(toContainerPath(rel))
  const { exec, stream } = await execStart(cmd, { stdin: true, env: lang.env, workdir })
  const t0 = Date.now()
  let stderrAll = ''
  demux(stream, h.onStdout, (s) => { stderrAll += s; h.onStderr(s) })
  let ended = false
  stream.on('end', async () => {
    if (ended) return
    ended = true
    const code = await exitCode(exec)
    h.onExit({ code, description: describeExit(code), ms: Date.now() - t0, diagnostics: parseDiagnostics(stderrAll, 'runtime') })
  })
  // Input box text goes in first. If it was provided, close stdin so programs that
  // "read until end of input" finish; if it was empty, keep stdin open for typing.
  if (stdin) {
    stream.write(stdin.endsWith('\n') ? stdin : stdin + '\n')
    stream.end()
  }
  return {
    write: (data) => { if (!ended && stream.writable) stream.write(data) },
    eof: () => { if (stream.writable) stream.end() },
    stop: async () => {
      await execCollect(['sh', '-c', `kill -KILL -- -$(cat /tmp/lab/run/${id}.pid) 2>/dev/null; true`])
    },
  }
}

// ---------- run once (tests, comparisons) with measurement ----------

export interface OnceResult { stdout: string; stderr: string; code: number; description: string; timedOut: boolean; wallMs: number | null; maxRssKb: number | null }

export async function runOnce(lang: Language, srcPath: string, out: string, input: string, wall = LIMITS.testWallSeconds): Promise<OnceResult> {
  const id = crypto.randomBytes(6).toString('hex')
  // Measured, not estimated: wall time from the clock around the process, peak memory (max RSS) from GNU time.
  const script = [
    'mkdir -p /tmp/lab/t', `ulimit -t ${wall}`, 'ulimit -f 200000',
    's=$(date +%s%N)',
    `/usr/bin/time -f "%M" -o /tmp/lab/t/${id} timeout -s KILL ${wall} "$@"; c=$?`,
    'e=$(date +%s%N)',
    `printf "\\n@@LAB@@ %s %s %s\\n" "$c" "$(( (e-s)/1000 ))" "$(tail -n1 /tmp/lab/t/${id} 2>/dev/null)" >&2`,
    'exit $c',
  ].join('; ')
  const r = await execCollect(['sh', '-c', script, 'sh', ...lang.run(srcPath, out)], { input, env: lang.env })
  const m = r.stderr.match(/\n?@@LAB@@ (\d+) (\d+) (\d*)\n?$/)
  const stderr = fromContainerPath(m ? r.stderr.slice(0, m.index) : r.stderr)
  const code = m ? +m[1] : r.code
  return {
    stdout: r.stdout.slice(0, 200_000), stderr: stderr.slice(0, 50_000), code, description: describeExit(code),
    timedOut: code === 137, wallMs: m ? Math.round(+m[2] / 100) / 10 : null, maxRssKb: m && m[3] ? +m[3] : null,
  }
}

// ---------- tests ----------

export interface TestCase { name?: string; input: string; expected: string }
export interface TestResult {
  name: string; input: string; expected: string; actual: string; stderr: string; pass: boolean; description: string
  wallMs: number | null; maxRssKb: number | null; timedOut: boolean
  /** Every measured wall time when the test was repeated (comparisons run each test 3x). */
  samples: number[]
}

const normalize = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim()

export async function runTests(rel: string, tests: TestCase[], srcRel = rel, repeat = 1): Promise<{ compile: CompileResult; results: TestResult[] }> {
  const lang = requireLanguage(rel)
  const out = buildDir(srcRel)
  const comp = await compile(srcRel, lang, toContainerPath(srcRel), out)
  if (!comp.ok) return { compile: comp, results: [] }
  const results: TestResult[] = []
  for (const [i, t] of tests.entries()) {
    const r = await runOnce(lang, toContainerPath(srcRel), out, t.input)
    const samples = r.wallMs === null ? [] : [r.wallMs]
    for (let k = 1; k < repeat && !r.timedOut; k++) {
      const again = await runOnce(lang, toContainerPath(srcRel), out, t.input)
      if (again.wallMs !== null) samples.push(again.wallMs)
    }
    const sorted = [...samples].sort((a, b) => a - b)
    results.push({
      name: t.name ?? `Test ${i + 1}`, input: t.input, expected: t.expected, actual: r.stdout, stderr: r.stderr,
      pass: r.code === 0 && normalize(r.stdout) === normalize(t.expected),
      description: r.description, wallMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      maxRssKb: r.maxRssKb, timedOut: r.timedOut, samples,
    })
  }
  return { compile: comp, results }
}

/** Find tests.json next to the file (practice problems keep their tests there). */
export async function testsFor(rel: string): Promise<TestCase[] | null> {
  const dir = path.posix.dirname(rel)
  try {
    const data = JSON.parse(await readText(dir === '.' ? 'tests.json' : `${dir}/tests.json`))
    return Array.isArray(data) ? data : data.tests ?? null
  } catch {
    return null
  }
}

/** Write a proposed version next to scratch space (same file name, so Java class names still match). */
export async function writeScratch(rel: string, content: string): Promise<string> {
  const dir = path.join(META_DIR, 'tmp', 'compare', crypto.randomBytes(4).toString('hex'))
  await fs.mkdir(dir, { recursive: true })
  const abs = path.join(dir, path.posix.basename(rel))
  await fs.writeFile(abs, content)
  return toRel(abs)
}

// ---------- tracing ----------

export async function traceFile(rel: string, stdin: string) {
  const lang = requireLanguage(rel)
  const source = await readText(rel)
  if (!lang.trace) return { supported: false as const, note: lang.traceNote ?? 'Tracing is not available for this language.', source }
  const id = crypto.randomBytes(6).toString('hex')
  const tmpRel = `.lab/tmp/${id}`
  await fs.writeFile(path.join(META_DIR, 'tmp', `${id}.in`), stdin)
  const inPath = toContainerPath(`${tmpRel}.in`), outPath = toContainerPath(`${tmpRel}.out`)
  const cleanup = () => Promise.all([`${id}.in`, `${id}.out`].map((f) => fs.rm(path.join(META_DIR, 'tmp', f), { force: true })))

  let compileResult: CompileResult | undefined
  let r
  if (lang.trace === 'gdb') {
    compileResult = await compile(rel, lang)
    if (!compileResult.ok) { await cleanup(); return { supported: true as const, compile: compileResult, source } }
    r = await execCollect(
      ['timeout', '-s', 'KILL', String(LIMITS.traceWallSeconds), 'gdb', '-q', '-batch', '-nx', '-x', '/opt/lab/gdbtrace.py', '--args', `${buildDir(rel)}/prog`],
      { env: [`TRACE_SRC=${toContainerPath(rel)}`, `TRACE_IN=${inPath}`, `TRACE_OUTFILE=${outPath}`, `TRACE_MAX_STEPS=${LIMITS.traceMaxSteps}`], workdir: path.posix.dirname(toContainerPath(rel)) },
    )
  } else {
    r = await execCollect(
      ['timeout', '-s', 'KILL', String(LIMITS.traceWallSeconds), 'python3', '/opt/lab/pytrace.py', toContainerPath(rel), inPath, String(LIMITS.traceMaxSteps)],
      { workdir: path.posix.dirname(toContainerPath(rel)) },
    )
  }
  const m = r.stdout.match(/@@TRACE_BEGIN@@\n([\s\S]*?)\n@@TRACE_END@@/)
  let trace
  if (m) {
    trace = JSON.parse(m[1])
    if (trace.output === undefined) trace.output = await fs.readFile(path.join(META_DIR, 'tmp', `${id}.out`), 'utf8').catch(() => '')
  } else {
    trace = { steps: [], error: r.code === 137 ? `Tracing took longer than ${LIMITS.traceWallSeconds}s and was stopped.` : `Tracer failed:\n${fromContainerPath(r.stderr || r.stdout).slice(-2000)}`, output: '' }
  }
  await cleanup()
  return { supported: true as const, compile: compileResult, trace, source }
}

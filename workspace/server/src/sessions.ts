// One WebSocket per browser tab. Messages are small JSON objects with a type `t` and an `id`
// that ties replies to the request (a run, a terminal, a trace...).
import { StringDecoder } from 'node:string_decoder'
import type { WebSocket } from 'ws'
import { ask, buildPrompt, type AiContext, type AiHandle } from './ai.js'
import { runTests, startRun, testsFor, traceFile, writeScratch, type RunControl, type TestCase } from './runner.js'
import { execStart, getStatus, onStatus } from './sandbox.js'
import { remove } from './files.js'
import type Docker from 'dockerode'
import type { Duplex } from 'node:stream'

type Msg = { t: string; id: string; [k: string]: unknown }

export function handleSocket(ws: WebSocket) {
  const send = (m: Record<string, unknown>) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)) }
  const runs = new Map<string, RunControl>()
  const terms = new Map<string, { exec: Docker.Exec; stream: Duplex }>()
  const ais = new Map<string, AiHandle>()

  send({ t: 'status', sandbox: getStatus() })
  const offStatus = onStatus((s) => send({ t: 'status', sandbox: s }))

  const fail = (id: string, e: unknown) => send({ t: 'error', id, message: (e as Error).message ?? String(e) })

  const handlers: Record<string, (m: Msg) => Promise<void> | void> = {
    // ---------- run ----------
    async run(m) {
      const ctl = await startRun(String(m.file), String(m.stdin ?? ''), {
        onCompile: (r) => send({ t: 'compile', id: m.id, ...r }),
        onStdout: (data) => send({ t: 'out', id: m.id, stream: 'stdout', data }),
        onStderr: (data) => send({ t: 'out', id: m.id, stream: 'stderr', data }),
        onExit: (r) => { runs.delete(m.id); send({ t: 'exit', id: m.id, ...r }) },
      })
      if (ctl) runs.set(m.id, ctl)
      else send({ t: 'exit', id: m.id, code: -1, description: 'compilation failed', ms: 0, diagnostics: [] })
    },
    stdin(m) { runs.get(m.id)?.write(String(m.data ?? '')) },
    eof(m) { runs.get(m.id)?.eof() },
    async stop(m) { await runs.get(m.id)?.stop() },

    // ---------- terminal: a real bash shell inside the sandbox, in your code folder ----------
    async 'term-open'(m) {
      const { exec, stream } = await execStart(['bash', '-l'], { tty: true, stdin: true, env: ['TERM=xterm-256color'] })
      terms.set(m.id, { exec, stream })
      const dec = new StringDecoder('utf8')
      stream.on('data', (b: Buffer) => send({ t: 'term-data', id: m.id, data: dec.write(b) }))
      stream.on('end', () => { terms.delete(m.id); send({ t: 'term-exit', id: m.id }) })
      await exec.resize({ h: Number(m.rows) || 24, w: Number(m.cols) || 80 }).catch(() => {})
    },
    'term-in'(m) { terms.get(m.id)?.stream.write(String(m.data ?? '')) },
    async 'term-resize'(m) { await terms.get(m.id)?.exec.resize({ h: Number(m.rows), w: Number(m.cols) }).catch(() => {}) },
    'term-close'(m) { terms.get(m.id)?.stream.end(); terms.delete(m.id) },

    // ---------- visualize ----------
    async trace(m) {
      const result = await traceFile(String(m.file), String(m.stdin ?? ''))
      send({ t: 'trace-result', id: m.id, file: m.file, stdin: m.stdin ?? '', ...result })
    },

    // ---------- tests ----------
    async test(m) {
      const file = String(m.file)
      const tests = (m.tests as TestCase[] | undefined) ?? (await testsFor(file))
      if (!tests?.length) return send({ t: 'test-result', id: m.id, noTests: true })
      const r = await runTests(file, tests)
      send({ t: 'test-result', id: m.id, ...r })
    },

    // ---------- compare original vs proposed on the same tests ----------
    async compare(m) {
      const file = String(m.file)
      const tests = (m.tests as TestCase[] | undefined) ?? (await testsFor(file)) ?? []
      if (!tests.length) return send({ t: 'compare-result', id: m.id, noTests: true })
      const scratch = await writeScratch(file, String(m.proposed ?? ''))
      try {
        const original = await runTests(file, tests, file, 3)
        const proposed = await runTests(file, tests, scratch, 3)
        send({ t: 'compare-result', id: m.id, original, proposed })
      } finally {
        await remove(scratch.split('/').slice(0, -1).join('/')).catch(() => {})
      }
    },

    // ---------- AI ----------
    ai(m) {
      const ctx = m.context as AiContext
      const prompt = m.resume ? String(ctx.question ?? 'Go deeper.') + (ctx.stepState ? `\n\nCurrent execution state:\n${ctx.stepState}` : '') : buildPrompt(ctx)
      ais.set(m.id, ask(prompt, { resume: m.resume as string | undefined }, {
        delta: (text) => send({ t: 'ai-delta', id: m.id, text }),
        done: (r) => { ais.delete(m.id); send({ t: 'ai-done', id: m.id, ...r }) },
      }))
    },
    'ai-cancel'(m) { ais.get(m.id)?.cancel() },
  }

  ws.on('message', async (raw) => {
    let m: Msg
    try { m = JSON.parse(String(raw)) } catch { return }
    const h = handlers[m.t]
    if (!h) return fail(m.id, new Error(`unknown message type ${m.t}`))
    try { await h(m) } catch (e) {
      fail(m.id, e)
      if (m.t === 'run') send({ t: 'exit', id: m.id, code: -1, description: 'could not start', ms: 0, diagnostics: [] })
    }
  })

  ws.on('close', () => {
    offStatus()
    runs.forEach((r) => r.stop().catch(() => {}))
    terms.forEach((t) => t.stream.end())
    ais.forEach((a) => a.cancel())
  })
}

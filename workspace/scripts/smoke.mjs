// End-to-end smoke test against a running workspace server (npm run dev / npm start).
// Exercises real execution in the sandbox: run, stdin, errors, stop, terminal, traces, tests, compare.
//   node scripts/smoke.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const PORT = process.env.LAB_PORT ?? 4317
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'my-code')
const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { Origin: `http://localhost:${PORT}` } })
const handlers = new Map()
ws.on('message', (raw) => { const m = JSON.parse(raw); handlers.get(m.id)?.(m) })
await new Promise((r, j) => { ws.on('open', r); ws.on('error', j) })

let n = 0
/** Send a request, collect replies until `done(m)` returns true. */
function req(msg, done, timeout = 120000) {
  const id = `t${++n}`
  const msgs = []
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${msg.t}`)), timeout)
    handlers.set(id, (m) => { msgs.push(m); if (done(m)) { clearTimeout(timer); handlers.delete(id); resolve(msgs) } })
    ws.send(JSON.stringify({ ...msg, id }))
  })
}
const isExit = (m) => m.t === 'exit'
const output = (msgs) => msgs.filter((m) => m.t === 'out').map((m) => m.data).join('')
let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); if (!ok) failures++ }
const write = (rel, text) => fs.mkdir(path.dirname(path.join(ROOT, rel)), { recursive: true }).then(() => fs.writeFile(path.join(ROOT, rel), text))

// 1. Run a C++ program
let r = await req({ t: 'run', file: 'start-here/vector_loop.cpp', stdin: '' }, isExit)
check('C++ run', output(r).includes('doubled total = 216') && r.at(-1).code === 0, JSON.stringify(output(r)))

// 2. stdin from the Input box
r = await req({ t: 'run', file: 'start-here/read_input.cpp', stdin: 'Ahmad\n20\n' }, isExit)
check('stdin (input box)', output(r).includes('Hi Ahmad, in 10 years you\'ll be 30.'), JSON.stringify(output(r)))

// 3. Interactive stdin while running
{
  const id = `t${++n}`
  const msgs = []
  const done = new Promise((resolve) => handlers.set(id, (m) => {
    msgs.push(m)
    if (m.t === 'out' && m.data.includes('name?')) ws.send(JSON.stringify({ t: 'stdin', id, data: 'Sam\n' }))
    if (m.t === 'out' && m.data.includes('old are you?')) ws.send(JSON.stringify({ t: 'stdin', id, data: '5\n' }))
    if (m.t === 'exit') resolve()
  }))
  ws.send(JSON.stringify({ t: 'run', id, file: 'start-here/read_input.cpp', stdin: '' }))
  await done
  check('interactive stdin (prompt shows before input)', output(msgs).includes('Hi Sam, in 10 years you\'ll be 15.'), JSON.stringify(output(msgs)))
}

// 3b. Interactive typing + EOF button for a program that reads until end of input
await write('scratch/smoke_sum.py', 'import sys\nprint("sum =", sum(int(x) for x in sys.stdin.read().split()))\n')
{
  const id = `t${++n}`
  const msgs = []
  const done = new Promise((resolve) => handlers.set(id, (m) => { msgs.push(m); if (m.t === 'exit') resolve() }))
  ws.send(JSON.stringify({ t: 'run', id, file: 'scratch/smoke_sum.py', stdin: '' }))
  await new Promise((r) => setTimeout(r, 1500))
  ws.send(JSON.stringify({ t: 'stdin', id, data: '1 2\n' }))
  ws.send(JSON.stringify({ t: 'stdin', id, data: '3\n' }))
  await new Promise((r) => setTimeout(r, 300))
  ws.send(JSON.stringify({ t: 'eof', id }))
  await Promise.race([done, new Promise((r) => setTimeout(r, 15000))])
  check('EOF button ends interactive input', output(msgs).includes('sum = 6'), JSON.stringify(output(msgs)))
}

// 4. Compile error → diagnostics with line numbers
await write('scratch/smoke_compile_error.cpp', '#include <iostream>\nint main() {\n    int x = 5\n    std::cout << y;\n}\n')
r = await req({ t: 'run', file: 'scratch/smoke_compile_error.cpp', stdin: '' }, isExit)
const comp = r.find((m) => m.t === 'compile')
check('compile error diagnostics', comp && !comp.ok && comp.diagnostics.some((d) => d.line === 3 || d.line === 4), JSON.stringify(comp?.diagnostics?.map((d) => `${d.line}:${d.message}`)))

// 5. Runtime crash (segfault)
await write('scratch/smoke_crash.cpp', '#include <iostream>\nint main() {\n    int* p = nullptr;\n    std::cout << "before" << std::endl;\n    *p = 1;\n}\n')
r = await req({ t: 'run', file: 'scratch/smoke_crash.cpp', stdin: '' }, isExit)
check('segfault reported', r.at(-1).code === 139 && /SIGSEGV/.test(r.at(-1).description) && output(r).includes('before'), r.at(-1).description)

// 6. Stop an infinite loop
await write('scratch/smoke_loop.py', 'import time\ni = 0\nwhile True:\n    i += 1\n    if i % 1000000 == 0: print(i, flush=True)\n')
{
  const id = `t${++n}`
  const t0 = Date.now()
  const msgs = []
  const done = new Promise((resolve) => handlers.set(id, (m) => {
    msgs.push(m)
    if (m.t === 'out' && msgs.filter((x) => x.t === 'out').length === 2) ws.send(JSON.stringify({ t: 'stop', id }))
    if (m.t === 'exit') resolve(m)
  }))
  ws.send(JSON.stringify({ t: 'run', id, file: 'scratch/smoke_loop.py', stdin: '' }))
  const exit = await done
  check('Stop kills a running program', exit.code === 137 && Date.now() - t0 < 15000, `${exit.description} after ${Date.now() - t0} ms`)
}

// 7. Python runtime error → line marker
await write('scratch/smoke_pyerr.py', 'nums = [1, 2, 3]\nprint(nums[0])\nprint(nums[10])\n')
r = await req({ t: 'run', file: 'scratch/smoke_pyerr.py', stdin: '' }, isExit)
check('Python traceback → line 3', r.at(-1).diagnostics?.some((d) => d.line === 3 && /IndexError/.test(d.message)), JSON.stringify(r.at(-1).diagnostics))

// 8. Java and JavaScript run
await write('scratch/Hello.java', 'public class Hello {\n    public static void main(String[] a) {\n        java.util.Scanner s = new java.util.Scanner(System.in);\n        System.out.println("java " + (s.nextInt() * 2));\n    }\n}\n')
r = await req({ t: 'run', file: 'scratch/Hello.java', stdin: '21' }, isExit)
check('Java run with stdin', output(r).includes('java 42'), JSON.stringify(output(r) || r.find((m) => m.t === 'compile')?.output))
await write('scratch/hello.js', 'console.log([1,2,3].map(x => x * 10).join(","))\n')
r = await req({ t: 'run', file: 'scratch/hello.js', stdin: '' }, isExit)
check('JavaScript run', output(r).includes('10,20,30'), JSON.stringify(output(r)))

// 9. Terminal: real shell on the same files
{
  const id = `t${++n}`
  let data = ''
  const done = new Promise((resolve) => handlers.set(id, (m) => {
    if (m.t === 'term-data') { data += m.data; if (data.includes('MARK-42')) resolve() }
  }))
  ws.send(JSON.stringify({ t: 'term-open', id, cols: 100, rows: 30 }))
  await new Promise((r) => setTimeout(r, 800))
  // $((40+2)) is computed by bash, so "MARK-42" only appears in the OUTPUT, never in the echoed command.
  ws.send(JSON.stringify({ t: 'term-in', id, data: 'cd start-here && g++ -o /tmp/v vector_loop.cpp && /tmp/v && echo MARK-$((40+2))\r' }))
  await Promise.race([done, new Promise((r) => setTimeout(r, 30000))])
  check('terminal runs commands on workspace files', data.includes('doubled total = 216') && data.includes('MARK-42'), JSON.stringify(data.slice(-200)))
  ws.send(JSON.stringify({ t: 'term-close', id }))
}

// 10. C++ trace: vector loop
r = await req({ t: 'trace', file: 'start-here/vector_loop.cpp', stdin: '' }, (m) => m.t === 'trace-result' || m.t === 'error', 180000)
let tr = r.at(-1).trace
{
  const steps = tr?.steps ?? []
  const last = steps.at(-1)
  const nums = last?.frames[0]?.vars.find((v) => v.name === 'nums')?.value
  const lines = [...new Set(steps.map((s) => s.line))]
  check('C++ trace records steps', steps.length > 10 && !tr.error, `${steps.length} steps, lines ${lines.join(',')}, error=${tr?.error}`)
  check('C++ trace reads vector<int>', nums?.k === 'list' && nums.items.map((x) => x.v).join(',') === '8,16,30,32,46,84', JSON.stringify(nums)?.slice(0, 200))
  check('C++ trace output', tr?.output?.includes('doubled total = 216'), JSON.stringify(tr?.output))
  const first = steps.find((s) => s.line === 7)
  check('uninitialized marked on declaration line', first?.frames[0]?.vars.find((v) => v.name === 'nums')?.value.k === 'uninit', JSON.stringify(first?.frames[0]?.vars.map((v) => [v.name, v.value.k])))
}

// 11. C++ trace: pointers, references, heap linked list
r = await req({ t: 'trace', file: 'start-here/pointers.cpp', stdin: '' }, (m) => m.t === 'trace-result' || m.t === 'error', 180000)
tr = r.at(-1).trace
{
  const steps = tr?.steps ?? []
  const last = steps.at(-1)
  const vars = Object.fromEntries((last?.frames[0]?.vars ?? []).map((v) => [v.name, v]))
  check('pointer p → x', vars.p?.value.k === 'ptr' && vars.p.value.addr === vars.x?.addr, `p=${JSON.stringify(vars.p?.value)} x.addr=${vars.x?.addr}`)
  check('reference r', vars.r?.value.k === 'ref' && vars.r.value.value.v === '21', JSON.stringify(vars.r?.value))
  check('heap linked list (3 nodes)', Object.keys(last?.heap ?? {}).length >= 3, `${Object.keys(last?.heap ?? {}).length} heap objects; error=${tr?.error}`)
}

// 12. C++ trace: recursion + crash
await write('scratch/smoke_rec.cpp', '#include <iostream>\nint fact(int n) {\n    if (n <= 1) return 1;\n    return n * fact(n - 1);\n}\nint main() {\n    int r = fact(4);\n    std::cout << r << std::endl;\n    int* p = nullptr;\n    return *p;\n}\n')
r = await req({ t: 'trace', file: 'scratch/smoke_rec.cpp', stdin: '' }, (m) => m.t === 'trace-result' || m.t === 'error', 180000)
tr = r.at(-1).trace
{
  const maxDepth = Math.max(...(tr?.steps ?? []).map((s) => s.frames.length))
  check('recursion depth in trace', maxDepth >= 5, `max frames ${maxDepth}`)
  check('crash shown in trace', /SIGSEGV/.test(tr?.error ?? '') && tr.steps.at(-1)?.event === 'error' && tr.steps.at(-1)?.line === 10, `${tr?.error} at line ${tr?.steps.at(-1)?.line}`)
}

// 13. Python trace
r = await req({ t: 'trace', file: 'start-here/recursion.py', stdin: '' }, (m) => m.t === 'trace-result' || m.t === 'error', 120000)
tr = r.at(-1).trace
check('Python trace', (tr?.steps.length ?? 0) > 10 && tr.output.includes('5! = 120'), `${tr?.steps.length} steps, output=${JSON.stringify(tr?.output)}`)

// 14. Unsupported trace language says so
r = await req({ t: 'trace', file: 'scratch/hello.js', stdin: '' }, (m) => m.t === 'trace-result' || m.t === 'error')
check('JS trace honestly unsupported', r.at(-1).supported === false && /not built yet/.test(r.at(-1).note), r.at(-1).note)

// 15. Tests: buggy starter fails some cases
r = await req({ t: 'test', file: 'practice/find-the-bug-max/main.cpp' }, (m) => m.t === 'test-result' || m.t === 'error')
{
  const res = r.at(-1).results ?? []
  check('tests run with measurements', res.length === 3 && res.every((x) => x.wallMs !== null && x.maxRssKb !== null), res.map((x) => `${x.name}:${x.pass ? 'pass' : 'fail'} ${x.wallMs}ms ${x.maxRssKb}KB`).join(' | '))
  check('all-negative case fails on buggy code', res.find((x) => x.name === 'all negative')?.pass === false)
}

// 16. Compare original vs fixed version on the same tests
const fixed = (await fs.readFile(path.join(ROOT, 'practice/find-the-bug-max/main.cpp'), 'utf8')).replace('int best = 0;', 'int best = a[0];').replace('i <= n', 'i < n')
r = await req({ t: 'compare', file: 'practice/find-the-bug-max/main.cpp', proposed: fixed }, (m) => m.t === 'compare-result' || m.t === 'error', 180000)
{
  const m = r.at(-1)
  check('compare: proposed passes all, original does not', m.proposed?.results.every((x) => x.pass) && m.original?.results.some((x) => !x.pass), `orig ${m.original?.results.filter((x) => x.pass).length}/3, proposed ${m.proposed?.results.filter((x) => x.pass).length}/3, samples ${JSON.stringify(m.proposed?.results[0]?.samples)}`)
}

await fs.rm(path.join(ROOT, 'scratch'), { recursive: true, force: true })
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
ws.close()
process.exit(failures ? 1 : 0)

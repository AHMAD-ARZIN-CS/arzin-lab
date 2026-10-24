import { useEffect, useRef, useState } from 'react'
import {
  askAi, getState, runTests, sendEof, sendInput, setState, setStdin, stop, useStore, visualize,
  type Diagnostic, type TestResult,
} from '../lib/store'
import { revealLine } from './CodeEditor'
import { Terminal } from './Terminal'

export function BottomPanel() {
  const tab = useStore((s) => s.bottomTab)
  const nProblems = useStore((s) => Object.values(s.diagnostics).flat().filter((d) => d.severity !== 'note').length)
  const tests = useStore((s) => s.tests)
  const failing = tests?.results.filter((r) => !r.pass).length ?? 0
  const tabs: [typeof tab, string][] = [['output', 'Output'], ['terminal', 'Terminal'], ['problems', `Problems${nProblems ? ` (${nProblems})` : ''}`], ['tests', `Tests${tests?.results.length ? ` (${tests.results.length - failing}/${tests.results.length})` : ''}`]]
  return (
    <div className="bottom-panel">
      <div className="subtabs">
        {tabs.map(([id, label]) => (
          <button key={id} className={`subtab ${tab === id ? 'active' : ''}`} onClick={() => setState({ bottomTab: id })}>{label}</button>
        ))}
      </div>
      <div className="bottom-body">
        {tab === 'output' && <OutputView />}
        <Terminal visible={tab === 'terminal'} />
        {tab === 'problems' && <ProblemsView />}
        {tab === 'tests' && <TestsView />}
      </div>
    </div>
  )
}

function OutputView() {
  const active = useStore((s) => s.active)
  const stdin = useStore((s) => (s.active ? s.stdin[s.active] ?? '' : ''))
  const runState = useStore((s) => s.run)
  const [line, setLine] = useState('')
  const scroller = useRef<HTMLPreElement>(null)
  useEffect(() => { scroller.current?.scrollTo(0, scroller.current.scrollHeight) }, [runState?.chunks.length])
  const running = runState?.status === 'running'

  return (
    <div className="output-view">
      <div className="stdin-box">
        <label htmlFor="stdin">Input <span className="muted">(stdin for Run, Visualize)</span></label>
        <textarea id="stdin" spellCheck={false} disabled={!active} placeholder={'Type program input here, e.g.\n4\n1 2 3 4\n\nLeave empty to type interactively while it runs.'}
          value={stdin} onChange={(e) => active && setStdin(active, e.target.value)} />
      </div>
      <div className="console">
        <pre className="console-out" ref={scroller}>
          {!runState && <span className="muted">Press Run (Ctrl+Enter) to compile and run the open file in the sandbox.</span>}
          {runState?.status === 'compiling' && <span className="info">Compiling {runState.file}…{'\n'}</span>}
          {runState?.chunks.map((c, i) => <span key={i} className={`out-${c.kind}`}>{c.text}</span>)}
          {runState?.exit && <ExitLine exit={runState.exit} />}
        </pre>
        <form className="console-in" onSubmit={(e) => { e.preventDefault(); sendInput(line + '\n'); setLine('') }}>
          <span className="prompt">{running ? '›' : ' '}</span>
          <input value={line} onChange={(e) => setLine(e.target.value)} disabled={!running}
            placeholder={running ? 'Type input for the running program and press Enter' : 'Interactive input is available while a program runs'} />
          <button type="button" className="btn small" disabled={!running} onClick={sendEof} title="End of input (like Ctrl+D)">EOF</button>
          <button type="button" className="btn small danger" disabled={!running} onClick={stop}>Stop</button>
        </form>
      </div>
    </div>
  )
}

function ExitLine({ exit }: { exit: { code: number; description: string; ms: number } }) {
  const ok = exit.code === 0
  return (
    <span className={ok ? 'exit-ok' : 'exit-bad'}>
      {'\n'}── {ok ? '✓' : '✖'} Process finished: {exit.description} · {exit.ms} ms wall time (includes startup) ──{'\n'}
      {!ok && exit.code !== -1 && <button className="link-btn" onClick={() => askAi({ action: 'error', selection: `Program ended with ${exit.description}`, extraDiagnostics: `Exit: ${exit.description}` })}>Explain why this happened</button>}
    </span>
  )
}

function ProblemsView() {
  const diags = useStore((s) => s.diagnostics)
  const all = Object.entries(diags).flatMap(([file, ds]) => ds.map((d) => ({ ...d, file })))
  if (!all.length) return <div className="muted pad">No problems. Compile errors and runtime errors show up here, with the line marked in the editor.</div>
  return (
    <ul className="problems">
      {all.map((d: Diagnostic, i) => (
        <li key={i} className={`sev-${d.severity}`}>
          <button className="link-btn" onClick={() => { if (d.file === getState().active) revealLine(d.line) }}>
            <span className="sev">{d.severity}</span> {d.file}:{d.line}{d.col ? `:${d.col}` : ''} <span className="phase">{d.phase}</span>
          </button>
          <span className="msg">{d.message}</span>
          {d.severity === 'error' && <button className="btn small" onClick={() => askAi({ action: 'error', selection: d.message, lines: [d.line, d.line], extraDiagnostics: `${d.file}:${d.line}: ${d.message}` })}>Explain</button>}
        </li>
      ))}
    </ul>
  )
}

function TestsView() {
  const tests = useStore((s) => s.tests)
  const proposal = useStore((s) => s.proposal)
  const active = useStore((s) => s.active)
  if (proposal?.compare) return <CompareView />
  return (
    <div className="tests-view">
      <div className="tests-head">
        <button className="btn" onClick={runTests} disabled={!active || tests?.running}>{tests?.running ? 'Running tests…' : 'Run tests'}</button>
        <span className="muted">Tests come from <code>tests.json</code> next to the file. Edit that file to add your own cases.</span>
      </div>
      {tests?.noTests && <p className="muted pad">No <code>tests.json</code> found next to <code>{tests.file}</code>. Practice problems include one; for your own code, create <code>tests.json</code> like:<br /><code>{'{ "tests": [ { "name": "example", "input": "3\\n", "expected": "6" } ] }'}</code></p>}
      {tests?.compile && !tests.compile.ok && <pre className="out-compile pad">{tests.compile.output}</pre>}
      {tests && tests.results.length > 0 && <>
        <p className="summary">{tests.results.filter((r) => r.pass).length} of {tests.results.length} passed. <span className="muted">Passing these tests doesn't prove the program is correct; it shows it handles these cases.</span></p>
        {tests.results.map((r, i) => <TestRow key={i} r={r} />)}
      </>}
    </div>
  )
}

function TestRow({ r }: { r: TestResult }) {
  const [open, setOpen] = useState(!r.pass)
  const debug = () => {
    const file = getState().active
    if (!file) return
    setStdin(file, r.input)
    visualize({ stdin: r.input })
  }
  return (
    <div className={`test-row ${r.pass ? 'pass' : 'fail'}`}>
      <button className="test-title" onClick={() => setOpen(!open)}>
        <span className="badge">{r.pass ? 'PASS' : r.timedOut ? 'TIME' : 'FAIL'}</span> {r.name}
        <span className="muted"> · {r.wallMs ?? '?'} ms · {r.maxRssKb ? `${(r.maxRssKb / 1024).toFixed(1)} MB` : '?'} (measured)</span>
        {r.description !== 'exit code 0' && <span className="warn"> · {r.description}</span>}
      </button>
      {open && (
        <div className="test-detail">
          <div><h4>Input</h4><pre>{r.input}</pre></div>
          <div><h4>Expected</h4><pre>{r.expected}</pre></div>
          <div><h4>Your output</h4><pre className={r.pass ? '' : 'diff-bad'}>{r.actual || <span className="muted">(nothing)</span>}{r.stderr && <span className="out-stderr">{'\n'}{r.stderr}</span>}</pre></div>
          <div className="test-actions">
            <button className="btn small" onClick={debug}>Visualize with this input</button>
            {!r.pass && <button className="btn small" onClick={() => askAi({ action: 'error', selection: `Test "${r.name}" fails`, extraDiagnostics: `Failing test.\nInput:\n${r.input}\nExpected:\n${r.expected}\nActual:\n${r.actual}\n${r.stderr}\nResult: ${r.description}` })}>Why does it fail?</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function CompareView() {
  const p = useStore((s) => s.proposal)!
  const c = p.compare!
  if (c.running) return <div className="pad muted">Compiling both versions and running every test 3 times each…</div>
  if (c.noTests) return <div className="pad muted">No tests.json next to this file, so there's nothing to compare against. Add tests first.</div>
  const a = c.original!, b = c.proposed!
  const rows = Math.max(a.results.length, b.results.length)
  const differ = a.results.filter((r, i) => b.results[i] && r.actual.trim() !== b.results[i].actual.trim()).length
  const median = (rs: TestResult[]) => rs.reduce((s, r) => s + (r.wallMs ?? 0), 0)
  return (
    <div className="compare-view">
      <div className="tests-head">
        <strong>Original vs proposed, on the same {rows} tests</strong>
        <button className="btn small ghost" onClick={() => setState({ proposal: { ...p, compare: undefined } })}>Close comparison</button>
      </div>
      {differ > 0 && <p className="warn pad">⚠ The two versions print different output on {differ} test(s). That's a behavior difference, not just a speed change.</p>}
      {!a.compile.ok && <pre className="out-compile">Original doesn't compile:{'\n'}{a.compile.output}</pre>}
      {!b.compile.ok && <pre className="out-compile">Proposed doesn't compile:{'\n'}{b.compile.output}</pre>}
      <table className="compare-table">
        <thead><tr><th>Test</th><th>Original</th><th>Proposed</th><th>Same output?</th></tr></thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => {
            const x = a.results[i], y = b.results[i]
            return (
              <tr key={i}>
                <td>{x?.name ?? y?.name}</td>
                <td className={x?.pass ? 'ok' : 'bad'}>{x ? `${x.pass ? 'pass' : 'fail'} · ${x.wallMs ?? '?'} ms` : '—'}</td>
                <td className={y?.pass ? 'ok' : 'bad'}>{y ? `${y.pass ? 'pass' : 'fail'} · ${y.wallMs ?? '?'} ms` : '—'}</td>
                <td>{x && y ? (x.actual.trim() === y.actual.trim() ? 'yes' : <span className="warn">no</span>) : '—'}</td>
              </tr>
            )
          })}
          <tr className="total"><td>Total (median of 3 runs per test)</td><td>{median(a.results).toFixed(1)} ms</td><td>{median(b.results).toFixed(1)} ms</td><td /></tr>
        </tbody>
      </table>
      <p className="muted note">Measured wall time on small inputs is mostly process startup and has noise, so small differences mean nothing. Complexity estimates in the explanation are theoretical; to see them, test with much larger inputs. Matching output on these tests does not prove the versions are equivalent.</p>
    </div>
  )
}

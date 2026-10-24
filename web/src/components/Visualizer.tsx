import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { askAi, jumpFocused, languageOf, setState, setStep, useStore, visualize } from '../lib/store'
import { CallTree, Flowchart, Timeline } from './VizDiagrams'
import {
  flatten, indexStep, indexVars, outputAt, subscriptsOnLine,
  type Frame, type Step, type TargetKey, type Val,
} from '../lib/trace'

type View = 'memory' | 'calls' | 'timeline' | 'flow'
const VIEWS: [View, string][] = [['memory', 'Memory'], ['calls', 'Call tree'], ['timeline', 'Timeline'], ['flow', 'Flowchart']]

interface Ctx {
  step: Step
  changed: Set<string>
  resolve: (addr: string | null) => TargetKey | null
  python: boolean
  bars: boolean
}
const VizCtx = createContext<Ctx | null>(null)
const useViz = () => useContext(VizCtx)!

export function Visualizer() {
  const result = useStore((s) => s.trace)
  const tracing = useStore((s) => s.tracing)
  const stepIdx = useStore((s) => s.step)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const focusLines = useStore((s) => s.focusLines)
  const active = useStore((s) => s.active)
  const current = useStore((s) => s.open.find((f) => f.path === s.trace?.file)?.content)
  const lang = useStore((s) => languageOf(s.active))
  const [view, setView] = useState<View>('memory')
  const [bars, setBars] = useState(() => localStorage.getItem('lab.bars') === '1')
  useEffect(() => { localStorage.setItem('lab.bars', bars ? '1' : '0') }, [bars])

  const steps = result?.trace?.steps ?? []
  useEffect(() => {
    if (!playing) return
    if (stepIdx >= steps.length - 1) { setState({ playing: false }); return }
    const t = setTimeout(() => setStep(stepIdx + 1), 700 / speed)
    return () => clearTimeout(t)
  }, [playing, stepIdx, speed, steps.length])

  // Keyboard: ← → to step when the visualizer has focus.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') setStep(stepIdx + 1)
    else if (e.key === 'ArrowLeft') setStep(stepIdx - 1)
    else if (e.key === ' ') setState({ playing: !playing })
    else return
    e.preventDefault()
  }

  if (tracing) return <div className="viz-empty"><div className="spinner" /> Running your program under the tracer…</div>
  if (!result) {
    return (
      <div className="viz-empty">
        <h3>Watch your code run</h3>
        <p>Press <b>Visualize</b> (Ctrl+Shift+Enter). Your program runs for real in the sandbox with the input from the Input box, and every executed line is recorded so you can play it back, step by step.</p>
        {lang && !lang.trace && <p className="warn">{lang.name}: {lang.traceNote}</p>}
        <p className="muted">Detailed tracing: C, C++ and Python. Run-only: JavaScript, Java, Bash.</p>
        <button className="btn primary" disabled={!active} onClick={() => visualize()}>Visualize {active?.split('/').pop() ?? ''}</button>
      </div>
    )
  }
  if (!result.supported) return <div className="viz-empty"><p className="warn">{result.note}</p><p>The program was run normally instead. See the Output tab for its real output.</p></div>
  if (result.compile && !result.compile.ok) return <div className="viz-empty"><p className="warn">The program didn't compile, so there is nothing to trace yet.</p><pre className="out-compile">{result.compile.output}</pre></div>

  const trace = result.trace!
  const step = steps[stepIdx]
  const stale = current !== undefined && current !== result.source
  return (
    <div className="viz" tabIndex={0} onKeyDown={onKey}>
      <div className="viz-controls">
        <div className="viz-buttons">
          <button className="icon-btn" title="First step" onClick={() => setStep(0)}>⏮</button>
          <button className="icon-btn" title="Back (←)" onClick={() => setStep(stepIdx - 1)}>◀</button>
          <button className="icon-btn play" title="Play / pause (space)" onClick={() => setState({ playing: !playing })} disabled={!steps.length}>{playing ? '⏸' : '▶'}</button>
          <button className="icon-btn" title="Forward (→)" onClick={() => setStep(stepIdx + 1)}>▶|</button>
          <button className="icon-btn" title="Last step" onClick={() => setStep(steps.length - 1)}>⏭</button>
          <select value={speed} onChange={(e) => setState({ speed: Number(e.target.value) })} title="Playback speed">
            {[0.25, 0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
          <span className="step-count">Step {steps.length ? stepIdx + 1 : 0} / {steps.length}</span>
        </div>
        <input type="range" min={0} max={Math.max(steps.length - 1, 0)} value={stepIdx} onChange={(e) => setStep(Number(e.target.value))} />
        <div className="viz-meta">
          {step && <span className={`event ev-${step.event}`}>{eventLabel(step)}</span>}
          {step && <span className="muted">line {step.line}: <code>{(result.source.split('\n')[step.line - 1] ?? '').trim().slice(0, 60)}</code></span>}
        </div>
        {focusLines && (
          <div className="focus-nav">
            Lines {focusLines[0]}{focusLines[1] !== focusLines[0] ? `–${focusLines[1]}` : ''}:
            <button className="link-btn" onClick={() => jumpFocused(-1)}>◀ previous time it runs</button>
            <button className="link-btn" onClick={() => jumpFocused(1)}>next time it runs ▶</button>
            <button className="link-btn muted" onClick={() => setState({ focusLines: null })}>clear</button>
          </div>
        )}
      </div>
      {stale && <div className="banner warn">The code changed since this trace was recorded. <button className="link-btn" onClick={() => visualize()}>Re-run Visualize</button></div>}
      {result.file !== active && <div className="banner">This trace is for <code>{result.file}</code>.</div>}
      {trace.truncated && <div className="banner warn">Stopped recording after {steps.length} steps (limit). Loops that run longer are cut off; use smaller input to see the whole run.</div>}
      {trace.error && <div className="banner error">⚠ {trace.error}{trace.errorLine ? ` (line ${trace.errorLine})` : ''} <button className="link-btn" onClick={() => askAi({ action: 'error', selection: trace.error!, lines: trace.errorLine ? [trace.errorLine, trace.errorLine] : undefined, extraDiagnostics: trace.error! })}>Why?</button></div>}
      {!steps.length && !trace.error && <div className="viz-empty">No steps were recorded.</div>}
      {step && (
        <div className="viz-views">
          <div className="seg slim">
            {VIEWS.map(([id, label]) => <button key={id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>)}
          </div>
          {view === 'memory' && <label className="bars-toggle muted small"><input type="checkbox" checked={bars} onChange={(e) => setBars(e.target.checked)} /> arrays as bars</label>}
        </div>
      )}
      {step && view === 'memory' && <StepView step={step} prev={steps[stepIdx - 1]} python={trace.language === 'python'} source={result.source} output={outputAt(trace, step)} bars={bars} />}
      {step && view === 'calls' && <div className="viz-state"><CallTree trace={trace} step={stepIdx} /></div>}
      {step && view === 'timeline' && <div className="viz-state"><Timeline trace={trace} step={stepIdx} /></div>}
      {step && view === 'flow' && <div className="viz-state"><Flowchart source={result.source} file={result.file} line={step.line} /></div>}
      {step && (
        <div className="viz-footer">
          <button className="btn small" onClick={() => askAi({ action: 'ask', question: 'Explain what is happening at this exact step of the execution, and why the variables have these values.' })}>Explain this step</button>
          {stepIdx === steps.length - 1 && trace.exitCode !== undefined && trace.exitCode !== null && <span className="muted">Program exited with code {trace.exitCode}</span>}
        </div>
      )}
    </div>
  )
}

function eventLabel(s: Step) {
  const f = s.frames[0]?.func ?? ''
  if (s.event === 'call') return `→ entered ${f}()`
  if (s.event === 'return') return `← returning from ${f}()`
  if (s.event === 'exception') return `⚠ exception: ${s.exception ?? ''}`
  if (s.event === 'error') return '⚠ crashed here'
  return 'next line to run'
}

function StepView({ step, prev, python, source, output, bars }: { step: Step; prev?: Step; python: boolean; source: string; output: string; bars: boolean }) {
  const changed = useMemo(() => {
    const a = flatten(prev), b = flatten(step), out = new Set<string>()
    if (!prev) return out
    b.forEach((v, k) => { if (a.get(k) !== v) out.add(k) })
    return out
  }, [step, prev])
  const resolve = useMemo(() => indexStep(step), [step])
  const box = useRef<HTMLDivElement>(null)
  const frames = [...step.frames].reverse() // oldest (main) on top, current function at the bottom
  const subs = subscriptsOnLine(source, step.line)
  const prevSubs = prev ? subscriptsOnLine(source, prev.line) : new Map<string, string[]>()
  const heap = Object.entries(step.heap)

  return (
    <VizCtx.Provider value={{ step, changed, resolve, python, bars }}>
      <div className="viz-state" ref={box}>
        {output && <div className="viz-output"><div className="viz-label">Output so far</div><pre>{output}</pre></div>}
        <div className="viz-columns">
          <div className="viz-col">
            <div className="viz-label">Call stack <span className="muted">(current function at the bottom)</span></div>
            {frames.map((f, i) => (
              <FrameBox key={i} frame={f} active={i === frames.length - 1} depthKey={`f${i + 1}:${f.func}`}
                subs={i === frames.length - 1 ? mergeSubs(subs, prevSubs) : new Map()} />
            ))}
            {step.returnValue && <div className="return-val">return value: <ValueView v={step.returnValue} path="ret" /></div>}
          </div>
          {heap.length > 0 && (
            <div className="viz-col">
              <div className="viz-label">{python ? 'Objects' : 'Heap'} <span className="muted">{python ? '(lists, dicts, objects: names point here)' : '(memory reached through pointers)'}</span></div>
              <div className="heap">
                {heap.map(([addr, h]) => (
                  <div key={addr} className="heap-obj" data-key={`heap:${addr}`}>
                    <div className="heap-type">{shortType(h.type)}{!python && <span className="addr">{shortAddr(addr)}</span>}</div>
                    <ValueView v={h.value} path={`heap:${addr}`} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <Arrows container={box} deps={step} />
      </div>
    </VizCtx.Provider>
  )
}

function mergeSubs(a: Map<string, string[]>, b: Map<string, string[]>) {
  const m = new Map(a)
  b.forEach((v, k) => m.set(k, [...new Set([...(m.get(k) ?? []), ...v])]))
  return m
}

function FrameBox({ frame, active, depthKey, subs }: { frame: Frame; active: boolean; depthKey: string; subs: Map<string, string[]> }) {
  const { changed } = useViz()
  const idx = indexVars(frame)
  return (
    <div className={`frame ${active ? 'active' : ''}`}>
      <div className="frame-head"><span className="fn">{frame.func}</span><span className="muted">line {frame.line}</span></div>
      {frame.vars.length === 0 && <div className="muted small">no variables yet</div>}
      {frame.vars.map((v) => {
        const key = `${depthKey}:${v.name}`
        // Which int variables index this array? Strong: used as name[i] on the current line.
        const strong = (subs.get(v.name) ?? []).map((n) => idx.find((x) => x.name === n)).filter(Boolean) as { name: string; value: number }[]
        const weak = v.value.k === 'list' ? idx.filter((x) => /^(i|j|k|lo|hi|mid|left|right|l|r|idx)$/.test(x.name) && !strong.some((s) => s.name === x.name)) : []
        return (
          <div key={v.name} className={`var-row ${changed.has(key) ? 'changed' : ''}`} data-key={v.addr ? `var:${v.addr}` : undefined}>
            <span className="var-name" title={v.type}>{v.name}</span>
            <span className="var-type">{shortType(v.type)}</span>
            <span className="var-val"><ValueView v={v.value} path={key} markers={{ strong, weak }} /></span>
          </div>
        )
      })}
    </div>
  )
}

function ValueView({ v, path, markers }: { v: Val; path: string; markers?: { strong: { name: string; value: number }[]; weak: { name: string; value: number }[] } }): ReactNode {
  const { changed, resolve, python, step, bars } = useViz()
  const ch = changed.has(path) ? ' changed' : ''
  switch (v.k) {
    case 'prim': return <span className={`val prim${ch}`}>{v.v}</span>
    case 'str': return <span className={`val str${ch}`}>"{v.v}"</span>
    case 'uninit': return <span className="val uninit" title="Declared on this line but not initialized yet: its memory holds garbage">?</span>
    case 'func': return <span className="val func">ƒ {v.v}</span>
    case 'more': return <span className="muted">…</span>
    case 'err': return <span className="val bad" title={v.v}>unreadable</span>
    case 'ptr': {
      if (!v.addr) return <span className={`val null${ch}`}>{python ? 'None' : 'nullptr'}</span>
      const target = resolve(v.addr)
      if (v.text !== undefined) return <span className={`val str${ch}`} title={v.addr}>"{v.text}"</span>
      return (
        <span className={`val ptr${ch}${v.bad ? ' bad' : ''}`} data-ptr={target ?? undefined} title={v.bad ? 'Invalid pointer: it points at memory that is not valid (garbage, freed, or out of bounds)' : `address ${v.addr}`}>
          {target ? '●' : v.bad ? '⚠ invalid' : shortAddr(v.addr)}
        </span>
      )
    }
    case 'ref': {
      const target = resolve(v.addr)
      return <span className="val ref" data-ptr={target ?? undefined} title="Reference: another name for the variable the arrow points to">& <ValueView v={v.value} path={path} /></span>
    }
    case 'heapref': {
      const h = step.heap[v.id]
      return <span className={`val ptr${ch}`} data-ptr={h ? `heap:${v.id}` : undefined} title={h ? `points to a ${h.type} object` : ''}>●</span>
    }
    case 'list': {
      const elKey = v.addr ? (i: number) => `el:${BigInt(v.addr!).toString(16)}:${i}` : () => undefined
      const lenChanged = changed.has(path + '#len')
      // Bars: numbers drawn as heights. Sorting and running sums become easy to see.
      const nums = v.items.map((it) => (it.k === 'prim' ? Number(it.v) : NaN))
      if (bars && v.items.length > 0 && nums.every(Number.isFinite)) {
        const lo = Math.min(0, ...nums), hi = Math.max(...nums, lo + 1)
        return (
          <div className={`list kind-${v.kind}`}>
            <div className={`list-head${lenChanged ? ' changed' : ''}`}>{v.kind}<span className="muted"> size {v.size}</span></div>
            <div className="bars">
              {nums.map((n, i) => {
                const strong = markers?.strong.filter((m) => m.value === i) ?? []
                const weak = markers?.weak.filter((m) => m.value === i) ?? []
                return (
                  <div key={i} className={`bar-col${strong.length ? ' indexed' : ''}${changed.has(`${path}#${i}`) ? ' changed' : ''}`} data-key={elKey(i)}>
                    <span className="bar-val">{n}</span>
                    <div className={`bar${n < 0 ? ' neg' : ''}`} style={{ height: `${6 + (Math.abs(n - (n < 0 ? 0 : lo)) / (hi - lo)) * 90}px` }} />
                    <span className="cell-idx">{i}</span>
                    {(strong.length > 0 || weak.length > 0) && (
                      <div className="bar-markers">
                        {strong.map((m) => <span key={m.name} className="marker strong">↑{m.name}</span>)}
                        {weak.map((m) => <span key={m.name} className="marker weak">{m.name}</span>)}
                      </div>
                    )}
                  </div>
                )
              })}
              {v.items.length < v.size && <div className="cell more">+{v.size - v.items.length} more</div>}
            </div>
          </div>
        )
      }
      return (
        <div className={`list kind-${v.kind}`}>
          <div className={`list-head${lenChanged ? ' changed' : ''}`}>{v.kind}<span className="muted"> size {v.size}</span>{v.text ? <span className="muted"> "{v.text}"</span> : null}</div>
          <div className="cells">
            {v.items.map((it, i) => {
              const strong = markers?.strong.filter((m) => m.value === i) ?? []
              const weak = markers?.weak.filter((m) => m.value === i) ?? []
              return (
                <div key={i} className={`cell${strong.length ? ' indexed' : ''}`} data-key={elKey(i)}>
                  <div className="cell-val"><ValueView v={it} path={`${path}#${i}`} /></div>
                  <div className="cell-idx">{i}</div>
                  {(strong.length > 0 || weak.length > 0) && (
                    <div className="cell-markers">
                      {strong.map((m) => <span key={m.name} className="marker strong">↑{m.name}</span>)}
                      {weak.map((m) => <span key={m.name} className="marker weak">{m.name}</span>)}
                    </div>
                  )}
                </div>
              )
            })}
            {v.items.length < v.size && <div className="cell more">+{v.size - v.items.length} more</div>}
            {v.size === 0 && <div className="cell empty">empty</div>}
          </div>
        </div>
      )
    }
    case 'struct':
      return (
        <div className="struct">
          {!python && <div className="struct-type">{shortType(v.type)}</div>}
          {v.fields.map((f) => (
            <div key={f.name} className={`field${changed.has(`${path}.${f.name}`) ? ' changed' : ''}`}>
              <span className="var-name">{f.name}</span><ValueView v={f.value} path={`${path}.${f.name}`} />
            </div>
          ))}
        </div>
      )
    case 'map':
      return (
        <div className="map">
          <div className="list-head">{shortType(v.type)}<span className="muted"> size {v.size ?? v.entries.length}</span></div>
          {v.entries.map((e, i) => (
            <div key={i} className={`field${changed.has(`${path}{${i}}`) ? ' changed' : ''}`}>
              <ValueView v={e.key} path={`${path}<k${i}>`} /><span className="muted"> → </span><ValueView v={e.value} path={`${path}{${i}}`} />
            </div>
          ))}
        </div>
      )
  }
}

/** Draws pointer arrows: from every [data-ptr] element to the element whose data-key matches. */
function Arrows({ container, deps }: { container: React.RefObject<HTMLDivElement | null>; deps: unknown }) {
  const [paths, setPaths] = useState<{ d: string; bad: boolean }[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    const draw = () => {
      const base = el.getBoundingClientRect()
      const out: { d: string; bad: boolean }[] = []
      el.querySelectorAll<HTMLElement>('[data-ptr]').forEach((src) => {
        const key = src.dataset.ptr!
        const dst = el.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
        if (!dst || dst.contains(src)) return
        const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect()
        const x1 = a.left + a.width / 2 - base.left + el.scrollLeft, y1 = a.top + a.height / 2 - base.top + el.scrollTop
        const toLeft = b.left - base.left + el.scrollLeft > x1
        const x2 = (toLeft ? b.left : b.right) - base.left + el.scrollLeft, y2 = b.top + Math.min(14, b.height / 2) - base.top + el.scrollTop
        const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (toLeft ? 1 : -1)
        out.push({ d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, bad: false })
      })
      setPaths(out)
      setSize({ w: el.scrollWidth, h: el.scrollHeight })
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(el)
    return () => ro.disconnect()
  }, [container, deps])
  return (
    <svg className="arrows" width={size.w} height={size.h}>
      <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6ec8ff" /></marker></defs>
      {paths.map((p, i) => <path key={i} d={p.d} className="arrow" markerEnd="url(#ah)" />)}
    </svg>
  )
}

const shortType = (t: string) => t
  .replace(/std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> >/g, 'string')
  .replace(/std::(__cxx11::)?/g, '')
  .replace(/, ?allocator<[^<>]*(<[^<>]*>)?[^<>]*>/g, '')
  .replace(/\s+/g, ' ')
  .slice(0, 40)
const shortAddr = (a: string) => '0x…' + a.slice(-4)

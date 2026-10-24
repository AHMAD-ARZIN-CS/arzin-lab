// Graphic views of a recorded run: call tree, variable timelines, and an AI-drawn flowchart.
// Everything except the flowchart's layout comes straight from the real trace.
import { useEffect, useMemo, useRef, useState } from 'react'
import { renderMermaid } from '../lib/diagrams'
import { request } from '../lib/socket'
import { setStep, useStore } from '../lib/store'
import { useTheme } from '../lib/theme'
import type { Step, Trace, Val } from '../lib/trace'

const short = (v: Val | null | undefined, step?: Step): string => {
  if (!v) return '?'
  switch (v.k) {
    case 'prim': return v.v
    case 'str': return JSON.stringify(v.v.length > 12 ? v.v.slice(0, 12) + '…' : v.v)
    case 'uninit': return '?'
    case 'ptr': return v.addr ? '→' : 'null'
    case 'ref': return short(v.value, step)
    case 'list': return `[${v.items.slice(0, 4).map((x) => short(x, step)).join(',')}${v.size > 4 ? ',…' : ''}]`
    case 'heapref': {
      const h = step?.heap[v.id]
      return h ? short(h.value, step) : 'obj'
    }
    default: return '…'
  }
}

// ---------------- call tree ----------------

interface CallNode { func: string; args: string; ret?: string; start: number; end: number; depth: number; children: CallNode[]; x: number; y: number }

function buildCallTree(steps: Step[]): CallNode | null {
  let root: CallNode | null = null
  const stack: CallNode[] = []
  steps.forEach((s, i) => {
    const funcs = [...s.frames].reverse() // oldest first
    // Pop frames that returned, or that were replaced by a different call at the same depth.
    let keep = 0
    while (keep < stack.length && keep < funcs.length && stack[keep].func === funcs[keep].func) keep++
    while (stack.length > keep) stack.pop()!.end = i - 1
    for (let d = stack.length; d < funcs.length; d++) {
      const f = funcs[d]
      const args = f.vars.filter((v) => v.value.k !== 'uninit').slice(0, 3).map((v) => `${v.name}=${short(v.value, s)}`).join(', ')
      const node: CallNode = { func: f.func, args: d === 0 ? '' : args, start: i, end: i, depth: d, children: [], x: 0, y: 0 }
      if (d === 0) root ??= node
      else stack[d - 1].children.push(node)
      stack.push(node)
    }
    if (s.event === 'return' && s.returnValue && stack.length) stack[stack.length - 1].ret = short(s.returnValue, s)
    stack.forEach((n) => { n.end = i })
  })
  return root
}

const NODE_W = 132, NODE_H = 44, GAP_X = 14, GAP_Y = 30

function layout(root: CallNode, cur: number) {
  let leaf = 0
  const visible = (n: CallNode) => n.start <= cur // the tree grows as you step
  const place = (n: CallNode) => {
    n.y = n.depth * (NODE_H + GAP_Y)
    const kids = n.children.filter(visible)
    if (!kids.length) { n.x = leaf++ * (NODE_W + GAP_X); return }
    kids.forEach(place)
    n.x = (kids[0].x + kids[kids.length - 1].x) / 2
  }
  place(root)
  const nodes: CallNode[] = []
  const walk = (n: CallNode) => { if (!visible(n)) return; nodes.push(n); n.children.forEach(walk) }
  walk(root)
  return nodes
}

export function CallTree({ trace, step }: { trace: Trace; step: number }) {
  const root = useMemo(() => buildCallTree(trace.steps), [trace])
  if (!root || !root.children.length) return <div className="pane-empty">No function calls in this run. The call tree draws every function call (great for recursion), so try it on code that calls functions.</div>
  const nodes = layout(root, step)
  const W = Math.max(...nodes.map((n) => n.x)) + NODE_W + 20, H = Math.max(...nodes.map((n) => n.y)) + NODE_H + 20
  const cur = nodes.filter((n) => n.start <= step && step <= n.end).sort((a, b) => b.depth - a.depth)[0]
  return (
    <div className="calltree">
      <p className="muted small">Each box is one function call, with its arguments and its return value once it finishes. Green is running now, blue is waiting on the call stack, and grey has returned. Click a box to jump there.</p>
      <svg width={W} height={H} className="calltree-svg">
        {nodes.flatMap((n) => n.children.filter((c) => c.start <= step).map((c) => (
          <path key={`${n.start}-${c.start}`} d={`M${n.x + NODE_W / 2 + 10},${n.y + NODE_H + 10} C${n.x + NODE_W / 2 + 10},${n.y + NODE_H + 26} ${c.x + NODE_W / 2 + 10},${c.y - 6} ${c.x + NODE_W / 2 + 10},${c.y + 10}`} className="ct-edge" />
        )))}
        {nodes.map((n) => {
          const state = n === cur ? 'now' : n.start <= step && step <= n.end ? 'waiting' : 'done'
          return (
            <g key={n.start} transform={`translate(${n.x + 10},${n.y + 10})`} className={`ct-node ct-${state}`} onClick={() => setStep(n.start)}>
              <rect width={NODE_W} height={NODE_H} rx="9" />
              <text x={NODE_W / 2} y="18" textAnchor="middle" className="ct-fn">{n.func}({n.args.length > 18 ? n.args.slice(0, 17) + '…' : n.args})</text>
              <text x={NODE_W / 2} y="35" textAnchor="middle" className="ct-ret">{n.ret !== undefined && step >= n.end ? `returns ${n.ret}` : state === 'done' ? 'returned' : state === 'now' ? 'running' : 'waiting…'}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ---------------- timeline ----------------

export function Timeline({ trace, step }: { trace: Trace; step: number }) {
  const series = useMemo(() => {
    const map = new Map<string, (number | null)[]>()
    trace.steps.forEach((s, i) => {
      const seen = new Set<string>()
      for (const f of s.frames) for (const v of f.vars) {
        const key = `${f.func}: ${v.name}`
        if (seen.has(key) || v.value.k !== 'prim') continue
        const n = Number(v.value.num ?? v.value.v)
        if (!Number.isFinite(n) || v.value.v === 'true' || v.value.v === 'false') continue
        seen.add(key)
        if (!map.has(key)) map.set(key, Array(trace.steps.length).fill(null))
        map.get(key)![i] = n
      }
    })
    return [...map.entries()].filter(([, vals]) => new Set(vals.filter((x) => x !== null)).size > 1).slice(0, 12)
  }, [trace])
  if (!series.length) return <div className="pane-empty">No number variables change in this run, so there's nothing to chart.</div>
  const W = 300, H = 46, n = trace.steps.length
  return (
    <div className="timeline">
      <p className="muted small">How each number variable changes over the run. The line marks the current step; click a chart to jump there.</p>
      {series.map(([key, vals]) => {
        const nums = vals.filter((x): x is number => x !== null)
        const lo = Math.min(...nums), hi = Math.max(...nums)
        const sx = (i: number) => (i / Math.max(n - 1, 1)) * W
        const sy = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8)
        let d = '', pen = false
        vals.forEach((v, i) => { if (v === null) { pen = false; return } d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`; pen = true })
        const now = vals[step]
        return (
          <div key={key} className="tl-row">
            <div className="tl-label"><span className="var-name">{key}</span><span className="tl-now">{now ?? '—'}</span></div>
            <svg viewBox={`0 0 ${W} ${H}`} className="tl-chart" preserveAspectRatio="none"
              onClick={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setStep(Math.round(((e.clientX - r.left) / r.width) * (n - 1))) }}>
              <path d={d} className="tl-line" />
              <line x1={sx(step)} x2={sx(step)} y1="0" y2={H} className="tl-cursor" />
              {now !== null && now !== undefined && <circle cx={sx(step)} cy={sy(now)} r="3.5" className="tl-dot" />}
            </svg>
            <div className="tl-range muted">{lo} … {hi}</div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------- flowchart ----------------

const cache = new Map<string, string>() // source → mermaid code

export function Flowchart({ source, file, line }: { source: string; file: string; line: number | undefined }) {
  const theme = useTheme()
  const lang = useStore((s) => s.languages.find((l) => l.exts.some((e) => file.endsWith(e)))?.name)
  const [code, setCode] = useState<string | null>(cache.get(source) ?? null)
  const [busy, setBusy] = useState(false)
  const [svg, setSvg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => { setCode(cache.get(source) ?? null); setSvg(null) }, [source])

  const draw = () => {
    setBusy(true); setErr(null)
    let text = ''
    const numbered = source.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')
    const sub = request({ t: 'ai', context: { action: 'flowchart', file, language: lang, code: numbered } }, (m) => {
      if (m.t === 'ai-delta') text += m.text
      else if (m.t === 'ai-done' || m.t === 'error') {
        sub.unsubscribe(); setBusy(false)
        if (m.error || m.message) return setErr(m.error ?? m.message)
        const mm = text.match(/```mermaid\s*\n([\s\S]*?)```/)?.[1] ?? (text.trim().startsWith('flowchart') ? text.trim() : null)
        if (!mm) return setErr('The AI did not return a flowchart. Try again.')
        cache.set(source, mm)
        setCode(mm)
      }
    })
  }

  useEffect(() => {
    if (!code) return
    renderMermaid(code).then(setSvg, (e: Error) => setErr(`Couldn't draw it: ${e.message}`))
  }, [code, theme])

  // Light up the box for the line that runs next.
  useEffect(() => {
    const el = host.current
    if (!el || !svg) return
    el.querySelectorAll('.fc-current').forEach((n) => n.classList.remove('fc-current'))
    if (!line) return
    let best: Element | null = null, bestLine = -1
    el.querySelectorAll('[id*="flowchart-L"]').forEach((n) => {
      const m = n.id.match(/flowchart-L(\d+)-/)
      if (!m) return
      const l = Number(m[1])
      if (l <= line && l > bestLine) { best = n; bestLine = l }
    })
    ;(best as Element | null)?.classList.add('fc-current')
    ;(best as Element | null)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [svg, line])

  if (!code) {
    return (
      <div className="pane-empty">
        <p>See your program as a flowchart: decisions as diamonds, loops as arrows going back. As you step through, the box for the running line lights up.</p>
        <button className="btn primary small" onClick={draw} disabled={busy}>{busy ? 'Drawing…' : 'Draw flowchart'}</button>
        {err && <p className="error small">{err}</p>}
        <p className="muted small">The layout is drawn by the AI from your code. The highlighting follows the real run.</p>
      </div>
    )
  }
  return (
    <div className="flowchart">
      <div className="row-gap"><span className="muted small">Line {line ?? '?'} is highlighted.</span><button className="btn small ghost" onClick={() => { cache.delete(source); setCode(null); draw() }}>Redraw</button></div>
      {err && <p className="error small">{err}</p>}
      {/* svg is sanitized by DOMPurify inside renderMermaid */}
      <div ref={host} className="flowchart-svg" dangerouslySetInnerHTML={{ __html: svg ?? '' }} />
    </div>
  )
}

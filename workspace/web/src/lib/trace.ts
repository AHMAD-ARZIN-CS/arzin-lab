// The trace format produced by sandbox/tools/gdbtrace.py (C/C++) and pytrace.py (Python).
export type Val =
  | { k: 'prim'; v: string; num?: number }
  | { k: 'str'; v: string }
  | { k: 'uninit' }
  | { k: 'more' }
  | { k: 'err'; v: string }
  | { k: 'func'; v: string }
  | { k: 'ptr'; addr: string | null; bad?: boolean; text?: string }
  | { k: 'ref'; addr: string | null; value: Val }
  | { k: 'heapref'; id: string }
  | { k: 'list'; kind: string; size: number; items: Val[]; addr?: string; elsize?: number; text?: string | null }
  | { k: 'struct'; type: string; fields: { name: string; value: Val }[] }
  | { k: 'map'; type: string; size: number | null; entries: { key: Val; value: Val }[] }

export interface Var { name: string; type: string; addr?: string | null; value: Val }
export interface Frame { func: string; line: number; vars: Var[] }
export interface Step {
  line: number
  event: 'step' | 'call' | 'return' | 'exception' | 'error'
  frames: Frame[]                       // newest first
  heap: Record<string, { type: string; value: Val }>
  outLen: number
  returnValue?: Val | null
  exception?: string
}
export interface Trace {
  language: 'cpp' | 'python'
  steps: Step[]
  truncated: boolean
  error: string | null
  errorLine?: number
  exitCode?: number | null
  output: string
}

export interface TraceResult {
  file: string
  stdin: string
  source: string
  supported: boolean
  note?: string
  trace?: Trace
  compile?: { ok: boolean; output: string; diagnostics: unknown[] }
}

/** Output printed up to this step. outLen counts bytes, so slice as bytes. */
export function outputAt(trace: Trace, step: Step) {
  const bytes = new TextEncoder().encode(trace.output)
  return new TextDecoder().decode(bytes.slice(0, step.outLen))
}

// ---------- pointer resolution: where does an address point? ----------

export type TargetKey = string // "var:0x7ffe…" | "el:0x5555…:3" | "heap:0x5555…" | "heap:140…" (python id)

const big = (a: string) => BigInt(a)

export function indexStep(step: Step) {
  const vars = new Map<string, true>()
  const lists: { start: bigint; elsize: bigint; size: number; key: string }[] = []
  const visit = (v: Val, ownerKey: string) => {
    if (v.k === 'list') {
      if (v.addr && v.elsize) lists.push({ start: big(v.addr), elsize: BigInt(v.elsize), size: v.size, key: ownerKey })
      v.items.forEach((it, i) => visit(it, `${ownerKey}#${i}`))
    } else if (v.k === 'struct') v.fields.forEach((f) => visit(f.value, `${ownerKey}.${f.name}`))
  }
  for (const f of step.frames) for (const v of f.vars) {
    if (v.addr) vars.set(v.addr, true)
    visit(v.value, `var:${v.addr ?? v.name}`)
  }
  for (const [addr, h] of Object.entries(step.heap)) visit(h.value, `heap:${addr}`)

  return function resolve(addr: string | null): TargetKey | null {
    if (!addr) return null
    if (vars.has(addr)) return `var:${addr}`
    const a = big(addr)
    for (const l of lists) {
      const end = l.start + l.elsize * BigInt(l.size)
      if (a >= l.start && a < end) return `el:${l.start.toString(16)}:${Number((a - l.start) / l.elsize)}`
    }
    if (step.heap[addr]) return `heap:${addr}`
    return null
  }
}

// ---------- index markers: which variable is indexing which array on this line? ----------

/** From the source line, find `name[index]` uses, e.g. `nums[i]` → { nums: ['i'] }. */
export function subscriptsOnLine(source: string, line: number): Map<string, string[]> {
  const text = source.split('\n')[line - 1] ?? ''
  const out = new Map<string, string[]>()
  for (const m of text.matchAll(/([A-Za-z_]\w*)\s*\[\s*([A-Za-z_]\w*)\s*(?:[+-]\s*\d+\s*)?\]/g)) {
    out.set(m[1], [...(out.get(m[1]) ?? []), m[2]])
  }
  return out
}

const INDEXY = /^(i|j|k|l|r|lo|hi|mid|left|right|idx|index|pos|start|end|p|q)$/

/** Integer variables in the frame that look like indexes (used to mark vector cells). */
export function indexVars(frame: Frame): { name: string; value: number }[] {
  const out: { name: string; value: number }[] = []
  for (const v of frame.vars) {
    if (v.value.k === 'prim' && /^-?\d+$/.test(v.value.v) && (INDEXY.test(v.name) || /int|size_t|long/.test(v.type))) {
      out.push({ name: v.name, value: Number(v.value.v) })
    }
  }
  return out
}

// ---------- change detection: what changed since the previous step? ----------

export function flatten(step: Step | undefined): Map<string, string> {
  const out = new Map<string, string>()
  if (!step) return out
  const walk = (v: Val, key: string) => {
    if (v.k === 'list') { out.set(key + '#len', String(v.size)); v.items.forEach((it, i) => walk(it, `${key}#${i}`)) }
    else if (v.k === 'struct') v.fields.forEach((f) => walk(f.value, `${key}.${f.name}`))
    else if (v.k === 'map') v.entries.forEach((e, i) => walk(e.value, `${key}{${i}}`))
    else if (v.k === 'ref') walk(v.value, key)
    else out.set(key, JSON.stringify(v))
  }
  step.frames.forEach((f, fi) => f.vars.forEach((v) => walk(v.value, `f${step.frames.length - fi}:${f.func}:${v.name}`)))
  for (const [id, h] of Object.entries(step.heap)) walk(h.value, `heap:${id}`)
  return out
}

/** A short text version of the state at a step, sent to the AI as context. */
export function describeStep(trace: Trace, index: number, source: string): string {
  const step = trace.steps[index]
  if (!step) return ''
  const fmt = (v: Val, depth = 0): string => {
    if (depth > 3) return '…'
    switch (v.k) {
      case 'prim': return v.v
      case 'str': return JSON.stringify(v.v)
      case 'uninit': return '(uninitialized)'
      case 'ptr': return v.addr ? `pointer ${v.addr}${v.bad ? ' (invalid)' : ''}` : 'nullptr'
      case 'ref': return `reference to ${fmt(v.value, depth + 1)}`
      case 'heapref': {
        const h = step.heap[v.id]
        return h ? fmt(h.value, depth + 1) : 'object'
      }
      case 'list': return `${v.kind}[${v.size}] {${v.items.slice(0, 20).map((x) => fmt(x, depth + 1)).join(', ')}${v.items.length > 20 ? ', …' : ''}}`
      case 'struct': return `${v.type} {${v.fields.map((f) => `${f.name}: ${fmt(f.value, depth + 1)}`).join(', ')}}`
      case 'map': return `{${v.entries.slice(0, 20).map((e) => `${fmt(e.key, depth + 1)}: ${fmt(e.value, depth + 1)}`).join(', ')}}`
      default: return 'value' in v ? String((v as { v: string }).v) : v.k
    }
  }
  const lines = [
    `Step ${index + 1} of ${trace.steps.length}. Next line to execute: ${step.line}: \`${(source.split('\n')[step.line - 1] ?? '').trim()}\``,
    `Event: ${step.event}${step.exception ? ` (${step.exception})` : ''}`,
    'Call stack (innermost first):',
    ...step.frames.map((f) => `- ${f.func} (line ${f.line}): ${f.vars.map((v) => `${v.name} = ${fmt(v.value)}`).join('; ') || 'no variables'}`),
    `Output so far: ${JSON.stringify(outputAt(trace, step).slice(-500))}`,
  ]
  return lines.join('\n')
}

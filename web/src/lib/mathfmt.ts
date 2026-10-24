// Formulas in textbook notation for graphs: "sin(x)*x" → x sin x, "x^2/2" → x²/2, "sqrt(x)" → √x,
// with italic variables and real raised exponents. Formulas are parsed by mathjs (never evaluated).

/** A typeset formula: text runs (italic for variables) and raised exponents. */
type Piece = { t: string; i?: boolean } | { sup: Piece[] }
type M = Piece[]
type Node = {
  type: string; name?: string; value?: unknown; op?: string; fn?: string | { name?: string }
  args?: Node[]; content?: Node; implicit?: boolean; toString(): string
}

let parse: ((s: string) => Node) | null = null
/** Set once mathjs is loaded (see getCompiler in plot.ts). */
export function setParser(p: (s: string) => unknown) { parse = p as (s: string) => Node }

const GREEK: Record<string, string> = {
  pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', lambda: 'λ', mu: 'μ', sigma: 'σ', phi: 'φ', omega: 'ω', tau: 'τ',
}
const UPRIGHT_FN = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan', 'ln', 'log', 'floor', 'ceil', 'round', 'sign', 'max', 'min', 'mod'])
const TRIG = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh'])
const FRAC: Record<string, string> = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾' }
const THIN = ' ' // between a function and its neighbours: x sin x

const P = { add: 1, mul: 2, neg: 3, pow: 4, atom: 5 }
type Out = { m: M; prec: number; kind: 'num' | 'sym' | 'fn' | 'other' }

const txt = (t: string, i = false): Piece => ({ t, i })
const paren = (m: M): M => [txt('('), ...m, txt(')')]

function fmtNode(n: Node): Out {
  switch (n.type) {
    case 'ParenthesisNode': return fmtNode(n.content!)
    case 'ConstantNode': return { m: [txt(String(n.value))], prec: P.atom, kind: 'num' }
    case 'SymbolNode': {
      const name = n.name!
      if (GREEK[name]) return { m: [txt(GREEK[name])], prec: P.atom, kind: 'sym' }
      if (name === 'Infinity') return { m: [txt('∞')], prec: P.atom, kind: 'sym' }
      return { m: [txt(name, name.length === 1)], prec: P.atom, kind: 'sym' }
    }
    case 'FunctionNode': return fmtFunction(typeof n.fn === 'string' ? n.fn : n.fn?.name ?? '', n.args ?? [])
    case 'OperatorNode': return fmtOperator(n)
    default: return { m: [txt(n.toString())], prec: P.atom, kind: 'other' }
  }
}

const wrapBelow = (o: Out, prec: number): M => (o.prec < prec ? paren(o.m) : o.m)

function fmtFunction(name: string, args: Node[]): Out {
  const a = args.map(fmtNode)
  const arg0 = a[0]
  const simpleArg = arg0 && arg0.prec === P.atom && arg0.kind !== 'fn'
  const call = (label: string): Out => ({
    m: [txt(label), ...(simpleArg && args.length === 1 ? [txt(THIN), ...arg0.m] : paren(a.flatMap((x, i) => (i ? [txt(', '), ...x.m] : x.m))))],
    prec: P.mul, kind: 'fn',
  })
  switch (name) {
    case 'sqrt': return { m: [txt('√'), ...(arg0.prec === P.atom ? arg0.m : paren(arg0.m))], prec: P.atom, kind: 'fn' }
    case 'cbrt': return { m: [txt('∛'), ...(arg0.prec === P.atom ? arg0.m : paren(arg0.m))], prec: P.atom, kind: 'fn' }
    case 'abs': return { m: [txt('|'), ...arg0.m, txt('|')], prec: P.atom, kind: 'other' }
    case 'exp': return { m: [txt('e', true), { sup: arg0.m }], prec: P.pow, kind: 'sym' }
    case 'log': return args.length === 2 ? { m: [txt('log'), txt(subOf(args[1].toString()) ?? `_${args[1]}`), ...paren(arg0.m)], prec: P.mul, kind: 'fn' } : call('ln')
    case 'log10': return call('log')
    case 'log2': return call('log₂')
    case 'asin': return call('arcsin')
    case 'acos': return call('arccos')
    case 'atan': return call('arctan')
    default: return UPRIGHT_FN.has(name) ? call(name) : { m: [txt(name, name.length === 1), ...paren(a.flatMap((x, i) => (i ? [txt(', '), ...x.m] : x.m)))], prec: P.atom, kind: 'fn' }
  }
}

/** Flatten a*b*c (explicit or implicit) into its factors. */
function factors(n: Node): Node[] {
  if (n.type === 'ParenthesisNode' && n.content!.type === 'OperatorNode' && n.content!.fn === 'multiply') return factors(n.content!)
  if (n.type === 'OperatorNode' && n.fn === 'multiply') return n.args!.flatMap(factors)
  return [n]
}

function fmtOperator(n: Node): Out {
  const [a, b] = n.args ?? []
  switch (n.fn) {
    case 'add': case 'subtract': {
      const l = fmtNode(a), r = fmtNode(b)
      // x + −3 → x − 3
      const first = r.m[0]
      if (n.fn === 'add' && r.prec === P.neg && first && 't' in first && first.t === '−') {
        return { m: [...l.m, txt(' − '), ...r.m.slice(1)], prec: P.add, kind: 'other' }
      }
      const rm = n.fn === 'subtract' && (r.prec <= P.add || r.prec === P.neg) ? paren(r.m) : r.m
      return { m: [...l.m, txt(n.fn === 'add' ? ' + ' : ' − '), ...rm], prec: P.add, kind: 'other' }
    }
    case 'unaryMinus': { const o = fmtNode(a); return { m: [txt('−'), ...wrapBelow(o, P.mul)], prec: P.neg, kind: 'other' } }
    case 'unaryPlus': return fmtNode(a)
    case 'multiply': {
      // Textbook order: numbers, then variables and powers, then functions and brackets: x·2·sin(x) → 2x sin x.
      // Pull minus signs to the front: -2*x → −2x, not (−2)x.
      let negative = false
      const fs = factors(n).map((f) => {
        while (f.type === 'OperatorNode' && f.fn === 'unaryMinus') { negative = !negative; f = f.args![0] }
        return fmtNode(f)
      })
      const rank = (o: Out) => (o.kind === 'num' ? 0 : o.kind === 'sym' ? 1 : 2)
      const sorted = [...fs].sort((p, q) => rank(p) - rank(q))
      const m: M = []
      sorted.forEach((o, i) => {
        const part = o.prec < P.mul || o.prec === P.neg ? paren(o.m) : o.m
        if (i) {
          const prev = sorted[i - 1]
          if (o.kind === 'num') m.push(txt('·')) // 2·3
          else if (prev.kind === 'fn' || o.kind === 'fn') m.push(txt(THIN)) // x sin x
        }
        m.push(...part)
      })
      return negative ? { m: [txt('−'), ...m], prec: P.neg, kind: 'other' } : { m, prec: P.mul, kind: 'other' }
    }
    case 'divide': {
      const key = `${a.toString()}/${b.toString()}`
      if (FRAC[key]) return { m: [txt(FRAC[key])], prec: P.atom, kind: 'num' }
      const l = fmtNode(a), r = fmtNode(b)
      return { m: [...wrapBelow(l, P.mul), txt('/'), ...wrapBelow(r, P.pow)], prec: P.mul, kind: 'other' }
    }
    case 'pow': {
      const base = fmtNode(a), exp = fmtNode(b)
      // sin(x)^2 → sin²x, as textbooks write it.
      if (a.type === 'FunctionNode' && TRIG.has(typeof a.fn === 'string' ? a.fn : a.fn?.name ?? '') && b.type === 'ConstantNode') {
        const [label, ...rest] = base.m
        return { m: [label, { sup: exp.m }, ...rest], prec: P.mul, kind: 'fn' }
      }
      const bm = base.prec <= P.pow && base.kind !== 'fn' ? paren(base.m) : base.kind === 'fn' && base.prec !== P.atom ? paren(base.m) : base.m
      return { m: [...bm, { sup: exp.m }], prec: P.pow, kind: base.kind === 'num' ? 'num' : 'sym' }
    }
    case 'factorial': return { m: [...wrapBelow(fmtNode(a), P.atom), txt('!')], prec: P.atom, kind: 'other' }
    default: {
      const op = ({ '<=': '≤', '>=': '≥', '!=': '≠', '==': '=' } as Record<string, string>)[n.op ?? ''] ?? n.op ?? '?'
      if (n.args?.length === 2) return { m: [...fmtNode(a).m, txt(` ${op} `), ...fmtNode(b).m], prec: 0, kind: 'other' }
      return { m: [txt(n.toString())], prec: P.atom, kind: 'other' }
    }
  }
}

const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' }
const subOf = (s: string) => ([...s].every((c) => SUB[c]) ? [...s].map((c) => SUB[c]).join('') : null)

/** Typeset a formula, or null if it isn't one mathjs can read. */
function formula(src: string): M | null {
  if (!parse) return null
  try { return fmtNode(parse(src.replace(/\*\*/g, '^').replace(/·/g, '*').replace(/−/g, '-'))).m } catch { return null }
}

const NAME = /^\s*([A-Za-z][A-Za-z0-9]*(?:\(\s*[a-z]\s*\))?)\s*$/
const WORDS = /[A-Za-z]{3,}/g
const KNOWN = new Set([...UPRIGHT_FN, ...Object.keys(GREEK), 'sqrt', 'cbrt', 'abs', 'exp', 'log10', 'log2'])

/** Label → pieces. Formulas ("y = x^2", "f(x) = sin(x)*x") are typeset; "y = …" parts inside prose too. */
export function typesetLabel(label: string): M {
  const eq = label.match(/^\s*([^=]{1,12}?)\s*=\s*(.+)$/)
  if (eq && NAME.test(eq[1])) {
    const rhs = formula(eq[2])
    if (rhs && looksLikeMath(eq[2])) return [...lhs(eq[1]), txt(' = '), ...rhs]
  }
  if (looksLikeMath(label)) { const f = formula(label); if (f) return f }
  // Prose: typeset "y = <formula>" pieces ending at a word like "with" / "and", a comma or the end.
  const out: M = []
  let last = 0
  const re = /\b([yf](?:\([a-z]\))?)\s*=\s*(.+?)(?=\s+(?:with|and|for|on|when|where|if|at|is)\b|[,;]|$)/g
  for (let m: RegExpExecArray | null; (m = re.exec(label));) {
    const rhs = formula(m[2])
    if (!rhs || !looksLikeMath(m[2])) continue
    if (m.index > last) out.push(txt(prettyProse(label.slice(last, m.index))))
    out.push(...lhs(m[1]), txt(' = '), ...rhs)
    last = m.index + m[0].length
  }
  if (last < label.length) out.push(txt(prettyProse(label.slice(last))))
  return out
}

/** A formula is mostly symbols: words of 3+ letters must be function names (sin, sqrt…). */
const looksLikeMath = (s: string) => (s.match(WORDS) ?? []).every((w) => KNOWN.has(w))

function lhs(s: string): M {
  const m = s.trim().match(/^([A-Za-z][A-Za-z0-9]*)(?:\(\s*([a-z])\s*\))?$/)
  if (!m) return [txt(s.trim())]
  return m[2] ? [txt(m[1], m[1].length === 1), txt('('), txt(m[2], true), txt(')')] : [txt(m[1], m[1].length === 1)]
}

/** Light clean-up for text that isn't a formula: x^2 → x², sin(x) → sin x, 2*x → 2x. */
function prettyProse(s: string): string {
  return s
    .replace(/\b(sin|cos|tan|ln|log)\(([a-zθ])\)/g, `$1${THIN}$2`)
    .replace(/(\d)\s*[*·]\s*([a-zπθ])/g, '$1$2')
    .replace(/\^\{([^}]+)\}/g, (m, e) => supText(e) ?? m)
    .replace(/\^\(([^)]+)\)/g, (m, e) => supText(e) ?? m)
    .replace(/\^(-?\w+)/g, (m, e) => supText(e) ?? m)
    .replace(/\s*\*\s*/g, '·')
    .replace(/\bsqrt\b/g, '√').replace(/\bpi\b/g, 'π').replace(/\btheta\b/g, 'θ')
    .replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠').replace(/ - /g, ' − ')
}

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '(': '⁽', ')': '⁾', n: 'ⁿ', x: 'ˣ', i: 'ⁱ', y: 'ʸ', k: 'ᵏ', t: 'ᵗ', a: 'ᵃ', b: 'ᵇ', m: 'ᵐ',
}
const supText = (s: string) => ([...s].every((c) => SUP[c]) ? [...s].map((c) => SUP[c]).join('') : null)

// Spaces become no-break spaces: SVG collapses ordinary ones next to <tspan>s ("x sin xwith").
const escXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[  ]/g, ' ')
const SERIF = `'Cambria Math', 'Times New Roman', serif`

/** SVG <tspan>s for a label: italic serif variables, exponents raised with a smaller font. */
export function labelSvg(label: string, fontSize: number): string {
  let out = ''
  let pendingDown = 0 // px to move back down, applied to the next run of text after an exponent
  const emit = (m: M, fs: number) => {
    for (const p of m) {
      if ('sup' in p) {
        const up = fs * 0.42
        out += `<tspan dy="${(pendingDown - up).toFixed(1)}" font-size="${(fs * 0.72).toFixed(1)}">`
        pendingDown = 0
        emit(p.sup, fs * 0.72)
        out += '</tspan>'
        pendingDown += up
      } else {
        const dy = pendingDown ? ` dy="${pendingDown.toFixed(1)}"` : ''
        pendingDown = 0
        out += p.i ? `<tspan font-style="italic" font-family="${SERIF}"${dy}>${escXml(p.t)}</tspan>` : (dy ? `<tspan${dy}>${escXml(p.t)}</tspan>` : escXml(p.t))
      }
    }
  }
  emit(typesetLabel(label), fontSize)
  return out
}

/** The same label as plain Unicode text (exponents as ² ³ ˣ where possible). */
export function labelText(label: string): string {
  const plain = (m: M): string => m.map((p) => ('sup' in p ? (supText(plain(p.sup)) ?? `^(${plain(p.sup)})`) : p.t)).join('')
  return plain(typesetLabel(label))
}

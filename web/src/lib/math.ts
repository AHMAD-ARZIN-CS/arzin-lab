// Math the way people read it.
//  - In answers: LaTeX between $…$ (inline) or $$…$$ (display) is typeset with KaTeX.
//  - In diagrams (which can't hold typeset math): plain formulas are turned into Unicode,
//    so "x^2 - 4*x" reads as "x² − 4·x".
import katex from 'katex'
import 'katex/dist/katex.min.css'

const TOKEN = (i: number) => `KMATH${i}KMATH` // survives Markdown untouched

/** Pull math out of the text before Markdown runs (so "_" and "*" inside formulas aren't eaten).
 *  Code blocks and `inline code` are left alone, and prices like "$5 and $10" aren't math. */
export function extractMath(text: string): { text: string; math: { tex: string; display: boolean }[] } {
  const math: { tex: string; display: boolean }[] = []
  const keep = (tex: string, display: boolean) => { math.push({ tex: tex.trim(), display }); return TOKEN(math.length - 1) }
  // Split on code so math detection only runs on prose.
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g)
  const out = parts.map((p, i) => {
    if (i % 2 === 1) return p // code
    return p
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => keep(t, true))
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => keep(t, true))
      .replace(/\\\((.+?)\\\)/g, (_, t) => keep(t, false))
      // $…$: no space right inside the dollars, and no digit right after the closing one ("$5 and $10")
      .replace(/(^|[^\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_, pre, t) => pre + keep(t, false))
      // Older answers wrote plain-text math like "e^x" or "x^2": show the exponent raised (prose only, never code).
      .replace(/([A-Za-z0-9)])\^(\{[^}\s]+\}|\([^)\s]+\)|-?\w+)/g, (m, base, exp) => {
        const e = exp.startsWith('{') ? exp.slice(1, -1) : exp
        return base + (supOf(e) ?? m.slice(base.length))
      })
  })
  return { text: out.join(''), math }
}

/** Put typeset math back into sanitized HTML. KaTeX runs with trust: false (no links/HTML from formulas). */
export function insertMath(html: string, math: { tex: string; display: boolean }[]): string {
  return html.replace(/KMATH(\d+)KMATH/g, (_, n) => {
    const m = math[Number(n)]
    if (!m) return ''
    return katex.renderToString(m.tex, { displayMode: m.display, throwOnError: false, trust: false, strict: 'ignore', output: 'htmlAndMathml' })
  })
}

// ---------------- Unicode math for diagrams ----------------

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', x: 'ˣ', i: 'ⁱ', y: 'ʸ', k: 'ᵏ', t: 'ᵗ', a: 'ᵃ', b: 'ᵇ', m: 'ᵐ',
}
const supOf = (s: string) => ([...s].every((c) => SUP[c]) ? [...s].map((c) => SUP[c]).join('') : null)

/** "x^2 - 4*x + sqrt(x) <= pi" → "x² − 4·x + √(x) ≤ π". For math labels only, not code. */
export function prettyMath(s: string): string {
  return s
    .replace(/\^\{([^}]+)\}/g, (m, e) => supOf(e) ?? m)
    .replace(/\^\(([^)]+)\)/g, (m, e) => supOf(`(${e})`) ?? m)
    .replace(/\^(-?\w+)/g, (m, e) => supOf(e) ?? m)
    .replace(/\b(sin|cos|tan|ln|log)\(([a-zθ])\)/g, '$1 $2') // sin(x) → sin x
    .replace(/(\d)\s*[*·]\s*([a-zπθ])/g, '$1$2') // 2*x → 2x
    .replace(/\s*\*\s*/g, '·')
    .replace(/\bsqrt\(([a-z0-9])\)/g, '√$1')
    .replace(/\bsqrt\b/g, '√')
    .replace(/\bpi\b/g, 'π')
    .replace(/\btheta\b/g, 'θ')
    .replace(/\binf(inity)?\b/g, '∞')
    .replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠')
    .replace(/ - /g, ' − ')
}

/** Mermaid diagrams about math: prettify the quoted labels. Diagrams of code are left alone,
 *  since `*p` or `i <= n` there are code, not math. */
export function prettyMermaid(code: string): string {
  const looksLikeCode = /[;{}]|==|\+\+|->|::|\bint\b|\bcout\b|\breturn\b/.test(code)
  if (looksLikeCode) return code
  return code.replace(/"([^"]*)"/g, (_, label) => `"${prettyMath(label)}"`)
}

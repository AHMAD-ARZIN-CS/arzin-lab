// Turns text like "sin(x) * cos(y)" into a fast function.
// Scene files may come from agents, so we NEVER use JavaScript eval(): that would let
// a scene file run arbitrary code. mathjs parses math only, and we disable the few
// mathjs functions that can reach outside of plain math (per the mathjs security docs).
import { all, create } from 'mathjs'

const math = create(all)
const compile = math.compile
const disabled = (name: string) => () => { throw new Error(`${name}() is disabled in scenes`) }
math.import(
  {
    import: disabled('import'), createUnit: disabled('createUnit'), evaluate: disabled('evaluate'),
    parse: disabled('parse'), simplify: disabled('simplify'), derivative: disabled('derivative'),
  },
  { override: true },
)

export type Fn = (scope: Record<string, number>) => number

export function compileExpr(src: string): Fn {
  const code = compile(src)
  return (scope) => {
    const r = code.evaluate(scope)
    return typeof r === 'number' ? r : Number(r)
  }
}

/** Does this expression depend on time `t`? Then it must be re-evaluated every frame. */
export const usesTime = (...srcs: (string | undefined)[]) => srcs.some((s) => !!s && /\bt\b/.test(s))

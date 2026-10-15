// Explanations and suggestions, using the Claude Code CLI you're already signed in to.
// Safety: the CLI runs with NO tools (it can't read files or run commands), in an empty temp
// folder, with customizations disabled. Your code is passed in the prompt over stdin.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AI } from './config.js'

function claudeExecutable(): string {
  if (process.env.LAB_CLAUDE_CMD) return process.env.LAB_CLAUDE_CMD
  if (process.platform === 'win32' && process.env.APPDATA) {
    const exe = path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    if (existsSync(exe)) return exe
  }
  return AI.command
}

const SYSTEM = `You are a patient programming tutor inside a learner's coding workspace.
The learner is a CS student building fundamentals (currently C++), working up to LeetCode problems and real projects.
Rules:
- Start with plain English, then the details. Short paragraphs, no filler.
- Ground everything in THEIR code, input, and execution state when provided. Quote their identifiers.
- Use Markdown. Code in fenced blocks with a language tag.
- MATH: write every formula in LaTeX so it is typeset like a textbook: inline $\\int e^{x}\\sin x\\,dx$, and important
  equations on their own line as $$...$$ (e.g. $$\\int u\\,dv = uv - \\int v\\,du$$). Never write math as plain text like
  "e^x sin x dx" or with * for multiplication. Don't put LaTeX inside code blocks.
- Never invent program output or performance numbers. If you'd need to run something to know, say so.
- Do not write the full solution to a practice problem unless the request explicitly asks for a full solution.
- End with a line "**Go deeper:**" followed by 2-3 short follow-up topics as a bullet list (omit for hints).`

export type AiAction = 'explain' | 'visual' | 'error' | 'example' | 'hint' | 'compare' | 'fix' | 'optimize' | 'ask' | 'next' | 'solve' | 'check' | 'summarize' | 'flowchart'

export interface AiImage { mediaType: string; data: string }

export interface AiContext {
  action: AiAction
  file?: string
  language?: string
  selection?: string
  selectionLines?: [number, number]
  code?: string
  stdin?: string
  diagnostics?: string
  runOutput?: string
  stepState?: string
  problem?: string
  hintLevel?: number
  question?: string
  /** Region circled on the whiteboard (PNG), for board actions. */
  images?: AiImage[]
  /** Lecture slides the question is about. */
  lecture?: { title: string; text: string }
}

const BOARD_INTRO = `The learner circled this region of their whiteboard: handwriting, a sketch, or a pasted screenshot of a problem.
Start with a short "**What I see:**" block transcribing it (math in LaTeX between $$...$$ so it's typeset, code in a code block), so they can confirm you read the handwriting correctly. If part is illegible, say which part.
Write all math in LaTeX ($...$ inline, $$...$$ for equations); never as plain text like e^x or 4*x.`

/** How to draw: the workspace renders these fenced blocks as real graphics. */
export const DIAGRAM_GUIDE = `DIAGRAMS: the learner's app draws these fenced blocks as real graphics. Prefer them over ASCII art.
1. Graphs of functions → a \`\`\`plot block with JSON (no comments):
   {"title":"...","x":[xmin,xmax],"y":[ymin,ymax] (optional),"functions":[{"fn":"x^2 - 2*x","label":"f(x)"}],
    "points":[{"x":1,"y":-1,"label":"vertex (1,-1)"}],"vlines":[{"x":2,"label":"x = 2"}],
    "areas":[{"fn":"x^2","from":0,"to":1,"label":"area"}],"xlabel":"x","ylabel":"y"}
   Formulas use x only, mathjs syntax: + - * / ^, sqrt, sin, cos, tan, exp, log (natural), abs, pi, e. Pick a window that shows the interesting part; mark roots, extrema, intersections as points.
2. Processes, algorithms, code flow, recursion trees, data structures, state machines → a \`\`\`mermaid block
   (flowchart TD / LR, graph, stateDiagram-v2, sequenceDiagram, classDiagram). Keep labels short; quote every label: A["x = x + 1"].
   Math in mermaid labels and plot labels can't be typeset, so write it with Unicode the way a textbook shows it:
   eˣ, x², x³, √x, π, θ, ∫, Σ, ·, ≤, ≥, ≠, →, ∞ (e.g. A["I = eˣ sin x − ∫ eˣ cos x dx"]). Never e^x, x^2 or 4*x in labels, and no LaTeX there.
3. Only if neither fits (e.g. geometry), a \`\`\`svg block: one <svg> with a viewBox ≤ 640x400, no scripts/images, colors via currentColor plus #3b82f6 #22c55e #f59e0b #ef4444 #a855f7.
Use at most two diagrams, each followed by one sentence saying what to notice.`
const VISUAL_SVG = DIAGRAM_GUIDE

const TASKS: Record<AiAction, (c: AiContext) => string> = {
  explain: (c) => c.images?.length
    ? `EXPLAIN what is circled: what concept or problem it is, what each step or part means and WHY it's done, in plain English first and then precisely. If it's the learner's own work, explain their reasoning back to them and gently flag anything that looks off (without fully re-solving). ${VISUAL_SVG}`
    : `Explain the SELECTED code. Structure:
1. **In plain English** (2-4 sentences): what it is and why this program uses it here.
2. **The syntax, piece by piece.**
3. **How it behaves when this program runs** (use real values from the execution state if given).
Keep it under ~300 words.`,
  visual: (c) => c.images?.length
    ? `VISUALIZE this. Your answer MUST start (right after "What I see") with a diagram: a \`\`\`plot for anything with functions/equations/graphs, otherwise a \`\`\`mermaid diagram. The first diagram is placed on the learner's whiteboard next to what they circled, so make it clean, labeled and self-explanatory. ${DIAGRAM_GUIDE} Then explain in a few bullets what the picture shows.`
    : `Explain what the SELECTED code does at runtime. Include a \`\`\`mermaid diagram of it (a flowchart of the control flow, or boxes-and-arrows for memory/pointers/data structures), then a short step-by-step trace table of how the key variables change. Use the execution state if given. ${DIAGRAM_GUIDE}`,
  flowchart: () => `Draw the control flow of the WHOLE program as ONE mermaid flowchart. Output ONLY the \`\`\`mermaid block, nothing else.
Rules: start with "flowchart TD". Node ids MUST be L<line number> of the source line the node represents (e.g. L7), plus Start/End.
Use rectangles for statements L7["7: total += nums[i]"], diamonds for conditions L9{"9: i < n?"}, and label branch edges -->|yes| / -->|no|.
Show loops as edges going back. Merge trivial consecutive lines into one node (use the first line's number). Show function calls as their own subgraph only if short. Keep label text short and quote every label.`,
  error: () => `Explain why this ERROR happened. Structure:
1. **What the message means** in plain English.
2. **The root cause in this code** (point to the exact line/expression).
3. **How to think about fixing it** — describe the fix; show at most a 1-3 line snippet. Don't rewrite the whole program.`,
  example: () => `Give one SMALL, complete, runnable example program (in the same language) that demonstrates the concept in the SELECTED code in isolation, then explain it in 3-5 bullets. Say what it should print, and note that it hasn't been run.`,
  hint: (c) => {
    const level = c.hintLevel ?? 1
    const levels = [
      'Level 1 — a gentle nudge: ask a guiding question or name the concept to think about. One or two sentences. NO code.',
      'Level 2 — the approach: describe the strategy/data structure in words. No code.',
      'Level 3 — a walkthrough: step-by-step plan in pseudocode, tracing a small example. Still no complete solution code.',
      'Level 4 — the full solution: a complete, working solution in the same language with explanation and complexity.',
    ]
    return `The learner asked for a HINT. ${levels[Math.min(Math.max(level, 1), 4) - 1]}
Base it on the problem and their current attempt: say what is already right in their attempt, then the hint.`
  },
  compare: () => `Show ANOTHER APPROACH to what the SELECTED code (or whole program) does. Explain the difference and the tradeoffs (readability, time complexity, space complexity — as theoretical estimates, clearly labeled). Put the complete alternative program in ONE fenced code block so the learner can open it as a proposed version and test both.`,
  fix: () => `Propose a FIX for the problem in this code. First explain the bug in 2-4 sentences. Then output the COMPLETE corrected file in ONE fenced code block (it will be shown as a diff against the original; the learner decides whether to apply it). Change as little as possible.`,
  optimize: () => `Propose an OPTIMIZED version of this program. Explain: what changes, why it helps, and the tradeoffs (readability; time and space complexity as THEORETICAL estimates for both versions, clearly labeled as estimates). Output the COMPLETE optimized file in ONE fenced code block. Do not claim measured speedups — the workspace will measure both versions on the same tests.`,
  ask: (c) => `The learner asks: ${c.question ?? ''}`,
  solve: () => `Solve the problem step by step. Number the steps, say WHY each step is taken (which rule or idea), and box the final answer in bold. If it's a programming problem, give the solution code in one fenced block and its complexity. ${VISUAL_SVG}`,
  check: () => `Examine the learner's work like a careful tutor. Go through it step by step: for each step say ✅ correct or ❌ wrong. At the FIRST mistake, explain exactly what went wrong (sign error, wrong rule, algebra slip, off-by-one, logic bug...) and show the corrected step. Then say how the rest changes and give the correct final result. If everything is right, say so and point out anything that could be cleaner. Don't just re-solve from scratch: anchor on THEIR steps.`,
  summarize: () => `Turn these lecture slides into study notes for the learner:
1. **The big idea** in 2-3 sentences.
2. **Key concepts**: each with a one-line plain-English definition and, for programming topics, a tiny C++ snippet.
3. **Things students usually get wrong** about this material.
4. **Check yourself**: 4-6 short questions (answers in a collapsed list at the very end).
5. **What to practice**: which kinds of problems would build these skills.
Stick to what the slides cover; if a slide is unclear or only an image, say so instead of guessing.`,
  next: () => `Based on the problem and the learner's attempt/results, identify 1-2 concepts they seem to be missing or should strengthen, and suggest ONE next exercise (title, short statement, 2 example tests as input/expected output) that targets it. Don't solve it.`,
}

export function buildPrompt(c: AiContext): string {
  const parts: string[] = c.images?.length ? [BOARD_INTRO, '', TASKS[c.action](c), ''] : [TASKS[c.action](c), '']
  if (c.lecture) parts.push(`## Lecture slides: "${c.lecture.title}" (extracted text)`, c.lecture.text, '')
  if (c.problem) parts.push('## Problem statement', c.problem, '')
  if (c.file) parts.push(`## File: ${c.file} (${c.language ?? 'unknown language'})`)
  if (c.selection) {
    const where = c.selectionLines ? ` (lines ${c.selectionLines[0]}-${c.selectionLines[1]})` : ''
    parts.push(`## SELECTED code${where}`, '```', c.selection, '```', '')
  }
  if (c.code) parts.push('## Whole program', '```' + (c.language ?? ''), c.code, '```', '')
  if (c.stdin) parts.push('## Program input (stdin)', '```', c.stdin.slice(0, 4000), '```', '')
  if (c.diagnostics) parts.push('## Errors / diagnostics', '```', c.diagnostics.slice(0, 6000), '```', '')
  if (c.runOutput) parts.push('## Latest program output', '```', c.runOutput.slice(-4000), '```', '')
  if (c.stepState) parts.push('## Execution state at the current visualizer step', c.stepState.slice(0, 6000), '')
  return parts.join('\n')
}

export interface AiHandle { cancel(): void }

/** Stream an answer. `resume` continues a previous conversation ("go deeper"). */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

export function ask(prompt: string, opts: { resume?: string; images?: AiImage[]; system?: string }, on: {
  delta: (text: string) => void
  done: (r: { sessionId?: string; error?: string }) => void
}): AiHandle {
  const cwd = path.join(os.tmpdir(), 'arzin-lab-ai')
  mkdirSync(cwd, { recursive: true })
  // Messages go in as stream-json so they can carry images (the circled whiteboard region).
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--safe-mode', '--tools', '', '--model', AI.model, '--system-prompt', opts.system ?? SYSTEM]
  if (opts.resume) args.push('--resume', opts.resume)
  // If this server was started from inside another Claude Code session (e.g. the desktop app),
  // it inherits that session's internal variables. They make the CLI try to use the host
  // app's login instead of its own. Strip them so the CLI uses your normal `claude` login.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
    !/^(CLAUDE_CODE_|CLAUDECODE$|CLAUDE_AGENT_SDK_|CLAUDE_PID$|CLAUDE_PREVIEW_|ANTHROPIC_BASE_URL$)/.test(k)))
  let child
  try {
    child = spawn(claudeExecutable(), args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (e) {
    on.done({ error: `Could not start the Claude CLI: ${(e as Error).message}` })
    return { cancel() {} }
  }
  let buf = '', stderr = '', finished = false, streamed = false
  const finish = (r: { sessionId?: string; error?: string }) => { if (!finished) { finished = true; on.done(r) } }
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buf += chunk
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let ev
      try { ev = JSON.parse(line) } catch { continue }
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
        streamed = true
        on.delta(ev.event.delta.text)
      } else if (ev.type === 'result') {
        if (ev.is_error) {
          const msg = String(ev.result ?? 'unknown error')
          finish({ error: /authenticat|401|expired/i.test(msg) ? `${msg}\n\nFix: in a terminal run \`claude auth login\`, finish the sign-in in your browser, then ask again (no restart needed).` : msg })
        } else {
          if (!streamed && ev.result) on.delta(String(ev.result))
          finish({ sessionId: ev.session_id })
        }
      }
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (s: string) => { stderr += s })
  child.on('error', (e) => finish({ error: `Could not start the Claude CLI (${e.message}). Is Claude Code installed?` }))
  child.on('close', (code) => finish(code === 0 ? {} : { error: stderr.trim() || `Claude CLI exited with code ${code}` }))
  const images = (opts.images ?? []).filter((im) => IMAGE_TYPES.has(im.mediaType) && im.data.length < 7_000_000).slice(0, 4)
  const content = [
    ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })),
    { type: 'text', text: prompt },
  ]
  child.stdin.end(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n')
  return { cancel: () => { child.kill(); finish({ error: 'Cancelled' }) } }
}

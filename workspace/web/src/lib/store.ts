// App state in one place, with the actions that change it. Components read with useStore(selector).
import { useSyncExternalStore } from 'react'
import { askConfirm, askText } from '../components/Dialogs'
import { api, assetUrl, files, lectures, library, practice, type LanguageInfo, type ProblemMeta, type SandboxStatus, type TreeNode } from './api'
import { emptyBoard, fromExcalidraw, INK, newId, type Item } from './board'
import { onType, request, send } from './socket'
import { describeStep, type TraceResult } from './trace'

export interface Diagnostic { file: string; line: number; col?: number; severity: 'error' | 'warning' | 'note'; message: string; phase: 'compile' | 'runtime' }
export interface OpenFile { path: string; content: string; saved: string }
export interface OutChunk { kind: 'stdout' | 'stderr' | 'stdin' | 'info' | 'compile' | 'error'; text: string }
export interface RunState { id: string; file: string; status: 'compiling' | 'running' | 'done'; chunks: OutChunk[]; exit?: { code: number; description: string; ms: number } }
export interface TestResult { name: string; input: string; expected: string; actual: string; stderr: string; pass: boolean; description: string; wallMs: number | null; maxRssKb: number | null; timedOut: boolean; samples: number[] }
export interface TestRun { file: string; running: boolean; noTests?: boolean; compile?: { ok: boolean; output: string }; results: TestResult[] }
export interface Thread {
  id: string; title: string; action: string; file?: string; lines?: [number, number]
  /** Thumbnail of the whiteboard region that was sent (what the AI actually saw). */
  image?: string
  /** What this conversation is about ("practice:two-sum", "file:x.cpp", "board:…", "lecture:…"). */
  context: string
  time: string
  answer: string; status: 'streaming' | 'done' | 'error'; error?: string; sessionId?: string; followUps: { q: string; a: string }[]
}
export interface Proposal {
  file: string; title: string; original: string; proposed: string
  kind: 'ai' | 'version' | 'reference'; versionId?: string
  compare?: { running: boolean; noTests?: boolean; original?: { compile: { ok: boolean; output: string }; results: TestResult[] }; proposed?: { compile: { ok: boolean; output: string }; results: TestResult[] } }
}

export interface State {
  connected: boolean
  sandbox: SandboxStatus
  languages: LanguageInfo[]
  root: string
  tree: TreeNode[]
  open: OpenFile[]
  active: string | null
  stdin: Record<string, string>
  run: RunState | null
  diagnostics: Record<string, Diagnostic[]>
  trace: TraceResult | null
  tracing: boolean
  step: number
  playing: boolean
  speed: number
  focusLines: [number, number] | null
  threads: Thread[]
  proposal: Proposal | null
  tests: TestRun | null
  problems: ProblemMeta[]
  /** Center of the screen: the code editor, or a whiteboard. */
  mode: 'code' | 'board'
  activeBoard: string | null
  sideView: 'files' | 'practice' | 'history' | 'boards' | 'lectures'
  /** Solved practice problems (slug → when), from my-code/progress.json. */
  solved: Record<string, string>
  sideOpen: boolean
  rightOpen: boolean
  bottomOpen: boolean
  rightTab: 'visualize' | 'explain' | 'notes'
  bottomTab: 'output' | 'terminal' | 'problems' | 'tests'
  focusMode: boolean
  paletteOpen: boolean
  toast: string | null
}

const ui = JSON.parse(localStorage.getItem('lab.ui') ?? '{}') as Partial<State>

let state: State = {
  connected: false,
  sandbox: { state: 'starting', message: 'Connecting…' },
  languages: [], root: '', tree: [], open: [], active: null,
  stdin: JSON.parse(localStorage.getItem('lab.stdin') ?? '{}'),
  run: null, diagnostics: {}, trace: null, tracing: false, step: 0, playing: false, speed: 1, focusLines: null,
  threads: [], proposal: null, tests: null, problems: [],
  mode: ui.mode ?? 'code', activeBoard: ui.activeBoard ?? null, sideView: ui.sideView ?? 'files', solved: {},
  sideOpen: ui.sideOpen ?? true, rightOpen: ui.rightOpen ?? true, bottomOpen: ui.bottomOpen ?? true,
  rightTab: 'visualize', bottomTab: 'output', focusMode: false, paletteOpen: false, toast: null,
}
const subs = new Set<() => void>()

export const getState = () => state
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  subs.forEach((f) => f())
}
// Remember the layout between visits.
subs.add(() => {
  const { mode, activeBoard, sideView, sideOpen, rightOpen, bottomOpen } = state
  localStorage.setItem('lab.ui', JSON.stringify({ mode, activeBoard, sideView, sideOpen, rightOpen, bottomOpen }))
})

/** Open a side view; clicking the active one again collapses the side panel (like VS Code). */
export function showSide(view: State['sideView']) {
  setState((s) => (s.sideView === view && s.sideOpen ? { sideOpen: false } : { sideView: view, sideOpen: true }))
}
export function showRight(tab: State['rightTab']) {
  setState({ rightTab: tab, rightOpen: true })
}
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f) }
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state))
}

let toastTimer = 0
export function toast(msg: string) {
  setState({ toast: msg })
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => setState({ toast: null }), 4000)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function guard<F extends (...a: any[]) => Promise<unknown>>(fn: F) {
  return (...a: Parameters<F>) => fn(...a).catch((e: Error) => toast(e.message))
}

// ---------------- languages ----------------

export function languageOf(path: string | null | undefined): LanguageInfo | undefined {
  if (!path) return undefined
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  return state.languages.find((l) => l.exts.includes(ext))
}

// ---------------- files ----------------

export const refreshTree = guard(async () => setState({ tree: await files.tree() }))

export const openFile = guard(async (path: string) => {
  if (!state.open.some((f) => f.path === path)) {
    const content = await files.read(path)
    setState((s) => ({ open: [...s.open, { path, content, saved: content }] }))
  }
  setState({ active: path, mode: 'code', proposal: state.proposal?.file === path ? state.proposal : null })
  rememberSession()
})

export function editActive(content: string) {
  setState((s) => ({ open: s.open.map((f) => (f.path === s.active ? { ...f, content } : f)) }))
}

export const saveFile = guard(async (path = state.active ?? '', snapshot?: string) => {
  const f = state.open.find((x) => x.path === path)
  if (!f) return
  await files.write(path, f.content, snapshot)
  setState((s) => ({ open: s.open.map((x) => (x.path === path ? { ...x, saved: f.content } : x)) }))
})

export async function saveAllDirty() {
  for (const f of state.open) if (f.content !== f.saved) await saveFile(f.path)
}

export async function closeFile(path: string) {
  const f = state.open.find((x) => x.path === path)
  if (f && f.content !== f.saved && !(await askConfirm(`${path} has unsaved changes. Close it and discard them?`, true))) return
  setState((s) => {
    const open = s.open.filter((x) => x.path !== path)
    return { open, active: s.active === path ? open.at(-1)?.path ?? null : s.active }
  })
  rememberSession()
}

export const createFile = guard(async (path: string, content = '') => {
  await files.write(path, content)
  await refreshTree()
  await openFile(path)
})

export const createFolder = guard(async (path: string) => { await files.mkdir(path); await refreshTree() })

export const renamePath = guard(async (from: string, to: string) => {
  await files.rename(from, to)
  setState((s) => ({
    open: s.open.map((f) => (f.path === from || f.path.startsWith(from + '/') ? { ...f, path: to + f.path.slice(from.length) } : f)),
    active: s.active && (s.active === from || s.active.startsWith(from + '/')) ? to + s.active.slice(from.length) : s.active,
  }))
  await refreshTree()
})

export const deletePath = guard(async (path: string) => {
  await files.remove(path)
  setState((s) => {
    const open = s.open.filter((f) => !(f.path === path || f.path.startsWith(path + '/')))
    return { open, active: open.some((f) => f.path === s.active) ? s.active : open.at(-1)?.path ?? null }
  })
  await refreshTree()
  toast(`Moved ${path} to the trash (.lab/trash) — recoverable.`)
})

export const uploadFiles = guard(async (list: FileList | File[], dir = '') => {
  let last = ''
  for (const file of Array.from(list)) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    last = dir ? `${dir}/${rel}` : rel
    await files.upload(last, file)
  }
  await refreshTree()
  if (last && languageOf(last)) await openFile(last)
  toast(`Uploaded ${Array.from(list).length} file(s)`)
})

function rememberSession() {
  localStorage.setItem('lab.session', JSON.stringify({ open: state.open.map((f) => f.path), active: state.active }))
}

export function setStdin(path: string, text: string) {
  setState((s) => ({ stdin: { ...s.stdin, [path]: text } }))
  localStorage.setItem('lab.stdin', JSON.stringify(state.stdin))
}

// ---------------- run ----------------

let runSub: { id: string; unsubscribe: () => void } | null = null

export const run = guard(async () => {
  const file = state.active
  if (!file) return toast('Open a file first')
  if (!languageOf(file)) return toast(`Can't run ${file}: unsupported file type`)
  if (state.run && state.run.status !== 'done') return toast('A program is already running — Stop it first')
  await saveAllDirty()
  runSub?.unsubscribe()
  const stdin = state.stdin[file] ?? ''
  const chunks: OutChunk[] = []
  if (stdin) chunks.push({ kind: 'info', text: `▸ input from the Input box (${stdin.split('\n').filter(Boolean).length} line(s)); stdin closed after it\n` })
  setState((s) => ({ run: { id: '', file, status: 'compiling', chunks }, bottomTab: 'output', bottomOpen: true, mode: 'code', diagnostics: { ...s.diagnostics, [file]: [] } }))
  const push = (c: OutChunk) => setState((s) => (s.run ? { run: { ...s.run, chunks: [...s.run.chunks, c] } } : {}))
  runSub = request({ t: 'run', file, stdin }, (m) => {
    if (m.t === 'compile') {
      if (m.output) push({ kind: 'compile', text: m.output })
      setDiagnostics(file, m.diagnostics)
      if (m.ok) setState((s) => (s.run ? { run: { ...s.run, status: 'running' } } : {}))
      else push({ kind: 'error', text: '✖ Compilation failed — see the red markers in the editor, or the Problems tab.\n' })
    } else if (m.t === 'out') push({ kind: m.stream, text: m.data })
    else if (m.t === 'error') push({ kind: 'error', text: `✖ ${m.message}\n` })
    else if (m.t === 'exit') {
      if (m.diagnostics?.length) setDiagnostics(file, [...(state.diagnostics[file] ?? []), ...m.diagnostics])
      setState((s) => (s.run ? { run: { ...s.run, status: 'done', exit: { code: m.code, description: m.description, ms: m.ms } } } : {}))
      runSub?.unsubscribe()
    }
  })
  setState((s) => (s.run ? { run: { ...s.run, id: runSub!.id } } : {}))
})

export function sendInput(text: string) {
  const r = state.run
  if (!r || r.status !== 'running') return
  send({ t: 'stdin', id: r.id, data: text })
  setState({ run: { ...r, chunks: [...r.chunks, { kind: 'stdin', text }] } })
}
export function sendEof() {
  const r = state.run
  if (r) send({ t: 'eof', id: r.id })
}
export function stop() {
  const r = state.run
  if (r && r.status !== 'done') send({ t: 'stop', id: r.id })
}

function setDiagnostics(file: string, list: Diagnostic[] = []) {
  // Diagnostics name files relative to the workspace; keep the ones for files we know.
  const byFile: Record<string, Diagnostic[]> = { [file]: [] }
  for (const d of list) {
    const key = d.file.endsWith(file) || file.endsWith(d.file) ? file : d.file
    ;(byFile[key] ??= []).push(d)
  }
  setState((s) => ({ diagnostics: { ...s.diagnostics, ...byFile } }))
}

// ---------------- visualize ----------------

export const visualize = guard(async (opts: { jumpTo?: [number, number]; stdin?: string } = {}) => {
  const file = state.active
  if (!file) return toast('Open a file first')
  const lang = languageOf(file)
  if (!lang) return toast(`Can't visualize ${file}: unsupported file type`)
  await saveAllDirty()
  const stdin = opts.stdin ?? state.stdin[file] ?? ''
  setState({ tracing: true, rightTab: 'visualize', rightOpen: true, mode: 'code', playing: false, focusLines: opts.jumpTo ?? null })
  const sub = request({ t: 'trace', file, stdin }, (m) => {
    if (m.t === 'error') { setState({ tracing: false }); toast(m.message); sub.unsubscribe(); return }
    if (m.t !== 'trace-result') return
    sub.unsubscribe()
    const result = m as unknown as TraceResult
    if (result.compile && !result.compile.ok) setDiagnostics(file, result.compile.diagnostics as Diagnostic[])
    let step = 0
    if (opts.jumpTo && result.trace) {
      const [a, b] = opts.jumpTo
      const i = result.trace.steps.findIndex((s) => s.line >= a && s.line <= b)
      if (i >= 0) step = i
    }
    setState({ trace: result, tracing: false, step })
    // Unsupported languages still get real execution results: run it.
    if (!result.supported) run()
  })
})

export function setStep(i: number) {
  const n = state.trace?.trace?.steps.length ?? 0
  setState({ step: Math.max(0, Math.min(n - 1, i)) })
}

/** Jump to the next/previous step that executes one of the focused lines. */
export function jumpFocused(dir: 1 | -1) {
  const steps = state.trace?.trace?.steps
  if (!steps || !state.focusLines) return
  const [a, b] = state.focusLines
  for (let i = state.step + dir; i >= 0 && i < steps.length; i += dir) {
    if (steps[i].line >= a && steps[i].line <= b) return setState({ step: i })
  }
  toast(dir > 0 ? 'Those lines do not run again after this step' : 'Those lines did not run before this step')
}

// ---------------- AI explanations ----------------

export type AiAction = 'explain' | 'visual' | 'error' | 'example' | 'hint' | 'compare' | 'fix' | 'optimize' | 'ask' | 'next' | 'solve' | 'check' | 'summarize'

const TITLES: Record<AiAction, string> = {
  explain: 'Explain', visual: 'Visualize', error: 'Why this error', example: 'Small example', hint: 'Hint',
  compare: 'Another approach', fix: 'Suggest a fix', optimize: 'Optimize', ask: 'Question', next: 'Next exercise',
  solve: 'Solve', check: 'Find the mistake', summarize: 'Study notes',
}

export interface AskInput {
  action: AiAction
  selection?: string
  lines?: [number, number]
  hintLevel?: number
  question?: string
  problem?: string
  extraDiagnostics?: string
  /** A circled whiteboard region (PNG data URL). When set, the code context is left out. */
  image?: string
  /** Ask about a lecture: the server adds the slide text. */
  lectureSlug?: string
}

export function currentProblemFor(file: string | null) {
  if (!file) return undefined
  return state.problems.find((p) => file.startsWith(p.folder + '/'))
}

export const askAi = guard(async (input: AskInput) => {
  const file = state.active ?? undefined
  const f = state.open.find((x) => x.path === file)
  const lang = languageOf(file)
  const diags = (file && state.diagnostics[file]) || []
  const relevant = input.lines ? diags.filter((d) => d.line >= input.lines![0] - 1 && d.line <= input.lines![1] + 1) : diags
  const traceOk = state.trace?.trace && state.trace.file === file
  const lastRun = state.run
  const runOut = lastRun && lastRun.file === file ? lastRun.chunks.filter((c) => c.kind !== 'info').map((c) => c.text).join('') : ''
  let problem = input.problem
  const prob = currentProblemFor(file ?? null)
  if (!problem && prob) problem = await files.read(`${prob.folder}/problem.md`).catch(() => undefined)

  const id = Math.random().toString(36).slice(2)
  const snippet = (input.selection ?? input.question ?? '').trim().split('\n')[0].slice(0, 60)
  const fromBoard = !!input.image
  const fromLecture = !!input.lectureSlug
  const context = fromLecture ? contextFor({ lecture: input.lectureSlug }) : fromBoard ? contextFor({ board: state.activeBoard }) : contextFor({ file })
  const thread: Thread = {
    id, title: `${TITLES[input.action]}${input.action === 'hint' ? ` (level ${input.hintLevel ?? 1})` : ''}${snippet ? `: ${snippet}` : fromBoard ? ': circled on the board' : fromLecture ? `: ${input.lectureSlug!.replace(/-/g, ' ')}` : ''}`,
    // Lecture answers save to notes/lectures/<name>.md
    action: input.action, file: fromBoard ? undefined : fromLecture ? `lectures/${input.lectureSlug}` : file, lines: input.lines, image: input.image,
    answer: '', status: 'streaming', followUps: [], context, time: new Date().toISOString(),
  }
  setState((s) => ({ threads: [thread, ...s.threads], rightTab: 'explain', rightOpen: true }))
  const update = (patch: Partial<Thread>) => setState((s) => ({ threads: s.threads.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  const aiContext = fromLecture
    ? { action: input.action, question: input.question, lectureSlug: input.lectureSlug }
    : fromBoard
    ? {
        // A whiteboard question is about the picture, not whatever file happens to be open.
        action: input.action, question: input.question,
        images: [{ mediaType: 'image/png', data: input.image!.slice(input.image!.indexOf(',') + 1) }],
      }
    : {
        action: input.action, file, language: lang?.name, selection: input.selection, selectionLines: input.lines,
        code: f?.content, stdin: file ? state.stdin[file] : undefined,
        diagnostics: [relevant.map((d) => `line ${d.line}: ${d.severity}: ${d.message}`).join('\n'), input.extraDiagnostics].filter(Boolean).join('\n') || undefined,
        runOutput: runOut || undefined,
        stepState: traceOk ? describeStep(state.trace!.trace!, state.step, state.trace!.source) : undefined,
        problem, hintLevel: input.hintLevel, question: input.question,
      }
  const sub = request({ t: 'ai', context: aiContext }, (m) => {
    if (m.t === 'ai-delta') {
      const t = state.threads.find((x) => x.id === id)
      if (t) update({ answer: t.answer + m.text })
    } else if (m.t === 'ai-done' || m.t === 'error') {
      sub.unsubscribe()
      update(m.error || m.message ? { status: 'error', error: m.error ?? m.message } : { status: 'done', sessionId: m.sessionId })
      if (!m.error && !m.message) persistChats(context)
      // You asked for changed code: show it as a diff against yours. Nothing is applied until you click Apply.
      const code = lastCodeBlock(state.threads.find((x) => x.id === id)?.answer ?? '')
      if (!m.error && code && !fromBoard && ['fix', 'optimize', 'compare'].includes(input.action) && state.active === file) {
        propose(code, thread.title)
      }
    }
  })
})

// ---------------- saved explanations ----------------
// Every finished explanation is saved under the thing it was about, so coming back to a
// problem shows its earlier explanations. Stored in my-code/.chats/ (one file per context).

export function contextFor(o: { file?: string | null; board?: string | null; lecture?: string }): string {
  if (o.lecture) return `lecture:${o.lecture}`
  if (o.board) {
    const m = o.board.match(/^boards\/lecture-(.+)\.board\.json$/) // a lecture opened as a board
    return m ? `lecture:${m[1]}` : `board:${o.board}`
  }
  if (o.file) {
    const m = o.file.match(/^practice\/([^/]+)\//)
    return m ? `practice:${m[1]}` : `file:${o.file}`
  }
  return 'general'
}

/** The context you're looking at right now. */
export function currentContext(s: State = state): string {
  return s.mode === 'board' ? contextFor({ board: s.activeBoard }) : contextFor({ file: s.active })
}

export function contextLabel(key: string): string {
  const [kind, ...rest] = key.split(':')
  const v = rest.join(':')
  if (kind === 'practice') return state.problems.find((p) => p.slug === v)?.title ?? v
  if (kind === 'board') return `board ${boardName(v)}`
  if (kind === 'lecture') return `lecture ${v.replace(/-/g, ' ')}`
  if (kind === 'file') return v.split('/').pop() ?? v
  return 'general'
}

const saveTimers = new Map<string, number>()
function persistChats(key: string) {
  clearTimeout(saveTimers.get(key))
  saveTimers.set(key, window.setTimeout(() => {
    const threads = state.threads.filter((t) => t.context === key && t.status !== 'streaming' && t.answer)
    api('/api/chats', { method: 'PUT', json: { key, threads } }).catch((e: Error) => toast(`Explanation not saved: ${e.message}`))
  }, 300))
}

export function deleteThread(id: string) {
  const t = state.threads.find((x) => x.id === id)
  setState((s) => ({ threads: s.threads.filter((x) => x.id !== id) }))
  if (t) persistChats(t.context)
}

async function loadChats() {
  const saved = (await api<Thread[]>('/api/chats')).filter((t) => t && t.id && t.context)
    .map((t) => ({ ...t, status: t.status === 'streaming' ? 'done' : t.status }) as Thread)
  saved.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''))
  setState({ threads: saved })
}

export function followUp(threadId: string, question: string) {
  const t = state.threads.find((x) => x.id === threadId)
  if (!t?.sessionId) return toast('This answer can\'t be continued (no session).')
  const traceOk = state.trace?.trace && state.trace.file === t.file
  setState((s) => ({ threads: s.threads.map((x) => (x.id === threadId ? { ...x, status: 'streaming', followUps: [...x.followUps, { q: question, a: '' }] } : x)) }))
  const patchLast = (fn: (a: string) => string, extra: Partial<Thread> = {}) => setState((s) => ({
    threads: s.threads.map((x) => (x.id === threadId ? { ...x, ...extra, followUps: x.followUps.map((f, i) => (i === x.followUps.length - 1 ? { ...f, a: fn(f.a) } : f)) } : x)),
  }))
  const sub = request({
    t: 'ai', resume: t.sessionId,
    context: { action: 'ask', question, stepState: traceOk ? describeStep(state.trace!.trace!, state.step, state.trace!.source) : undefined },
  }, (m) => {
    if (m.t === 'ai-delta') patchLast((a) => a + m.text)
    else if (m.t === 'ai-done' || m.t === 'error') {
      sub.unsubscribe()
      if (m.error || m.message) patchLast((a) => a + `\n\n⚠ ${m.error ?? m.message}`, { status: 'error' })
      else patchLast((a) => a, { status: 'done', sessionId: m.sessionId ?? t.sessionId })
      persistChats(t.context)
    }
  })
}

// ---------------- proposals: AI changes and old versions, always shown as a diff first ----------------

export function lastCodeBlock(markdown: string): string | null {
  const blocks = [...markdown.matchAll(/```[\w+#-]*\n([\s\S]*?)```/g)]
  return blocks.length ? blocks.at(-1)![1] : null
}

export function propose(code: string, title: string, kind: Proposal['kind'] = 'ai', versionId?: string) {
  const file = state.active
  const f = state.open.find((x) => x.path === file)
  if (!file || !f) return toast('Open the file you want to compare against first')
  setState({ proposal: { file, title, original: f.content, proposed: code, kind, versionId }, focusMode: false })
}

export function updateProposed(code: string) {
  setState((s) => (s.proposal ? { proposal: { ...s.proposal, proposed: code } } : {}))
}

export const applyProposal = guard(async () => {
  const p = state.proposal
  if (!p) return
  // Keep the original recoverable: snapshot it before writing the new version.
  await files.snapshot(p.file, p.kind === 'ai' ? 'before-ai-change' : 'before-restore')
  await files.write(p.file, p.proposed)
  setState((s) => ({ open: s.open.map((f) => (f.path === p.file ? { ...f, content: p.proposed, saved: p.proposed } : f)), proposal: null }))
  toast('Applied. The previous version is saved in History.')
})

export const saveProposalAs = guard(async () => {
  const p = state.proposal
  if (!p) return
  const dot = p.file.lastIndexOf('.')
  const name = await askText('Save the proposed version as a new file:', `${p.file.slice(0, dot)}_v2${p.file.slice(dot)}`)
  if (!name) return
  await files.write(name, p.proposed)
  setState({ proposal: null })
  await refreshTree()
  await openFile(name)
})

export function compareProposal() {
  const p = state.proposal
  if (!p) return
  setState({ proposal: { ...p, compare: { running: true } }, bottomTab: 'tests', bottomOpen: true })
  const sub = request({ t: 'compare', file: p.file, proposed: p.proposed }, (m) => {
    if (m.t !== 'compare-result' && m.t !== 'error') return
    sub.unsubscribe()
    if (m.t === 'error') { toast(m.message); setState((s) => (s.proposal ? { proposal: { ...s.proposal, compare: undefined } } : {})); return }
    setState((s) => (s.proposal ? { proposal: { ...s.proposal, compare: { running: false, noTests: m.noTests, original: m.original, proposed: m.proposed } } } : {}))
  })
}

// ---------------- tests ----------------

export const runTests = guard(async () => {
  const file = state.active
  if (!file) return toast('Open a file first')
  await saveAllDirty()
  setState({ tests: { file, running: true, results: [] }, bottomTab: 'tests', bottomOpen: true, mode: 'code' })
  const sub = request({ t: 'test', file }, (m) => {
    if (m.t !== 'test-result' && m.t !== 'error') return
    sub.unsubscribe()
    if (m.t === 'error') { toast(m.message); setState({ tests: null }); return }
    if (m.compile && !m.compile.ok) setDiagnostics(file, m.compile.diagnostics)
    setState({ tests: { file, running: false, noTests: m.noTests, compile: m.compile, results: m.results ?? [] } })
    const results = (m.results ?? []) as TestResult[]
    if (results.length && results.every((r) => r.pass) && file.startsWith('practice/')) toast('All tests pass. Marked as solved ✓')
    loadProblems() // refresh solved marks
  })
})

// ---------------- practice ----------------

export const loadProblems = guard(async () => {
  const [problems, progress] = await Promise.all([practice.list(), library.progress()])
  setState({ problems, solved: progress.solved })
})

/** Turn a lecture into a board: every slide image stacked like pages in a notebook,
 *  so you can write on the slides and circle anything to ask about it. */
export const lectureToBoard = guard(async (slug: string) => {
  const path = `boards/lecture-${slug}.board.json`
  if (boardList(state.tree).includes(path)) return openBoard(path)
  const l = await lectures.get(slug)
  const items: Item[] = []
  const W = 960
  let y = 0
  for (const p of l.pages) {
    if (p.image) {
      // PDF pages are rendered at 1280px on the long side; keep their aspect ratio.
      const dims = await imageSize(assetUrl(`lectures/${slug}/${p.image}`))
      const h = dims ? (W * dims.h) / dims.w : W * 0.5625
      items.push({ id: newId(), kind: 'image', src: assetUrl(`lectures/${slug}/${p.image}`), x: 0, y, w: W, h })
      y += h + 48
    } else {
      // PowerPoint: slide text as a text block, with its pictures underneath.
      const text = `Slide ${p.n}\n${p.text}`.trim()
      items.push({ id: newId(), kind: 'text', x: 0, y, text, color: INK, size: 20 })
      y += text.split('\n').length * 26 + 16
      for (const img of p.images) {
        const dims = await imageSize(assetUrl(`lectures/${slug}/${img}`))
        const w = Math.min(560, dims?.w ?? 560), h = dims ? (w * dims.h) / dims.w : 320
        items.push({ id: newId(), kind: 'image', src: assetUrl(`lectures/${slug}/${img}`), x: 0, y, w, h })
        y += h + 16
      }
      y += 48
    }
  }
  await files.write(path, JSON.stringify({ version: 1, paper: 'plain', items, view: { x: -40, y: -40, zoom: 0.8 } }))
  await refreshTree()
  openBoard(path)
})

function imageSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// ---------------- whiteboards ----------------

export function allFiles(nodes: TreeNode[] = state.tree): string[] {
  return nodes.flatMap((n) => (n.type === 'file' ? [n.path] : allFiles(n.children ?? [])))
}
export const boardList = (tree: TreeNode[]) => allFiles(tree).filter((p) => p.endsWith('.board.json'))
export const boardName = (path: string) => path.split('/').pop()!.replace(/\.board\.json$/, '')

export function openBoard(path: string) {
  setState({ activeBoard: path, mode: 'board' })
}

export const newBoard = guard(async (name?: string) => {
  const base = (name ?? `board-${new Date().toISOString().slice(0, 10)}`).trim().replace(/[\\/:*?"<>|]+/g, '-') || 'board'
  const taken = new Set(boardList(state.tree))
  let path = `boards/${base}.board.json`
  for (let i = 2; taken.has(path); i++) path = `boards/${base}-${i}.board.json`
  await files.write(path, JSON.stringify(emptyBoard()))
  await refreshTree()
  openBoard(path)
})

/** One-time: turn whiteboards from the old Excalidraw panel (notes/**.excalidraw) into boards.
 *  The original files are left exactly as they are. */
async function importOldBoards() {
  const existing = new Set(boardList(state.tree))
  let made = 0
  for (const p of allFiles().filter((x) => x.startsWith('notes/') && x.endsWith('.excalidraw'))) {
    const name = p.slice('notes/'.length).replace(/\.excalidraw$/, '').replace(/\//g, '-')
    const target = `boards/${name}.board.json`
    if (existing.has(target)) continue
    try {
      const doc = fromExcalidraw(await files.read(p))
      await files.write(target, JSON.stringify(doc))
      made++
    } catch { /* not a valid drawing: skip */ }
  }
  if (made) { await refreshTree(); toast(`Imported ${made} whiteboard(s) from your old notes into Boards`) }
}

// ---------------- boot ----------------

onType('status', (m) => setState({ sandbox: m.sandbox }))

export async function boot() {
  const st = await fetch('/api/status', { headers: { 'X-Lab': '1' } }).then((r) => r.json())
  setState({ languages: st.languages, root: st.root, sandbox: st.sandbox })
  await refreshTree()
  await loadProblems()
  await loadChats().catch(() => {})
  await importOldBoards()
  if (state.activeBoard && !boardList(state.tree).includes(state.activeBoard)) setState({ activeBoard: null, mode: 'code' })
  const saved = JSON.parse(localStorage.getItem('lab.session') ?? 'null') as { open: string[]; active: string | null } | null
  const all = new Set<string>()
  const walk = (n: TreeNode[]) => n.forEach((x) => (x.type === 'file' ? all.add(x.path) : walk(x.children ?? [])))
  walk(state.tree)
  const toOpen = saved?.open.filter((p) => all.has(p)) ?? []
  if (!toOpen.length && all.has('start-here/vector_loop.cpp')) toOpen.push('start-here/vector_loop.cpp')
  const mode = state.mode // reopening files switches to Code; keep whatever mode you were in
  for (const p of toOpen) await openFile(p)
  if (saved?.active && all.has(saved.active)) setState({ active: saved.active })
  setState({ mode })
}

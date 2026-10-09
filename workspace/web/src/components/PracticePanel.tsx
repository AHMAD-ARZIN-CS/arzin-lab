import { CheckCircle2, Circle, Download, Library, ListTodo, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { files, library, practice, type LibraryProblem, type ProblemMeta } from '../lib/api'
import { request } from '../lib/socket'
import { askAi, currentProblemFor, loadProblems, openFile, propose, refreshTree, runTests, toast, useStore } from '../lib/store'
import { askConfirm } from './Dialogs'
import { Markdown } from './Markdown'

const HINTS = ['Nudge', 'Approach', 'Walkthrough', 'Full solution']
type Tab = 'mine' | 'library' | 'generate'

export function PracticePanel() {
  const current = useStore((s) => currentProblemFor(s.active))
  const [tab, setTab] = useState<Tab>('mine')
  const [creating, setCreating] = useState(false)
  const [statement, setStatement] = useState('')
  const [hintLevel, setHintLevel] = useState<Record<string, number>>({})

  useEffect(() => {
    if (current) files.read(`${current.folder}/problem.md`).then(setStatement, () => setStatement(''))
  }, [current?.folder]) // eslint-disable-line react-hooks/exhaustive-deps

  if (creating) return <NewProblem onDone={() => setCreating(false)} />
  const level = current ? hintLevel[current.slug] ?? 0 : 0

  const hint = async () => {
    if (!current) return
    const next = level + 1
    if (next === 4 && !(await askConfirm('Show the full solution? If you haven\'t tried the walkthrough yet, try it first: solving it yourself is where the learning happens.'))) return
    setHintLevel({ ...hintLevel, [current.slug]: next })
    askAi({ action: 'hint', hintLevel: next })
  }
  const reference = async () => {
    if (!current) return
    if (!(await askConfirm('Compare your code with the reference solution? Try the hints first if you haven\'t: seeing the answer too early skips the learning.'))) return
    try {
      propose(await library.solution(current.slug), 'reference solution', 'reference')
    } catch (e) { toast((e as Error).message) }
  }

  return (
    <div className="practice">
      <div className="side-head">
        <span>Practice</span>
        <button className="icon-btn" title="Write your own problem" onClick={() => setCreating(true)}>+</button>
      </div>
      {current && (
        <div className="problem">
          <Markdown text={statement} />
          <div className="problem-actions">
            <button className="btn primary small" onClick={runTests}>Run tests ({current.testCount})</button>
            <button className="btn small" onClick={hint} disabled={level >= 4} title="Each click gives a stronger hint">
              {level >= 4 ? 'Solution shown' : `Hint ${level + 1}/4: ${HINTS[level]}`}
            </button>
            <button className="btn small ghost" onClick={reference}>Reference solution</button>
            <button className="btn small ghost" onClick={() => askAi({ action: 'next' })}>What next?</button>
          </div>
        </div>
      )}
      <div className="seg">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}><ListTodo size={14} /> Mine</button>
        <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}><Library size={14} /> Library</button>
        <button className={tab === 'generate' ? 'on' : ''} onClick={() => setTab('generate')}><Sparkles size={14} /> Generate</button>
      </div>
      {tab === 'mine' && <MyProblems />}
      {tab === 'library' && <LibraryList />}
      {tab === 'generate' && <Generate onDone={() => setTab('mine')} />}
    </div>
  )
}

function group<T extends { topic: string }>(list: T[]) {
  const g = new Map<string, T[]>()
  list.forEach((p) => g.set(p.topic, [...(g.get(p.topic) ?? []), p]))
  return [...g.entries()]
}

function MyProblems() {
  const problems = useStore((s) => s.problems)
  const solved = useStore((s) => s.solved)
  const active = useStore((s) => s.active)
  const done = problems.filter((p) => solved[p.slug]).length
  return (
    <div className="problem-list">
      {problems.length > 0 && (
        <div className="progress-row">
          <div className="progress-bar"><span style={{ width: `${(done / problems.length) * 100}%` }} /></div>
          <span className="muted small">{done}/{problems.length} solved</span>
        </div>
      )}
      {group(problems).map(([topic, list]) => (
        <div key={topic}>
          <div className="group-title">{topic}</div>
          {list.map((p: ProblemMeta) => (
            <button key={p.slug} className={`problem-item ${active?.startsWith(p.folder + '/') ? 'active' : ''}`} onClick={() => openFile(`${p.folder}/${p.starter}`)}>
              {solved[p.slug] ? <CheckCircle2 size={14} className="ok" /> : <Circle size={14} className="muted" />}
              <span className="row-name">{p.title}</span><span className={`diff diff-${p.difficulty}`}>{p.difficulty}</span>
            </button>
          ))}
        </div>
      ))}
      {!problems.length && <p className="pane-empty">No problems yet. Add some from the Library, or generate them from your lectures.</p>}
    </div>
  )
}

function LibraryList() {
  const [items, setItems] = useState<LibraryProblem[] | null>(null)
  const [filter, setFilter] = useState('')
  const load = () => library.list().then(setItems, (e: Error) => toast(e.message))
  useEffect(() => { load() }, [])
  const install = async (p: LibraryProblem) => {
    try {
      const r = p.installed ? { starter: `practice/${p.slug}/main.cpp` } : await library.install(p.slug)
      await Promise.all([refreshTree(), loadProblems()])
      await openFile(r.starter)
      load()
    } catch (e) { toast((e as Error).message) }
  }
  if (!items) return <div className="pane-empty">Loading library…</div>
  const shown = items.filter((p) => !filter || `${p.title} ${p.topic} ${p.concepts.join(' ')}`.toLowerCase().includes(filter.toLowerCase()))
  const solved = items.filter((p) => p.solved).length
  return (
    <div className="problem-list">
      <div className="lib-head">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter: recursion, pointers, stack…" />
        <span className="muted small">{solved}/{items.length} solved</span>
      </div>
      <p className="muted small lib-note">A path from basics to graphs. Each problem's tests were produced by running a reference solution. Click one to add it to your practice folder.</p>
      {group(shown).map(([topic, list]) => (
        <div key={topic}>
          <div className="group-title">{topic}</div>
          {list.map((p) => (
            <button key={p.slug} className="problem-item" onClick={() => install(p)} title={p.concepts.length ? `Concepts: ${p.concepts.join(', ')}` : undefined}>
              {p.solved ? <CheckCircle2 size={14} className="ok" /> : p.installed ? <Circle size={14} className="muted" /> : <Download size={14} className="muted" />}
              <span className="row-name">{p.title}</span><span className={`diff diff-${p.difficulty}`}>{p.difficulty}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Practice problems from a lecture or any topic, with tests verified by running a reference solution. */
export function Generate({ onDone, lecture }: { onDone?: () => void; lecture?: string }) {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(3)
  const [difficulty, setDifficulty] = useState('mixed')
  const [status, setStatus] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: { title: string; starter: string; tests: number }[]; skipped: { title: string; reason: string }[] } | null>(null)

  const go = () => {
    setResult(null)
    setStatus('Starting…')
    const sub = request({ t: 'gen-problems', request: { lecture, topic, count, difficulty } }, async (m) => {
      if (m.t === 'gen-progress') setStatus(m.message)
      else if (m.t === 'gen-result' || m.t === 'error') {
        sub.unsubscribe()
        setStatus(null)
        if (m.t === 'error') return toast(m.message)
        setResult(m as never)
        await Promise.all([refreshTree(), loadProblems()])
        if (m.created?.[0]) openFile(m.created[0].starter)
      }
    })
  }

  return (
    <div className="gen">
      {!lecture && (
        <label>Topic or skill to practice
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. 2D vectors, recursion on strings, pointers to structs" />
        </label>
      )}
      <div className="gen-row">
        <label>How many
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
        </label>
        <label>Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </select>
        </label>
      </div>
      <button className="btn primary" disabled={!!status || (!lecture && !topic.trim())} onClick={go}><Sparkles size={14} /> {status ? 'Working…' : 'Generate problems'}</button>
      {status && <p className="muted small"><span className="spinner" />{status}</p>}
      {result && (
        <div className="gen-result">
          {result.created.map((c) => <div key={c.starter} className="ok small">✓ {c.title} ({c.tests} verified tests)</div>)}
          {result.skipped.map((s) => <div key={s.title} className="warn small">✗ {s.title}: {s.reason} (skipped)</div>)}
          {result.created.length > 0 && onDone && <button className="btn small" onClick={onDone}>Show my problems</button>}
        </div>
      )}
      <p className="muted small">The AI writes each problem and a reference solution. The sandbox then compiles and runs that solution to produce the expected outputs, and problems that don't compile or crash are dropped.</p>
    </div>
  )
}

function NewProblem({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [statement, setStatement] = useState('')
  const [starter, setStarter] = useState('#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n')
  const [language, setLanguage] = useState('cpp')
  const [tests, setTests] = useState([{ input: '', expected: '' }])
  const save = async () => {
    try {
      const r = await practice.create({ title, statement, starter, language, tests: tests.filter((t) => t.input || t.expected) })
      await loadProblems(); await refreshTree(); await openFile(r.starter)
      onDone()
    } catch (e) { toast((e as Error).message) }
  }
  return (
    <div className="new-problem">
      <div className="side-head"><span>New problem</span><button className="icon-btn" onClick={onDone}>×</button></div>
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Valid Parentheses" /></label>
      <label>Problem statement (paste from LeetCode, a textbook, class…)<textarea rows={6} value={statement} onChange={(e) => setStatement(e.target.value)} /></label>
      <label>Language
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="cpp">C++</option><option value="c">C</option><option value="python">Python</option><option value="javascript">JavaScript</option><option value="java">Java (class must be named main)</option>
        </select>
      </label>
      <label>Starter code<textarea rows={6} className="mono" value={starter} onChange={(e) => setStarter(e.target.value)} /></label>
      <div className="tests-edit">
        <div className="group-title">Test cases (stdin → expected stdout)</div>
        {tests.map((t, i) => (
          <div key={i} className="test-edit">
            <textarea rows={2} className="mono" placeholder="input" value={t.input} onChange={(e) => setTests(tests.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} />
            <textarea rows={2} className="mono" placeholder="expected output" value={t.expected} onChange={(e) => setTests(tests.map((x, j) => (j === i ? { ...x, expected: e.target.value } : x)))} />
          </div>
        ))}
        <button className="btn small" onClick={() => setTests([...tests, { input: '', expected: '' }])}>+ test</button>
      </div>
      <button className="btn primary" disabled={!title.trim()} onClick={save}>Create problem</button>
    </div>
  )
}

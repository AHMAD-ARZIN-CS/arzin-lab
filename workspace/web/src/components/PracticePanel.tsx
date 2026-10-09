import { useEffect, useState } from 'react'
import { files, practice, type ProblemMeta } from '../lib/api'
import { askAi, currentProblemFor, loadProblems, openFile, refreshTree, runTests, toast, useStore } from '../lib/store'
import { askConfirm } from './Dialogs'
import { Markdown } from './Markdown'

const HINTS = ['Nudge', 'Approach', 'Walkthrough', 'Full solution']

export function PracticePanel() {
  const problems = useStore((s) => s.problems)
  const active = useStore((s) => s.active)
  const current = useStore((s) => currentProblemFor(s.active))
  const [creating, setCreating] = useState(false)
  const [statement, setStatement] = useState('')
  const [hintLevel, setHintLevel] = useState<Record<string, number>>({})

  useEffect(() => {
    if (current) files.read(`${current.folder}/problem.md`).then(setStatement, () => setStatement(''))
  }, [current?.folder]) // eslint-disable-line react-hooks/exhaustive-deps

  if (creating) return <NewProblem onDone={() => setCreating(false)} />

  const groups = new Map<string, ProblemMeta[]>()
  problems.forEach((p) => groups.set(p.topic, [...(groups.get(p.topic) ?? []), p]))
  const level = current ? hintLevel[current.slug] ?? 0 : 0

  const hint = async () => {
    if (!current) return
    const next = level + 1
    if (next === 4 && !(await askConfirm('Show the full solution? If you haven\'t tried the walkthrough yet, try it first: solving it yourself is where the learning happens.'))) return
    setHintLevel({ ...hintLevel, [current.slug]: next })
    askAi({ action: 'hint', hintLevel: next })
  }

  return (
    <div className="practice">
      <div className="panel-head">
        <span>Practice</span>
        <div className="head-actions"><button className="btn small" onClick={() => setCreating(true)}>+ My own problem</button></div>
      </div>
      {current && (
        <div className="problem">
          <Markdown text={statement} />
          <div className="problem-actions">
            <button className="btn primary small" onClick={runTests}>Run tests ({current.testCount})</button>
            <button className="btn small" onClick={hint} disabled={level >= 4} title="Each click gives a stronger hint">
              {level >= 4 ? 'Solution shown' : `Hint ${level + 1}/4: ${HINTS[level]}`}
            </button>
            <button className="btn small" onClick={() => askAi({ action: 'next' })}>What should I practice next?</button>
          </div>
          <p className="muted small">Hints start with a nudge and only reach a full solution if you keep asking. Tests are in <code>{current.folder}/tests.json</code>; add your own edge cases there.</p>
        </div>
      )}
      <div className="problem-list">
        {[...groups.entries()].map(([topic, list]) => (
          <div key={topic}>
            <div className="group-title">{topic}</div>
            {list.map((p) => (
              <button key={p.slug} className={`problem-item ${active?.startsWith(p.folder + '/') ? 'active' : ''}`} onClick={() => openFile(`${p.folder}/${p.starter}`)}>
                <span>{p.title}</span><span className={`diff diff-${p.difficulty}`}>{p.difficulty}</span>
              </button>
            ))}
          </div>
        ))}
        {!problems.length && <p className="muted pad">No problems found in <code>practice/</code>.</p>}
      </div>
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
      <div className="panel-head"><span>New problem</span><button className="icon-btn" onClick={onDone}>×</button></div>
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

// Your course slides: upload, read, write on them, ask about them, and practice from them.
import { BookOpen, FileText, NotebookPen, PenLine, Sparkles, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { files, lectures, type LectureMeta } from '../lib/api'
import { request } from '../lib/socket'
import { askAi, lectureToBoard, refreshTree, toast } from '../lib/store'
import { askConfirm } from './Dialogs'
import { Generate } from './PracticePanel'

const slugify = (s: string) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'lecture'

export function LecturesPanel() {
  const [list, setList] = useState<LectureMeta[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [showGen, setShowGen] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = () => lectures.list().then(setList, (e: Error) => toast(e.message))
  useEffect(() => { load() }, [])

  const upload = async (fl: FileList) => {
    for (const file of Array.from(fl)) {
      if (!/\.(pdf|pptx|md|txt)$/i.test(file.name)) { toast(`${file.name}: upload PDF, PPTX, MD or TXT`); continue }
      const slug = slugify(file.name)
      const path = `lectures/${slug}/${file.name.replace(/[^\w.-]+/g, '_')}`
      setBusy(`Uploading ${file.name}…`)
      try {
        await files.upload(path, file)
        await new Promise<void>((resolve) => {
          const sub = request({ t: 'lecture-import', path }, (m) => {
            if (m.t === 'lecture-progress') setBusy(m.message)
            else if (m.t === 'lecture-imported' || m.t === 'error') {
              sub.unsubscribe()
              if (m.t === 'error') toast(m.message)
              else { toast(`${file.name}: ${m.pages} page(s) ready${m.warnings?.length ? ` (${m.warnings[0]})` : ''}`); setSelected(slug) }
              resolve()
            }
          })
        })
      } catch (e) { toast((e as Error).message) }
    }
    setBusy(null)
    await Promise.all([load(), refreshTree()])
  }

  const sel = list?.find((l) => l.slug === selected)

  return (
    <div className="side-section"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}>
      <div className="side-head">
        <span>Lectures</span>
        <button className="icon-btn" title="Upload slides (PDF, PPTX, MD, TXT)" onClick={() => input.current?.click()}><Upload size={15} /></button>
        <input ref={input} type="file" hidden multiple accept=".pdf,.pptx,.md,.txt" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
      </div>
      {busy && <p className="muted small pad-x"><span className="spinner" />{busy}</p>}
      {list && list.length === 0 && !busy && (
        <div className="side-empty">
          <p>Upload your CS lecture slides (PDF works best, PPTX and notes too). You can then write on them, circle anything to ask about it, get study notes, and generate practice problems from them.</p>
          <button className="btn primary small" onClick={() => input.current?.click()}><Upload size={14} /> Upload slides</button>
        </div>
      )}
      <div className="list">
        {list?.map((l) => (
          <div key={l.slug} className={`list-row ${l.slug === selected ? 'active' : ''}`} onClick={() => { setSelected(l.slug); setShowGen(false) }}>
            <BookOpen size={14} className="row-icon" />
            <span className="row-name">{l.title}</span>
            <span className="row-hint">{l.pageCount ? `${l.pageCount} p` : '…'}</span>
          </div>
        ))}
      </div>

      {sel && (
        <div className="lecture-card">
          <div className="lecture-title"><FileText size={14} /> {sel.source || sel.title}</div>
          {sel.warnings.map((w) => <p key={w} className="warn small">{w}</p>)}
          <div className="lecture-actions">
            <button className="btn small primary" onClick={() => lectureToBoard(sel.slug)} title="Slides as notebook pages: write on them, circle to ask AI"><PenLine size={14} /> Open as board</button>
            <button className="btn small" onClick={() => askAi({ action: 'summarize', lectureSlug: sel.slug })}><NotebookPen size={14} /> Study notes</button>
            <button className="btn small" onClick={() => setShowGen(!showGen)}><Sparkles size={14} /> Practice problems</button>
          </div>
          {showGen && <Generate lecture={sel.slug} />}
          <form className="lecture-ask" onSubmit={(e) => { e.preventDefault(); if (question.trim()) { askAi({ action: 'ask', lectureSlug: sel.slug, question: question.trim() }); setQuestion('') } }}>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about this lecture…" />
          </form>
          <button className="link-btn small danger" onClick={async () => {
            if (await askConfirm(`Move lecture "${sel.title}" to the trash?`, true)) {
              await files.remove(`lectures/${sel.slug}`); setSelected(null); load(); refreshTree()
            }
          }}>Delete lecture</button>
        </div>
      )}
      <p className="side-foot">Drop files here to upload. Slides are read inside the sandbox and saved in <code>lectures/</code>. Answers can be saved to your notes.</p>
    </div>
  )
}

// The whiteboard: write by hand, paste problems, circle anything and ask the AI about it.
import {
  Eraser, Hand, Highlighter, ImagePlus, Lasso, Lightbulb, Microscope, PenLine, Redo2, ScanSearch,
  Sparkles, Trash2, Type, Undo2, Wand2, X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  bounds, captureRegion, drawItems, drawPaper, emptyBoard, HIGHLIGHT_COLORS, hitStrokes, INK, lassoSelect, newId,
  PALETTES, PEN_COLORS, parseBoard, SIZES, translateItem, unionBox,
  type BoardDoc, type Item, type Paper, type Pt, type StrokeItem, type View,
} from '../lib/board'
import { files } from '../lib/api'
import { askAi, boardName, toast, useStore, type AiAction } from '../lib/store'
import { useTheme } from '../lib/theme'

type Tool = 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'text' | 'hand'
interface Selection { ids: Set<string>; poly: [number, number][]; image: string | null }

const TOOLS: { id: Tool; icon: typeof PenLine; label: string; key: string }[] = [
  { id: 'pen', icon: PenLine, label: 'Pen', key: 'p' },
  { id: 'highlighter', icon: Highlighter, label: 'Highlighter', key: 'h' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', key: 'e' },
  { id: 'lasso', icon: Lasso, label: 'Lasso: circle something to move it or ask AI', key: 'l' },
  { id: 'text', icon: Type, label: 'Text', key: 't' },
  { id: 'hand', icon: Hand, label: 'Pan (or hold Space)', key: ' ' },
]

const AI_ACTIONS: { action: AiAction; icon: typeof PenLine; label: string }[] = [
  { action: 'solve', icon: Sparkles, label: 'Solve' },
  { action: 'explain', icon: Lightbulb, label: 'Explain' },
  { action: 'visual', icon: ScanSearch, label: 'Visualize' },
  { action: 'check', icon: Microscope, label: 'Find the mistake' },
]

/** Is the user typing in a text field or the code editor? Then board shortcuts stay out of the way. */
const isTyping = (t: EventTarget | null) => t instanceof Element && !!t.closest('input, textarea, select, .monaco-editor')

export function Board() {
  const path = useStore((s) => s.activeBoard)
  if (!path) return <BoardEmpty />
  return <BoardCanvas key={path} path={path} />
}

function BoardEmpty() {
  return (
    <div className="board-empty">
      <PenLine size={28} />
      <h2>Pick a board</h2>
      <p>Open one from <b>Boards</b> on the left, or create a new one. Write by hand, paste a screenshot of a problem, then circle it with the lasso and ask the AI to solve, explain, visualize, or find your mistake.</p>
    </div>
  )
}

function BoardCanvas({ path }: { path: string }) {
  const theme = useTheme()
  const pal = PALETTES[theme]
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [doc, setDoc] = useState<BoardDoc | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [penColor, setPenColor] = useState(INK)
  const [hlColor, setHlColor] = useState(HIGHLIGHT_COLORS[0])
  const [penSize, setPenSize] = useState(1)
  const [hlSize, setHlSize] = useState(1)
  const [sel, setSel] = useState<Selection | null>(null)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; value: string } | null>(null)
  const [, force] = useState(0)

  // Mutable interaction state (kept out of React to stay smooth while drawing).
  const view = useRef<View>({ x: 0, y: 0, zoom: 1 })
  const live = useRef<{ stroke?: StrokeItem; lasso?: [number, number][]; drag?: { x: number; y: number; dx: number; dy: number } }>({})
  const past = useRef<Item[][]>([])
  const future = useRef<Item[][]>([])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const penSeen = useRef(false)
  const spaceDown = useRef(false)
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const pinch = useRef<{ d: number; zoom: number; cx: number; cy: number; vx: number; vy: number } | null>(null)
  const erasing = useRef(false)
  const docRef = useRef<BoardDoc | null>(null)
  docRef.current = doc

  // ---------- load & autosave ----------
  useEffect(() => {
    files.read(path).then((t) => {
      const d = parseBoard(t)
      if (d.view) view.current = d.view
      setDoc(d)
    }, () => setDoc(emptyBoard()))
  }, [path])

  const saveTimer = useRef(0)
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const d = docRef.current
      if (d) files.write(path, JSON.stringify({ ...d, view: view.current })).catch((e: Error) => toast(`Board not saved: ${e.message}`))
    }, 700)
  }, [path])
  useEffect(() => () => { clearTimeout(saveTimer.current); const d = docRef.current; if (d) files.write(path, JSON.stringify({ ...d, view: view.current })).catch(() => {}) }, [path])

  /** Change the items with an undo entry. */
  const commit = useCallback((next: Item[]) => {
    const d = docRef.current
    if (!d) return
    past.current.push(d.items)
    if (past.current.length > 200) past.current.shift()
    future.current = []
    setDoc({ ...d, items: next })
    scheduleSave()
  }, [scheduleSave])

  const undo = () => { const d = docRef.current; const prev = past.current.pop(); if (d && prev) { future.current.push(d.items); setDoc({ ...d, items: prev }); setSel(null); scheduleSave() } }
  const redo = () => { const d = docRef.current; const next = future.current.pop(); if (d && next) { past.current.push(d.items); setDoc({ ...d, items: next }); setSel(null); scheduleSave() } }

  // ---------- rendering ----------
  const raf = useRef(0)
  const draw = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const c = canvas.current, d = docRef.current
      if (!c || !d) return
      const dpr = window.devicePixelRatio || 1
      const w = c.clientWidth, h = c.clientHeight
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr) }
      const ctx = c.getContext('2d')!
      const v = view.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawPaper(ctx, w, h, v, d.paper, pal)
      ctx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, -v.x * v.zoom * dpr, -v.y * v.zoom * dpr)
      const drag = live.current.drag
      const items = drag && sel ? d.items.map((it) => (sel.ids.has(it.id) ? translateItem(it, drag.dx, drag.dy) : it)) : d.items
      drawItems(ctx, live.current.stroke ? [...items, live.current.stroke] : items, pal, draw)
      // Lasso while drawing, and the selection outline afterwards.
      ctx.lineWidth = 1.5 / v.zoom
      ctx.strokeStyle = pal.selection
      ctx.setLineDash([6 / v.zoom, 5 / v.zoom])
      const poly = live.current.lasso ?? sel?.poly
      if (poly && poly.length > 1) {
        ctx.beginPath()
        poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        if (!live.current.lasso) ctx.closePath()
        ctx.fillStyle = theme === 'dark' ? 'rgba(122,167,255,0.08)' : 'rgba(47,107,255,0.06)'
        if (!live.current.lasso) ctx.fill()
        ctx.stroke()
      }
      ctx.setLineDash([])
    })
  }, [pal, sel, theme])
  useEffect(draw, [doc, draw])
  // Redraw on resize — including when the board becomes visible after switching from Code mode.
  // Depends on `loaded` because the canvas only exists once the board file has loaded.
  const loaded = doc !== null
  useEffect(() => {
    const ro = new ResizeObserver(draw)
    if (canvas.current) ro.observe(canvas.current)
    return () => ro.disconnect()
  }, [draw, loaded])

  // ---------- coordinates ----------
  const toWorld = (clientX: number, clientY: number): [number, number] => {
    const r = canvas.current!.getBoundingClientRect(), v = view.current
    return [(clientX - r.left) / v.zoom + v.x, (clientY - r.top) / v.zoom + v.y]
  }
  const toScreen = (x: number, y: number): [number, number] => {
    const v = view.current
    return [(x - v.x) * v.zoom, (y - v.y) * v.zoom]
  }
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const v = view.current
    const [wx, wy] = toWorld(clientX, clientY)
    const zoom = Math.min(6, Math.max(0.15, v.zoom * factor))
    const r = canvas.current!.getBoundingClientRect()
    view.current = { zoom, x: wx - (clientX - r.left) / zoom, y: wy - (clientY - r.top) / zoom }
    force((n) => n + 1)
    draw()
    scheduleSave()
  }

  // ---------- pointer input ----------
  const selBox = sel && doc ? unionBox(doc.items.filter((it) => sel.ids.has(it.id)).map(bounds)) : null

  const onPointerDown = (e: React.PointerEvent) => {
    const d = docRef.current
    if (!d) return
    try { canvas.current!.setPointerCapture(e.pointerId) } catch { /* some devices/synthetic events don't support capture */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (e.pointerType === 'pen') penSeen.current = true

    // Two fingers: pinch-zoom and pan.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      live.current = {}
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.current.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: view.current.x, vy: view.current.y }
      draw()
      return
    }
    // Palm rejection: once a pen is used, a finger pans instead of drawing (like GoodNotes).
    const panGesture = tool === 'hand' || spaceDown.current || e.button === 1 || (e.pointerType === 'touch' && penSeen.current)
    if (panGesture) {
      pan.current = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y }
      return
    }
    const [x, y] = toWorld(e.clientX, e.clientY)
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5

    if (tool === 'pen' || tool === 'highlighter') {
      setSel(null)
      const hl = tool === 'highlighter'
      live.current.stroke = { id: newId(), kind: tool, color: hl ? hlColor : penColor, size: hl ? SIZES.highlighter[hlSize] : SIZES.pen[penSize], points: [[x, y, pressure]] }
    } else if (tool === 'eraser') {
      setSel(null)
      erasing.current = true
      eraseAt(x, y, true)
    } else if (tool === 'lasso') {
      if (selBox && x >= selBox.x && x <= selBox.x + selBox.w && y >= selBox.y && y <= selBox.y + selBox.h) {
        live.current.drag = { x, y, dx: 0, dy: 0 } // drag the selection
      } else {
        setSel(null)
        setAsking(false)
        live.current.lasso = [[x, y]]
      }
    } else if (tool === 'text') {
      setTextEdit({ x, y, value: '' })
    }
    draw()
  }

  /** One undo step per eraser drag: the items as they were when the drag started. */
  const eraseStart = useRef<Item[] | null>(null)
  const eraseAt = (x: number, y: number, first: boolean) => {
    const d = docRef.current!
    if (first) eraseStart.current = d.items
    const hits = new Set(hitStrokes(d.items, x, y, 8 / view.current.zoom))
    if (!hits.size) return
    const next = { ...d, items: d.items.filter((it) => !hits.has(it.id)) }
    docRef.current = next // keep up with fast drags before React re-renders
    setDoc(next)
    scheduleSave()
  }
  const eraseEnd = () => {
    const before = eraseStart.current
    eraseStart.current = null
    if (before && docRef.current && before !== docRef.current.items) { past.current.push(before); future.current = [] }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const p = pinch.current
      const zoom = Math.min(6, Math.max(0.15, p.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / p.d)))
      const r = canvas.current!.getBoundingClientRect()
      const wx = (p.cx - r.left) / p.zoom + p.vx, wy = (p.cy - r.top) / p.zoom + p.vy
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      view.current = { zoom, x: wx - (cx - r.left) / zoom, y: wy - (cy - r.top) / zoom }
      draw()
      return
    }
    if (pan.current) {
      const p = pan.current, z = view.current.zoom
      view.current = { ...view.current, x: p.vx - (e.clientX - p.x) / z, y: p.vy - (e.clientY - p.y) / z }
      draw()
      return
    }
    const events = (e.nativeEvent.getCoalescedEvents?.() ?? []).length ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent]
    const s = live.current.stroke
    if (s) {
      for (const ev of events) {
        const [x, y] = toWorld(ev.clientX, ev.clientY)
        s.points.push([x, y, ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5] as Pt)
      }
      draw()
    } else if (live.current.lasso) {
      const [x, y] = toWorld(e.clientX, e.clientY)
      live.current.lasso.push([x, y])
      draw()
    } else if (live.current.drag) {
      const [x, y] = toWorld(e.clientX, e.clientY)
      live.current.drag.dx = x - live.current.drag.x
      live.current.drag.dy = y - live.current.drag.y
      draw()
    } else if (erasing.current) {
      const [x, y] = toWorld(e.clientX, e.clientY)
      eraseAt(x, y, false)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pinch.current) { if (pointers.current.size < 2) { pinch.current = null; scheduleSave(); force((n) => n + 1) } return }
    if (pan.current) { pan.current = null; scheduleSave(); force((n) => n + 1); return }
    const d = docRef.current!
    const { stroke, lasso, drag } = live.current
    live.current = {}
    if (erasing.current) { erasing.current = false; eraseEnd() }
    if (stroke) {
      if (stroke.points.length === 1) stroke.points.push([stroke.points[0][0] + 0.1, stroke.points[0][1] + 0.1, stroke.points[0][2]]) // a dot
      commit([...d.items, stroke])
    } else if (lasso && lasso.length > 4) {
      const ids = lassoSelect(d.items, lasso)
      const cap = captureRegion(d.items, lasso)
      setSel({ ids, poly: lasso, image: cap?.dataUrl ?? null })
    } else if (drag && sel && (drag.dx || drag.dy)) {
      commit(d.items.map((it) => (sel.ids.has(it.id) ? translateItem(it, drag.dx, drag.dy) : it)))
      const poly = sel.poly.map(([x, y]) => [x + drag.dx, y + drag.dy] as [number, number])
      setSel({ ...sel, poly })
    }
    draw()
  }

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0025))
    else {
      const z = view.current.zoom
      view.current = { ...view.current, x: view.current.x + e.deltaX / z, y: view.current.y + e.deltaY / z }
      draw()
      scheduleSave()
    }
  }

  // ---------- images: paste, drop, insert ----------
  const addImage = useCallback((file: Blob) => {
    if (file.size > 6 * 1024 * 1024) return toast('Image too large (max 6 MB)')
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result)
      const img = new Image()
      img.onload = () => {
        const d = docRef.current!
        const c = canvas.current!
        const v = view.current
        // Fit inside the visible part of the board (80% of it), never upscale.
        const maxW = Math.min(640, (c.clientWidth / v.zoom) * 0.8), maxH = (c.clientHeight / v.zoom) * 0.8
        const s = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight)
        const w = img.naturalWidth * s, h = img.naturalHeight * s
        const x = v.x + c.clientWidth / v.zoom / 2 - w / 2, y = v.y + c.clientHeight / v.zoom / 2 - h / 2
        commit([...d.items, { id: newId(), kind: 'image', src, x, y, w, h }])
        toast('Image added. Use the lasso to circle a problem in it and ask the AI.')
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  }, [commit])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!wrap.current?.offsetParent) return // board not visible (Code mode)
      if (isTyping(e.target)) return
      const file = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile()
      if (file) { e.preventDefault(); addImage(file) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addImage])

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!wrap.current?.offsetParent || isTyping(e.target)) return // only while the board is showing
      if (e.key === ' ') { spaceDown.current = e.type === 'keydown'; e.preventDefault(); return }
      if (e.type !== 'keydown') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { deleteSelection(); return }
      if (e.key === 'Escape') { setSel(null); setAsking(false); return }
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase() && x.key !== ' ')
      if (t) setTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey) }
  })

  const deleteSelection = () => {
    if (!sel || !doc) return
    commit(doc.items.filter((it) => !sel.ids.has(it.id)))
    setSel(null)
  }

  const ask = (action: AiAction, q?: string) => {
    if (!sel?.image) return toast('Nothing visible inside the lasso to send')
    askAi({ action, image: sel.image, question: q })
    setAsking(false)
    setQuestion('')
  }

  const commitText = () => {
    if (textEdit && textEdit.value.trim() && doc) {
      commit([...doc.items, { id: newId(), kind: 'text', x: textEdit.x, y: textEdit.y, text: textEdit.value, color: penColor, size: 20 }])
    }
    setTextEdit(null)
  }

  if (!doc) return <div className="board-empty muted">Loading board…</div>

  // Floating AI menu sits just above the lasso region.
  // Floating AI menu: above the lasso, or below it when there's no room under the toolbar.
  let menuPos: { left: number; top: number; below: boolean } | null = null
  if (sel) {
    const xs = sel.poly.map((p) => p[0]), ys = sel.poly.map((p) => p[1])
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2
    const [sx, top] = toScreen(midX, Math.min(...ys))
    const [, bottom] = toScreen(midX, Math.max(...ys))
    const width = canvas.current?.clientWidth ?? 800
    const left = Math.min(Math.max(sx, 240), width - 240)
    menuPos = top - 12 < 110 ? { left, top: bottom + 12, below: true } : { left, top: top - 12, below: false }
  }
  const colors = tool === 'highlighter' ? HIGHLIGHT_COLORS : PEN_COLORS
  const activeColor = tool === 'highlighter' ? hlColor : penColor
  const sizes = tool === 'highlighter' ? SIZES.highlighter : SIZES.pen
  const activeSize = tool === 'highlighter' ? hlSize : penSize

  return (
    <div className="board" ref={wrap}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) addImage(f) }}>
      <div className="board-toolbar" role="toolbar" aria-label="Whiteboard tools">
        <div className="tb-seg">
          {TOOLS.map((t) => (
            <button key={t.id} className={`tool ${tool === t.id ? 'on' : ''}`} title={`${t.label} (${t.key === ' ' ? 'Space' : t.key.toUpperCase()})`}
              onClick={() => { setTool(t.id); if (t.id !== 'lasso') setSel(null) }}>
              <t.icon size={17} />
            </button>
          ))}
        </div>
        {(tool === 'pen' || tool === 'highlighter' || tool === 'text') && (
          <>
            <span className="tb-div" />
            <div className="tb-seg">
              {sizes.map((s, i) => (
                <button key={s} className={`tool size ${activeSize === i ? 'on' : ''}`} title="Thickness"
                  onClick={() => (tool === 'highlighter' ? setHlSize(i) : setPenSize(i))}>
                  <span className="size-dot" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
                </button>
              ))}
            </div>
            <span className="tb-div" />
            <div className="tb-seg colors">
              {colors.map((c) => (
                <button key={c} className={`swatch ${activeColor === c ? 'on' : ''}`} title={c === INK ? 'Ink (adapts to theme)' : c}
                  style={{ background: c === INK ? pal.ink : c }} onClick={() => (tool === 'highlighter' ? setHlColor(c) : setPenColor(c))} />
              ))}
            </div>
          </>
        )}
        <span className="tb-div" />
        <div className="tb-seg">
          <button className="tool" title="Undo (Ctrl+Z)" onClick={undo} disabled={!past.current.length}><Undo2 size={17} /></button>
          <button className="tool" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!future.current.length}><Redo2 size={17} /></button>
          <label className="tool" title="Insert image (or paste / drop one)">
            <ImagePlus size={17} />
            <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = '' }} />
          </label>
        </div>
      </div>

      <div className="board-info">
        <span className="board-title">{boardName(path)}</span>
        <select value={doc.paper} title="Paper" onChange={(e) => { setDoc({ ...doc, paper: e.target.value as Paper }); scheduleSave() }}>
          <option value="dots">Dots</option><option value="grid">Grid</option><option value="lines">Lines</option><option value="plain">Plain</option>
        </select>
        <button className="chip" title="Reset zoom" onClick={() => { view.current = { ...view.current, zoom: 1 }; force((n) => n + 1); draw(); scheduleSave() }}>{Math.round(view.current.zoom * 100)}%</button>
      </div>

      {tool === 'lasso' && !sel && <div className="board-hint">Circle a problem or some of your work, then ask the AI about it</div>}

      <canvas ref={canvas} className={`board-canvas tool-${tool}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} />

      {textEdit && (() => {
        const [sx, sy] = toScreen(textEdit.x, textEdit.y)
        return (
          <textarea className="board-text" autoFocus value={textEdit.value} style={{ left: sx, top: sy, fontSize: 20 * view.current.zoom, color: penColor === INK ? pal.ink : penColor }}
            placeholder="Type…" onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })} onBlur={commitText}
            onKeyDown={(e) => { if (e.key === 'Escape') setTextEdit(null); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitText() }} />
        )
      })()}

      {sel && menuPos && (
        <div className={`ai-pop ${menuPos.below ? 'below' : ''}`} style={{ left: menuPos.left, top: menuPos.top }} onPointerDown={(e) => e.stopPropagation()}>
          {!asking ? (
            <>
              <span className="ai-pop-label"><Wand2 size={14} /> Ask AI</span>
              {AI_ACTIONS.map((a) => (
                <button key={a.action} className="ai-btn" onClick={() => ask(a.action)} disabled={!sel.image}><a.icon size={14} /> {a.label}</button>
              ))}
              <button className="ai-btn" onClick={() => setAsking(true)} disabled={!sel.image}>Ask…</button>
              <span className="tb-div" />
              <button className="ai-btn icon" title="Delete selection" onClick={deleteSelection} disabled={!sel.ids.size}><Trash2 size={14} /></button>
              <button className="ai-btn icon" title="Close (Esc)" onClick={() => setSel(null)}><X size={14} /></button>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask('ask', question.trim()) }}>
              <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do you want to know about this?" />
              <button className="ai-btn primary" disabled={!question.trim()}>Ask</button>
              <button type="button" className="ai-btn icon" onClick={() => setAsking(false)}><X size={14} /></button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// The whiteboard: write by hand, paste problems, circle anything and ask the AI about it.
import {
  AArrowDown, AArrowUp, Eraser, Hand, Highlighter, ImagePlus, Lasso, Lightbulb, LineChart, Microscope, PenLine, Redo2, ScanSearch,
  Sparkles, Trash2, Type, Undo2, Wand2, X,
} from 'lucide-react'
import { svgToPng } from '../lib/diagrams'
import type { PlotSpec } from '../lib/plot'
import { InteractivePlot } from './InteractivePlot'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  bounds, captureRegion, drawItems, drawPaper, emptyBoard, HIGHLIGHT_COLORS, hitStrokes, INK, lassoSelect, newId,
  PALETTES, PEN_COLORS, parseBoard, resolveSrc, roundPt, setBoardFile, SIZES, translateItem, unionBox,
  freeSpot, itemAt, scaleItem, PEN_STYLES,
  type BoardDoc, type ImageItem, type Item, type Paper, type PenStyle, type StrokeItem, type TextItem, type View,
} from '../lib/board'
import { api, files } from '../lib/api'
import { askAi, boardName, deletedBoards, toast, useStore, type AiAction } from '../lib/store'
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

/** Set while a board is open: lets AI answers place diagrams on it ("Put on board"). */
export const boardBridge: { addImage: ((blob: Blob, meta?: { plot?: PlotSpec }) => Promise<void> | void) | null } = { addImage: null }

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
  const [textSize, setTextSize] = useState(1)
  const [penStyle, setPenStyleState] = useState<PenStyle>(() => {
    try { const v = localStorage.getItem('board.pen'); if (v && v in PEN_STYLES) return v as PenStyle } catch { /* storage blocked */ }
    return 'ballpoint'
  })
  const setPenStyle = (v: PenStyle) => { setPenStyleState(v); try { localStorage.setItem('board.pen', v) } catch { /* storage blocked */ } }
  const [sel, setSel] = useState<Selection | null>(null)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  /** Text being typed: a new one, or an existing one (id) being edited. */
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; value: string; size: number; color: string; id?: string } | null>(null)
  const editingId = useRef<string | undefined>(undefined)
  editingId.current = textEdit?.id
  const textRef = useRef(textEdit) // the open text box, so a late blur can't commit it twice
  textRef.current = textEdit
  const lastStrokeEnd = useRef(0)
  const blockClick = useRef(false)
  const [, force] = useState(0)

  // Mutable interaction state (kept out of React to stay smooth while drawing).
  const view = useRef<View>({ x: 0, y: 0, zoom: 1 })
  const live = useRef<{
    stroke?: StrokeItem; lasso?: [number, number][]; drag?: { x: number; y: number; dx: number; dy: number }
    resize?: { ax: number; ay: number; box: { x: number; y: number; w: number; h: number }; s: number }
  }>({})
  const [liveGraph, setLiveGraph] = useState<{ id: string; spec: PlotSpec } | null>(null)
  const past = useRef<Item[][]>([])
  const future = useRef<Item[][]>([])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const penSeen = useRef(false)
  const spaceDown = useRef(false)
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const pinch = useRef<{ d: number; zoom: number; cx: number; cy: number; vx: number; vy: number } | null>(null)
  const erasing = useRef(false)
  const lastLasso = useRef<{ x: number; y: number; w: number; h: number } | null>(null) // where AI diagrams go
  const docRef = useRef<BoardDoc | null>(null)
  docRef.current = doc

  // ---------- load & autosave ----------
  useEffect(() => {
    setBoardFile(path)
    api<BoardDoc & { type?: string }>(`/api/board?path=${encodeURIComponent(path)}`).then((raw) => {
      const d = raw.type === 'excalidraw' ? parseBoard(JSON.stringify(raw)) : { ...emptyBoard(), ...raw, version: 1 as const }
      if (d.view) view.current = d.view
      setDoc(d)
    }, () => setDoc(emptyBoard()))
  }, [path])

  // Saved as segments on the server (see server/src/boards.ts): only the changed segment is rewritten.
  const save = useCallback(() => {
    const d = docRef.current
    if (!d || deletedBoards.has(path)) return Promise.resolve()
    return api('/api/board', { method: 'PUT', json: { path, doc: { paper: d.paper, view: view.current, items: d.items } } })
  }, [path])
  const saveTimer = useRef(0)
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => save().catch((e: Error) => toast(`Board not saved: ${e.message}`)), 700)
  }, [save])
  useEffect(() => () => { clearTimeout(saveTimer.current); save().catch(() => {}) }, [save])

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
      const drag = live.current.drag, rs = live.current.resize
      const items = drag && sel ? d.items.map((it) => (sel.ids.has(it.id) ? translateItem(it, drag.dx, drag.dy) : it))
        : rs && sel ? d.items.map((it) => (sel.ids.has(it.id) ? scaleItem(it, rs.ax, rs.ay, rs.s) : it))
        : d.items
      const shown = editingId.current ? items.filter((it) => it.id !== editingId.current) : items // text being edited is in the text box
      drawItems(ctx, live.current.stroke ? [...shown, live.current.stroke] : shown, pal, draw)
      // Selection box with corner handles (drag a corner to resize).
      if (sel && sel.ids.size && !live.current.lasso) {
        const box = unionBox(items.filter((it) => sel.ids.has(it.id)).map(bounds))
        if (box) {
          ctx.lineWidth = 1.2 / v.zoom
          ctx.strokeStyle = pal.selection
          ctx.strokeRect(box.x, box.y, box.w, box.h)
          const hs = 10 / v.zoom
          ctx.fillStyle = pal.paper
          for (const [hx, hy] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]) {
            ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
            ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs)
          }
        }
      }
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
  const editingKey = textEdit?.id
  useEffect(draw, [editingKey, draw]) // hide/show the text being edited
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

  /** Which corner handle of the selection is under the pointer ("nw", "ne", "sw", "se")? */
  const handleAt = (clientX: number, clientY: number, box: { x: number; y: number; w: number; h: number }) => {
    const r = canvas.current!.getBoundingClientRect()
    const px = clientX - r.left, py = clientY - r.top
    const corners: [string, number, number][] = [['nw', box.x, box.y], ['ne', box.x + box.w, box.y], ['sw', box.x, box.y + box.h], ['se', box.x + box.w, box.y + box.h]]
    for (const [name, wx, wy] of corners) {
      const [sx, sy] = toScreen(wx, wy)
      if (Math.abs(px - sx) < 12 && Math.abs(py - sy) < 12) return name
    }
    return null
  }

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
    // The eraser end of a stylus (or its eraser button) erases, whatever tool is picked.
    const penEraser = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0)

    if (penEraser) {
      setSel(null)
      erasing.current = true
      eraseAt(x, y, true)
    } else if (tool === 'pen' || tool === 'highlighter') {
      setSel(null)
      const hl = tool === 'highlighter'
      live.current.stroke = hl
        ? { id: newId(), kind: tool, color: hlColor, size: SIZES.highlighter[hlSize], points: [roundPt(x, y, pressure)] }
        : { id: newId(), kind: tool, color: penColor, size: SIZES.pen[penSize], pen: penStyle, points: [roundPt(x, y, pressure)] }
    } else if (tool === 'eraser') {
      setSel(null)
      erasing.current = true
      eraseAt(x, y, true)
    } else if (tool === 'lasso') {
      const corner = selBox ? handleAt(e.clientX, e.clientY, selBox) : null
      if (corner && selBox) {
        // Resize around the opposite corner.
        const ax = corner[0] === 'w' ? selBox.x + selBox.w : selBox.x
        const ay = corner[1] === 'n' ? selBox.y + selBox.h : selBox.y
        live.current.resize = { ax, ay, box: selBox, s: 1 }
      } else if (selBox && x >= selBox.x && x <= selBox.x + selBox.w && y >= selBox.y && y <= selBox.y + selBox.h) {
        live.current.drag = { x, y, dx: 0, dy: 0 } // drag the selection
      } else {
        setSel(null)
        setAsking(false)
        live.current.lasso = [[x, y]]
      }
    } else if (tool === 'text') {
      // Tap existing text to edit it; tap empty space to start new text.
      const hit = itemAt(d.items, x, y, 4 / view.current.zoom)
      e.preventDefault() // keep focus handling ours: the open text box is committed right here
      commitText()
      if (hit?.kind === 'text') editText(hit)
      else setTextEdit({ x, y, value: '', size: SIZES.text[textSize], color: penColor })
    }
    draw()
  }

  /** Double-click (lasso, text or hand tool): edit text, or open a graph live. */
  const onDoubleClick = (e: React.MouseEvent) => {
    const d = docRef.current
    if (!d || !(tool === 'lasso' || tool === 'text' || tool === 'hand')) return
    const [x, y] = toWorld(e.clientX, e.clientY)
    const hit = itemAt(d.items, x, y, 4 / view.current.zoom)
    if (hit?.kind === 'text') editText(hit)
    else if (hit?.kind === 'image' && hit.plot) setLiveGraph({ id: hit.id, spec: hit.plot })
  }

  const editText = (it: TextItem) => {
    setSel(null)
    setTextEdit({ x: it.x, y: it.y, value: it.text, size: it.size, color: it.color, id: it.id })
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
        s.points.push(roundPt(x, y, ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5))
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
    } else if (live.current.resize) {
      const r = live.current.resize
      const [x, y] = toWorld(e.clientX, e.clientY)
      // Uniform scale (keeps graphs and pictures in proportion).
      r.s = Math.max(0.1, Math.max(Math.abs(x - r.ax) / Math.max(r.box.w, 1), Math.abs(y - r.ay) / Math.max(r.box.h, 1)))
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
    const { stroke, lasso, drag, resize } = live.current
    live.current = {}
    if (erasing.current) { erasing.current = false; eraseEnd() }
    const lassoSize = lasso ? Math.max(...lasso.map((p) => Math.abs(p[0] - lasso[0][0]) + Math.abs(p[1] - lasso[0][1]))) : 0
    if (stroke) {
      lastStrokeEnd.current = Date.now()
      if (stroke.points.length === 1) stroke.points.push([stroke.points[0][0] + 0.1, stroke.points[0][1] + 0.1, stroke.points[0][2]]) // a dot
      commit([...d.items, stroke])
    } else if (resize && sel) {
      if (Math.abs(resize.s - 1) > 0.005) {
        commit(d.items.map((it) => (sel.ids.has(it.id) ? scaleItem(it, resize.ax, resize.ay, resize.s) : it)))
        setSel({ ...sel, poly: sel.poly.map(([x, y]) => [resize.ax + (x - resize.ax) * resize.s, resize.ay + (y - resize.ay) * resize.s] as [number, number]) })
      }
    } else if (lasso && lassoSize < 8 / view.current.zoom) {
      // A tap (not a circle): select the thing under it, e.g. a graph to move or resize.
      const hit = itemAt(d.items, lasso[0][0], lasso[0][1], 6 / view.current.zoom)
      if (hit) {
        const b = bounds(hit)
        const poly: [number, number][] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]
        lastLasso.current = b
        setSel({ ids: new Set([hit.id]), poly, image: captureRegion(d.items, poly)?.dataUrl ?? null })
      } else setSel(null)
    } else if (lasso && lasso.length > 4) {
      const ids = lassoSelect(d.items, lasso)
      const cap = captureRegion(d.items, lasso)
      const xs = lasso.map((p) => p[0]), ys = lasso.map((p) => p[1])
      lastLasso.current = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
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
  /** Add a picture: stored once as boards/<board>.board/assets/<sha>.<ext>, referenced by name.
   *  `near` places it to the right of that area (e.g. an AI diagram next to what you circled). */
  /** Store picture bytes once as assets/<sha>.<ext> and return its "asset:" name. */
  const storeAsset = useCallback(async (file: Blob) => {
    const bytes = await file.arrayBuffer()
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
    const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'png' } as Record<string, string>)[file.type] ?? 'png'
    const name = `${hash}.${ext}`
    await files.upload(`${path.replace(/\.board\.json$/, '.board')}/assets/${name}`, file)
    return `asset:${name}`
  }, [path])

  const addImage = useCallback(async (file: Blob, opts: { near?: { x: number; y: number; w: number; h: number }; silent?: boolean; plot?: PlotSpec } = {}) => {
    if (file.size > 8 * 1024 * 1024) return toast('Image too large (max 8 MB)')
    let src: string
    try { src = await storeAsset(file) } catch (e) { return toast(`Image not saved: ${(e as Error).message}`) }
    const img = new Image()
    img.onload = () => {
      const d = docRef.current!
      const c = canvas.current!
      const v = view.current
      // Fit inside the visible part of the board (80% of it), never upscale.
      const maxW = Math.min(opts.near ? 480 : 640, (c.clientWidth / v.zoom) * 0.8), maxH = (c.clientHeight / v.zoom) * 0.8
      const s = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight)
      const w = img.naturalWidth * s, h = img.naturalHeight * s
      // Next to what you circled, in a spot that doesn't cover your writing.
      const { x, y } = opts.near
        ? freeSpot(d.items, opts.near, w, h)
        : { x: v.x + c.clientWidth / v.zoom / 2 - w / 2, y: v.y + c.clientHeight / v.zoom / 2 - h / 2 }
      const item: ImageItem = { id: newId(), kind: 'image', src, x, y, w, h, ...(opts.plot ? { plot: opts.plot } : {}) }
      commit([...d.items, item])
      // Select it right away (lasso tool): drag to move it, corners to resize.
      setTool('lasso')
      setSel({ ids: new Set([item.id]), poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], image: captureRegion([...d.items, item], [[x, y], [x + w, y], [x + w, y + h], [x, y + h]])?.dataUrl ?? null })
      if (!opts.silent) toast('Image added. Drag it to move, drag a corner to resize, or circle part of it and ask the AI.')
      // If it landed off-screen (e.g. a diagram next to what you circled), glide the view to show it.
      const vw = c.clientWidth / v.zoom, vh = c.clientHeight / v.zoom
      if (x < v.x || y < v.y || x + w > v.x + vw || y + h > v.y + vh) {
        const target = opts.near ? { x: opts.near.x - 30, y: Math.min(opts.near.y, y) - 30 } : { x: x - 30, y: y - 30 }
        // Fit both the circled area and the new picture when possible.
        const span = opts.near ? x + w - opts.near.x + 60 : w + 60
        const zoom = Math.min(v.zoom, Math.max(0.3, (c.clientWidth - 40) / span))
        view.current = { zoom, ...target }
        draw()
        scheduleSave()
      }
    }
    img.src = resolveSrc(src)
  }, [commit, storeAsset, draw, scheduleSave])

  // Let other parts of the app (AI diagrams) put pictures on this board.
  useEffect(() => {
    boardBridge.addImage = (blob, meta) => addImage(blob, { near: lastLasso.current ?? undefined, silent: true, plot: meta?.plot })
    return () => { boardBridge.addImage = null }
  }, [addImage])

  /** A live graph opened from the board was adjusted: swap the picture, keep its place and width. */
  const replaceGraph = async (id: string, svg: SVGSVGElement, plot: PlotSpec) => {
    const d = docRef.current
    const old = d?.items.find((it) => it.id === id)
    if (!d || !old || old.kind !== 'image') return
    const blob = await svgToPng(svg, pal.ink, pal.paper)
    const src = await storeAsset(blob)
    const img = new Image()
    img.onload = () => {
      const h = old.w * (img.naturalHeight / img.naturalWidth)
      commit(docRef.current!.items.map((it) => (it.id === id ? { ...old, src, h, plot } : it)))
      setLiveGraph(null)
      setSel(null)
      toast('Graph on the board updated')
    }
    img.src = resolveSrc(src)
  }

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
    const d = docRef.current, edit = textRef.current
    if (!edit) return
    textRef.current = null
    if (d) {
      const { id, value, x, y, size, color } = edit
      if (id) {
        const old = d.items.find((it) => it.id === id) as TextItem | undefined
        // Emptied: removed. Unchanged: nothing to undo.
        if (!value.trim()) commit(d.items.filter((it) => it.id !== id))
        else if (old && old.text !== value) commit(d.items.map((it) => (it.id === id ? { ...old, text: value, size, color } : it)))
      } else if (value.trim()) {
        commit([...d.items, { id: newId(), kind: 'text', x, y, text: value, color, size }])
      }
    }
    setTextEdit(null)
    draw()
  }

  /** Change the selected text (size or color) in one undo step. */
  const restyleText = (f: (t: TextItem) => TextItem) => {
    const d = docRef.current
    if (!d || !sel) return
    const next = d.items.map((it) => (sel.ids.has(it.id) && it.kind === 'text' ? f(it) : it))
    commit(next)
    const box = unionBox(next.filter((it) => sel.ids.has(it.id)).map(bounds))
    if (box) setSel({ ...sel, poly: [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]] })
  }

  if (!doc) return <div className="board-empty muted">Loading board…</div>

  // Floating AI menu sits just above the lasso region.
  const selectedGraph = sel && sel.ids.size === 1
    ? (doc.items.find((it) => sel.ids.has(it.id) && it.kind === 'image' && it.plot) as ImageItem | undefined)
    : undefined
  const selectedTexts = sel ? doc.items.filter((it): it is TextItem => sel.ids.has(it.id) && it.kind === 'text') : []
  const selectedText = sel && sel.ids.size === 1 ? selectedTexts[0] : undefined
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
  const sizes = tool === 'highlighter' ? SIZES.highlighter : tool === 'text' ? SIZES.text : SIZES.pen
  const activeSize = tool === 'highlighter' ? hlSize : tool === 'text' ? textSize : penSize
  const setSize = (i: number) => (tool === 'highlighter' ? setHlSize(i) : tool === 'text' ? setTextSize(i) : setPenSize(i))

  return (
    <div className="board" ref={wrap}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); if (f) addImage(f) }}>
      <div className="board-toolbar" role="toolbar" aria-label="Whiteboard tools"
        // A stylus landing on the toolbar right after a stroke is almost always an accident
        // (writing near the top edge), so it's ignored instead of switching tools.
        onPointerDownCapture={(e) => { if (e.pointerType === 'pen' && Date.now() - lastStrokeEnd.current < 400) { e.preventDefault(); e.stopPropagation(); blockClick.current = true } }}
        onClickCapture={(e) => { if (blockClick.current) { blockClick.current = false; e.preventDefault(); e.stopPropagation() } }}>
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
            {tool === 'pen' && (
              <>
                <span className="tb-div" />
                <div className="tb-seg pen-types" role="radiogroup" aria-label="Pen type">
                  {(Object.keys(PEN_STYLES) as PenStyle[]).map((k) => (
                    <button key={k} role="radio" aria-checked={penStyle === k} className={`tool pen-type ${penStyle === k ? 'on' : ''}`} title={PEN_STYLES[k].hint} onClick={() => setPenStyle(k)}>
                      {PEN_STYLES[k].label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <span className="tb-div" />
            <div className="tb-seg">
              {sizes.map((s, i) => (
                <button key={s} className={`tool size ${activeSize === i ? 'on' : ''}`} title={tool === 'text' ? `Text size ${s}` : 'Thickness'} onClick={() => setSize(i)}>
                  {tool === 'text'
                    ? <span className="size-a" style={{ fontSize: 10 + i * 3 }}>A</span>
                    : <span className="size-dot" style={{ width: 3 + i * 3, height: 3 + i * 3 }} />}
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
        onWheel={onWheel} onContextMenu={(e) => e.preventDefault()} onDoubleClick={onDoubleClick} />

      {textEdit && (() => {
        const [sx, sy] = toScreen(textEdit.x, textEdit.y)
        return (
          <textarea key={textEdit.id ?? `${textEdit.x},${textEdit.y}`} className="board-text" autoFocus value={textEdit.value} rows={Math.max(1, textEdit.value.split('\n').length)}
            style={{ left: sx, top: sy, fontSize: textEdit.size * view.current.zoom, color: textEdit.color === INK ? pal.ink : textEdit.color }}
            placeholder="Type…" onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })} onBlur={commitText}
            onFocus={(e) => { const t = e.target; t.setSelectionRange(t.value.length, t.value.length) }}
            onKeyDown={(e) => { if (e.key === 'Escape') { textRef.current = null; setTextEdit(null); draw() } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitText() }} />
        )
      })()}

      {sel && menuPos && (
        <div className={`ai-pop ${menuPos.below ? 'below' : ''}`} style={{ left: menuPos.left, top: menuPos.top }} onPointerDown={(e) => e.stopPropagation()}>
          {!asking ? (
            <>
              {selectedText && (
                <button className="ai-btn primary" onClick={() => editText(selectedText)} title="Change the words (or double-click the text)"><Type size={14} /> Edit text</button>
              )}
              {selectedTexts.length > 0 && (
                <>
                  <button className="ai-btn icon" title="Smaller text" onClick={() => restyleText((t) => ({ ...t, size: Math.max(8, Math.round(t.size / 1.2)) }))}><AArrowDown size={15} /></button>
                  <button className="ai-btn icon" title="Bigger text" onClick={() => restyleText((t) => ({ ...t, size: Math.min(160, Math.round(t.size * 1.2)) }))}><AArrowUp size={15} /></button>
                  {PEN_COLORS.map((c) => (
                    <button key={c} className={`swatch small ${selectedTexts.every((t) => t.color === c) ? 'on' : ''}`} title={c === INK ? 'Ink' : c}
                      style={{ background: c === INK ? pal.ink : c }} onClick={() => restyleText((t) => ({ ...t, color: c }))} />
                  ))}
                  <span className="tb-div" />
                </>
              )}
              {selectedGraph && (
                <>
                  <button className="ai-btn primary" onClick={() => setLiveGraph({ id: selectedGraph.id, spec: selectedGraph.plot! })} title="Pan, zoom, trace and animate it"><LineChart size={14} /> Open live graph</button>
                  <span className="tb-div" />
                </>
              )}
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

      {liveGraph && (
        <div className="live-graph" onPointerDown={(e) => e.stopPropagation()}>
          <div className="live-graph-head">
            <strong><LineChart size={15} /> Live graph</strong>
            <span className="muted small">Adjust it, then update the picture on your board</span>
            <button className="ai-btn icon" title="Close" onClick={() => setLiveGraph(null)}><X size={15} /></button>
          </div>
          <InteractivePlot spec={liveGraph.spec} onPutOnBoard={(svg, spec) => replaceGraph(liveGraph.id, svg, spec)} />
        </div>
      )}
    </div>
  )
}

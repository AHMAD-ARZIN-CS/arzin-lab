// A live graph, Desmos-style: drag to pan, scroll to zoom, hover to read values, a trace point
// that walks along the curve (with tangent and "increasing/decreasing"), and parameter sliders
// that can be animated. The picture is redrawn from the formulas every frame — not an image.
import { Minus, Pause, Play, Plus, RotateCcw, Sparkles, Spline, Target } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  autoView, compileSpec, COLORS, defaultParams, fmt, PAD, plotSvg, slopeWords,
  type Fn, type Params, type PlotSpec, type View,
} from '../lib/plot'
import { prettyMath } from '../lib/math'

interface Props {
  spec: PlotSpec
  /** Put the current picture on the board (gets the SVG and a spec matching the current view). */
  onPutOnBoard?: (svg: SVGSVGElement, spec: PlotSpec) => void
  /** Ask the AI to add sliders/animation for this graph. */
  onAskAnimate?: () => void
  height?: number
}

export function InteractivePlot({ spec, onPutOnBoard, onAskAnimate, height }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(520)
  const [compiled, setCompiled] = useState<{ fns: Fn[]; areaFns: Fn[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [params, setParams] = useState<Params>(() => defaultParams(spec))
  const [view, setView] = useState<View | null>(null)
  const [home, setHome] = useState<View | null>(null)
  const [trace, setTrace] = useState<number | null>(null)
  const [traceOn, setTraceOn] = useState(!!spec.trace)
  const [tangent, setTangent] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [animating, setAnimating] = useState<string | null>(null) // slider being animated
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ px: number; py: number; v: View; moved: boolean } | null>(null)

  useEffect(() => {
    compileSpec(spec).then((c) => {
      setCompiled(c)
      const v = autoView(spec, c.fns, defaultParams(spec))
      setView(v); setHome(v)
      if (spec.trace) setTrace((v.x0 + v.x1) / 2)
    }, (e: Error) => setErr(e.message))
  }, [spec])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(Math.max(280, Math.min(900, el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = height ?? Math.round(Math.min(440, Math.max(240, width * 0.64)))
  const T = PAD.T + (spec.title ? 20 : 0)
  const toX = (px: number) => view!.x0 + ((px - PAD.L) / (width - PAD.L - PAD.R)) * (view!.x1 - view!.x0)
  const toY = (py: number) => view!.y1 - ((py - T) / (H - T - PAD.B)) * (view!.y1 - view!.y0)

  // Animate the trace point across the window, or a parameter back and forth.
  useEffect(() => {
    if (!playing && !animating) return
    let raf = 0, last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (playing && view) setTrace((x) => { const span = view.x1 - view.x0; const nx = (x ?? view.x0) + (span / 7) * dt; return nx > view.x1 ? view.x0 : nx })
      if (animating) {
        const s = spec.sliders?.find((sl) => sl.name === animating)
        if (s) setParams((p) => {
          const span = s.max - s.min
          const dir = (p[`__dir_${s.name}`] ?? 1)
          let v = (p[s.name] ?? s.min) + dir * (span / 4) * dt
          let d = dir
          if (v > s.max) { v = s.max; d = -1 }
          if (v < s.min) { v = s.min; d = 1 }
          return { ...p, [s.name]: v, [`__dir_${s.name}`]: d }
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, animating, view, spec.sliders])

  const realParams = useMemo(() => Object.fromEntries(Object.entries(params).filter(([k]) => !k.startsWith('__'))), [params])
  const svg = useMemo(() => {
    if (!compiled || !view) return ''
    return plotSvg(spec, compiled.fns, compiled.areaFns, {
      view, params: realParams, width, height: H,
      traceX: traceOn ? trace : null, tangent, hoverX: drag.current ? null : hover,
    })
  }, [compiled, view, realParams, width, H, trace, traceOn, tangent, hover, spec])

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = host.current?.querySelector('.iplot-canvas') as HTMLDivElement | null
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!view) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const cx = toX(e.clientX - r.left), cy = toY(e.clientY - r.top)
      const k = Math.exp(e.deltaY * 0.0015)
      setView({ x0: cx + (view.x0 - cx) * k, x1: cx + (view.x1 - cx) * k, y0: cy + (view.y0 - cy) * k, y1: cy + (view.y1 - cy) * k })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const zoom = (k: number) => view && setView((v) => {
    const cx = (v!.x0 + v!.x1) / 2, cy = (v!.y0 + v!.y1) / 2
    return { x0: cx + (v!.x0 - cx) * k, x1: cx + (v!.x1 - cx) * k, y0: cy + (v!.y0 - cy) * k, y1: cy + (v!.y1 - cy) * k }
  })

  if (err) return <div className="diagram-error">Couldn't draw this graph: {err}</div>

  const startTrace = () => {
    if (!view) return
    if (!traceOn) { setTraceOn(true); setTrace(trace ?? (view.x0 + view.x1) / 2) } else { setTraceOn(false); setPlaying(false) }
  }
  const fnsSpec = spec.functions ?? []

  return (
    <div className="iplot" ref={host}>
      <div className="iplot-bar">
        <button className={`ib ${traceOn ? 'on' : ''}`} onClick={startTrace} title="A point that moves along the curve"><Target size={14} /> Trace</button>
        <button className="ib" disabled={!traceOn} onClick={() => setPlaying(!playing)} title="Animate the point along the curve">{playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause' : 'Play'}</button>
        <button className={`ib ${tangent ? 'on' : ''}`} disabled={!traceOn} onClick={() => setTangent(!tangent)} title="Show the tangent line (the slope) at the point"><Spline size={14} /> Tangent</button>
        <span className="ib-spacer" />
        <button className="ib icon" onClick={() => zoom(0.7)} title="Zoom in"><Plus size={14} /></button>
        <button className="ib icon" onClick={() => zoom(1 / 0.7)} title="Zoom out"><Minus size={14} /></button>
        <button className="ib icon" onClick={() => home && setView(home)} title="Reset view"><RotateCcw size={14} /></button>
      </div>
      <div className="iplot-canvas" style={{ height: H }}
        onPointerDown={(e) => { if (!view) return; (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, v: view, moved: false } }}
        onPointerMove={(e) => {
          if (!view) return
          const r = e.currentTarget.getBoundingClientRect()
          const d = drag.current
          if (d) {
            const dx = e.clientX - d.px, dy = e.clientY - d.py
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
            const ux = (d.v.x1 - d.v.x0) / (width - PAD.L - PAD.R), uy = (d.v.y1 - d.v.y0) / (H - T - PAD.B)
            setView({ x0: d.v.x0 - dx * ux, x1: d.v.x1 - dx * ux, y0: d.v.y0 + dy * uy, y1: d.v.y1 + dy * uy })
          } else setHover(toX(e.clientX - r.left))
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (d && !d.moved && traceOn && view) { const r = e.currentTarget.getBoundingClientRect(); setTrace(toX(e.clientX - r.left)); setPlaying(false) }
        }}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={() => home && setView(home)}
        // svg is built by plotSvg from numbers and escaped labels only
        dangerouslySetInnerHTML={{ __html: svg }} />

      {traceOn && trace != null && compiled && view && (
        <div className="iplot-readout">
          <label className="trace-slider">x = <b>{fmt(trace)}</b>
            <input type="range" min={view.x0} max={view.x1} step={(view.x1 - view.x0) / 1000} value={trace} onChange={(e) => { setTrace(Number(e.target.value)); setPlaying(false) }} />
          </label>
          {fnsSpec.map((f, i) => {
            let y = NaN
            try { y = compiled.fns[i](trace, realParams) } catch { /* undefined */ }
            const s = slopeWords(compiled.fns[i], trace, realParams, view.x1 - view.x0)
            return (
              <div key={i} className="readout-row">
                <span className="swatch-dot" style={{ background: f.color ?? COLORS[i % COLORS.length] }} />
                <span>{prettyMath(f.label?.split('=')[0]?.trim() || 'y')} = <b>{fmt(y)}</b></span>
                <span className="muted">slope {fmt(s.slope)} · {s.words}</span>
              </div>
            )
          })}
        </div>
      )}

      {(spec.sliders ?? []).length > 0 && (
        <div className="iplot-sliders">
          {spec.sliders!.map((s) => (
            <div key={s.name} className="param">
              <button className={`ib icon ${animating === s.name ? 'on' : ''}`} onClick={() => setAnimating(animating === s.name ? null : s.name)} title={`Animate ${s.name}`}>
                {animating === s.name ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <span className="param-name">{s.label ?? s.name} = <b>{fmt(params[s.name])}</b></span>
              <input type="range" min={s.min} max={s.max} step={s.step ?? (s.max - s.min) / 200} value={params[s.name]}
                onChange={(e) => { setAnimating(null); setParams((p) => ({ ...p, [s.name]: Number(e.target.value) })) }} />
            </div>
          ))}
        </div>
      )}

      <div className="code-actions">
        {onPutOnBoard && <button className="btn small" onClick={() => {
          const el = host.current?.querySelector('.iplot-canvas svg') as SVGSVGElement | null
          if (!el || !view) return
          const sliders = spec.sliders?.map((s) => ({ ...s, value: realParams[s.name] }))
          onPutOnBoard(el, { ...spec, sliders, x: [view.x0, view.x1], y: [view.y0, view.y1] })
        }}>Put on board</button>}
        {onAskAnimate && <button className="btn small ghost" onClick={onAskAnimate} title="Ask the AI to add sliders for the ideas that matter"><Sparkles size={13} /> Animate / make interactive</button>}
        <span className="muted small">Drag to move · scroll to zoom · double-click to reset</span>
      </div>
    </div>
  )
}

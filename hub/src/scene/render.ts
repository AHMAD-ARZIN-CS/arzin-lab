// Turns a scene file into three.js objects.
import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { compileExpr, usesTime } from './expr'
import type { SceneObject, SceneSpec, Vec3 } from './spec'

type Update = (dt: number, t: number) => void

export interface BuiltScene {
  root: THREE.Group
  update: Update
  warnings: string[]
  setWireframe: (on: boolean) => void
}

const v3 = (a?: Vec3, d: Vec3 = [0, 0, 0]) => new THREE.Vector3(...(a ?? d))

export function makeLabel(text: string, color = '#e8ecff') {
  const el = document.createElement('div')
  el.className = 'scene-label'
  el.textContent = text
  el.style.color = color
  return new CSS2DObject(el)
}

export function buildScene(spec: SceneSpec): BuiltScene {
  const root = new THREE.Group()
  const zUp = spec.up === 'z'
  // Math convention: z is height. three.js uses y-up, so we tip the whole world over.
  if (zUp) root.rotation.x = -Math.PI / 2
  const updates: Update[] = []
  const warnings: string[] = []
  const materials: THREE.Material[] = []

  const std = (color = '#9ab4ff', extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra })
    materials.push(m)
    return m
  }

  const place = (obj: THREE.Object3D, o: { position?: Vec3; spin?: Vec3 }) => {
    obj.position.copy(v3(o.position))
    if (o.spin) {
      const s = o.spin
      updates.push((dt) => { obj.rotation.x += s[0] * dt; obj.rotation.y += s[1] * dt; obj.rotation.z += s[2] * dt })
    }
    return obj
  }

  const build = (o: SceneObject): THREE.Object3D | null => {
    switch (o.type) {
      case 'axes': {
        const size = o.size ?? 3
        const g = new THREE.Group()
        g.add(new THREE.AxesHelper(size))
        ;(['x', 'y', 'z'] as const).forEach((n, i) => {
          const l = makeLabel(n, ['#ff6b6b', '#7ee07e', '#6ea8ff'][i])
          l.position.setComponent(i, size * 1.06)
          g.add(l)
        })
        return g
      }
      case 'grid': {
        const g = new THREE.GridHelper(o.size ?? 10, o.divisions ?? (o.size ?? 10), 0x3a4060, 0x22263a)
        if (zUp) g.rotation.x = Math.PI / 2 // keep the grid on the "floor" (the x-y plane)
        return g
      }
      case 'box':
        return place(new THREE.Mesh(new THREE.BoxGeometry(...(o.size ?? [1, 1, 1])), std(o.color)), o)
      case 'sphere':
        return place(new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 0.5, 48, 24), std(o.color)), o)
      case 'mesh': {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(o.vertices.flat(), 3))
        geo.setIndex(o.triangles.flat())
        geo.computeVertexNormals()
        return place(new THREE.Mesh(geo, std(o.color, { flatShading: !!o.flat })), o)
      }
      case 'model': {
        const holder = place(new THREE.Group(), o)
        new GLTFLoader().load(
          o.src,
          (gltf) => { gltf.scene.scale.setScalar(o.scale ?? 1); holder.add(gltf.scene) },
          undefined,
          () => warnings.push(`Could not load model ${o.src}`),
        )
        return holder
      }
      case 'surface': {
        const [x0, x1] = o.x ?? [-3, 3], [y0, y1] = o.y ?? [-3, 3]
        const n = Math.min(o.resolution ?? 80, 300)
        const f = compileExpr(o.fn)
        const geo = new THREE.PlaneGeometry(1, 1, n, n)
        const pos = geo.attributes.position as THREE.BufferAttribute
        const colors = new Float32Array(pos.count * 3)
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        const scope: Record<string, number> = { x: 0, y: 0, t: 0 }
        const c = new THREE.Color()
        const fill = (t: number) => {
          scope.t = t
          let zmin = Infinity, zmax = -Infinity
          const zs = new Float32Array(pos.count)
          for (let i = 0; i < pos.count; i++) {
            const ix = i % (n + 1), iy = Math.floor(i / (n + 1))
            scope.x = x0 + ((x1 - x0) * ix) / n
            scope.y = y1 - ((y1 - y0) * iy) / n
            const z = f(scope)
            zs[i] = Number.isFinite(z) ? z : 0
            zmin = Math.min(zmin, zs[i]); zmax = Math.max(zmax, zs[i])
          }
          for (let i = 0; i < pos.count; i++) {
            const ix = i % (n + 1), iy = Math.floor(i / (n + 1))
            // Built directly in "math" coordinates (x, y, height). The root group handles orientation.
            const x = x0 + ((x1 - x0) * ix) / n, y = y1 - ((y1 - y0) * iy) / n
            if (zUp) pos.setXYZ(i, x, y, zs[i])
            else pos.setXYZ(i, x, zs[i], -y)
            const k = zmax > zmin ? (zs[i] - zmin) / (zmax - zmin) : 0.5
            c.setHSL(0.66 - 0.66 * k, 0.75, 0.55) // blue (low) -> red (high)
            colors.set([c.r, c.g, c.b], i * 3)
          }
          pos.needsUpdate = true
          geo.attributes.color.needsUpdate = true
          geo.computeVertexNormals()
        }
        fill(0)
        if (usesTime(o.fn)) updates.push((_, t) => fill(t))
        const mat = std(o.color ?? '#ffffff', {
          vertexColors: !o.color, side: THREE.DoubleSide,
          transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
        })
        return new THREE.Mesh(geo, mat)
      }
      case 'curve':
      case 'plot2d': {
        const isPlot = o.type === 'plot2d'
        const [u0, u1] = isPlot ? (o.x ?? [-5, 5]) : (o.u ?? [0, 1])
        const samples = Math.min(o.samples ?? 400, 5000)
        const fx = isPlot ? null : compileExpr(o.x)
        const fy = compileExpr(isPlot ? o.fn : o.y)
        const fz = !isPlot && o.z ? compileExpr(o.z) : null
        const arr = new Float32Array((samples + 1) * 3)
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
        const scope: Record<string, number> = { u: 0, x: 0, t: 0 }
        const fill = (t: number) => {
          scope.t = t
          for (let i = 0; i <= samples; i++) {
            const u = u0 + ((u1 - u0) * i) / samples
            scope.u = u; scope.x = u
            const p = [fx ? fx(scope) : u, fy(scope), fz ? fz(scope) : 0]
            arr.set(p.map((c) => (Number.isFinite(c) ? c : NaN)), i * 3)
          }
          geo.attributes.position.needsUpdate = true
          geo.computeBoundingSphere()
        }
        fill(0)
        const timeSrc = isPlot ? [o.fn] : [o.x, o.y, o.z]
        if (usesTime(...timeSrc)) updates.push((_, t) => fill(t))
        const mat = new THREE.LineBasicMaterial({ color: o.color ?? '#ffd166' })
        materials.push(mat)
        return new THREE.Line(geo, mat)
      }
      case 'vector': {
        const from = v3(o.from), to = v3(o.to)
        const dir = to.clone().sub(from)
        const len = dir.length()
        const color = new THREE.Color(o.color ?? '#ffd166')
        const g = new THREE.Group()
        g.add(new THREE.ArrowHelper(dir.normalize(), from, len, color, Math.min(0.25, len * 0.25), Math.min(0.12, len * 0.12)))
        if (o.label) {
          const l = makeLabel(o.label, o.color)
          l.position.copy(to)
          g.add(l)
        }
        return g
      }
      case 'points': {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(o.points.flat(), 3))
        const mat = new THREE.PointsMaterial({ color: o.color ?? '#ffffff', size: o.size ?? 0.08 })
        materials.push(mat)
        return new THREE.Points(geo, mat)
      }
      case 'label': {
        const l = makeLabel(o.text, o.color)
        l.position.copy(v3(o.position))
        return l
      }
      default:
        warnings.push(`Unknown object type "${(o as { type: string }).type}" — skipped`)
        return null
    }
  }

  for (const o of spec.objects) {
    try {
      const obj = build(o)
      if (obj) root.add(obj)
    } catch (e) {
      warnings.push(`${o.type}: ${(e as Error).message}`)
    }
  }

  return {
    root,
    warnings,
    update: (dt, t) => updates.forEach((u) => u(dt, t)),
    setWireframe: (on) => materials.forEach((m) => { if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = on }),
  }
}

/** Convert a point from scene coordinates to three.js world coordinates. */
export function sceneToWorld(spec: SceneSpec, p: Vec3): THREE.Vector3 {
  const v = new THREE.Vector3(...p)
  return spec.up === 'z' ? v.applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2) : v
}

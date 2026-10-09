// Model viewer + exploded view: pull a model's parts apart to see how it is assembled.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { el, overlay, slider } from '../ui'
import { Stage } from '../viewer/stage'

/** A demo assembly built from primitives, so the viewer has something before you load a file. */
function demoGearbox(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'Demo gearbox'
  const metal = (c: string) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.35 })
  const part = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat)
    m.name = name
    m.position.set(...pos)
    if (rot) m.rotation.set(...rot)
    g.add(m)
    return m
  }
  const gear = (name: string, r: number, teeth: number, pos: [number, number, number], color: string) => {
    const shape = new THREE.Shape()
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2
      const rr = i % 2 ? r : r * 1.15 // alternate outer/inner radius = teeth
      const fn = i === 0 ? 'moveTo' : 'lineTo'
      shape[fn](Math.cos(a) * rr, Math.sin(a) * rr)
    }
    const hole = new THREE.Path().absarc(0, 0, 0.12, 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false })
    geo.center()
    return part(name, geo, metal(color), pos)
  }
  part('Base plate', new THREE.BoxGeometry(4, 0.2, 2), metal('#5a6378'), [0, -1.3, 0])
  const housing = part('Housing (transparent)', new THREE.BoxGeometry(3.6, 2.2, 1.4),
    new THREE.MeshStandardMaterial({ color: '#9ab4ff', transparent: true, opacity: 0.18, depthWrite: false }), [0, 0, 0])
  housing.renderOrder = 1
  part('Input shaft', new THREE.CylinderGeometry(0.12, 0.12, 2.2, 24), metal('#c9ced8'), [-0.75, 0, 0], [Math.PI / 2, 0, 0])
  part('Output shaft', new THREE.CylinderGeometry(0.12, 0.12, 2.2, 24), metal('#c9ced8'), [0.95, 0, 0], [Math.PI / 2, 0, 0])
  gear('Small gear (12 teeth)', 0.62, 12, [-0.75, 0, 0], '#ff8c5a')
  gear('Large gear (20 teeth)', 1.0, 20, [0.95, 0, 0], '#ffd166')
  for (const [x, z] of [[-0.75, 0.75], [-0.75, -0.75], [0.95, 0.75], [0.95, -0.75]])
    part('Bearing', new THREE.TorusGeometry(0.2, 0.07, 12, 24), metal('#7ee0a1'), [x, 0, z])
  return g
}

interface PartInfo { mesh: THREE.Mesh; home: THREE.Vector3; dir: THREE.Vector3 }

export function modelsPage(root: HTMLElement) {
  const view = el('div', 'stage')
  root.append(view)
  const stage = new Stage(view)
  const ui = overlay('Model Viewer & Exploder', 'Drag to orbit · tap a part to name it · drop a .glb file anywhere to open it.')
  root.append(ui.box)

  const info = el('pre', 'mono stats')
  const picked = el('div', 'picked')
  let current: THREE.Object3D | null = null
  let parts: PartInfo[] = []
  let explode = 0
  let spinGears = true

  const show = (obj: THREE.Object3D) => {
    if (current) stage.scene.remove(current)
    current = obj
    stage.scene.add(obj)
    // Fit: measure the model, then place the camera so the whole thing is in view.
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1
    stage.lookAt(center.clone().add(new THREE.Vector3(1, 0.7, 1.2).normalize().multiplyScalar(radius * 2.6)), center)

    parts = []
    let tris = 0, verts = 0
    obj.updateMatrixWorld(true)
    obj.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const g = m.geometry
      verts += g.attributes.position.count
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
      const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3())
      const dir = c.sub(center)
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0).multiplyScalar(radius * 0.2)
      parts.push({ mesh: m, home: m.position.clone(), dir: dir.multiplyScalar(1 / (m.parent?.getWorldScale(new THREE.Vector3()).x || 1)) })
    })
    info.textContent = `${obj.name || 'Model'}\nparts      ${parts.length}\nvertices   ${verts.toLocaleString()}\ntriangles  ${Math.round(tris).toLocaleString()}`
    applyExplode()
  }

  const applyExplode = () => {
    for (const p of parts) p.mesh.position.copy(p.home).addScaledVector(p.dir, explode)
  }

  ui.toolbar.append(slider('Explode', 0, 1.5, 0.01, 0, (v) => { explode = v; applyExplode() }))
  ui.addButton('Wireframe', (b) => {
    b.classList.toggle('on')
    current?.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (mat && 'wireframe' in mat) mat.wireframe = b.classList.contains('on')
    })
  })
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.glb,.gltf', hidden: true })
  ui.addButton('Open .glb…', () => picker.click())
  ui.addButton('Demo gearbox', () => { spinGears = true; show(demoGearbox()) })
  ui.box.append(info, picked, picker)

  const loadFile = async (file: File) => {
    try {
      const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), '')
      gltf.scene.name = file.name
      spinGears = false
      show(gltf.scene)
      picked.textContent = ''
    } catch (e) {
      picked.textContent = `Could not open ${file.name}: ${(e as Error).message}. Tip: use a single-file .glb.`
    }
  }
  picker.onchange = () => { if (picker.files?.[0]) loadFile(picker.files[0]) }
  const onDrop = (e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) loadFile(f) }
  const onDragOver = (e: DragEvent) => e.preventDefault()
  window.addEventListener('drop', onDrop)
  window.addEventListener('dragover', onDragOver)

  // Tap to identify a part: cast a ray from the camera through the tapped pixel.
  const raycaster = new THREE.Raycaster()
  let downAt = { x: 0, y: 0 }
  const canvas = stage.renderer.domElement
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY } })
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5 || !current) return // it was a drag
    const r = canvas.getBoundingClientRect()
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera)
    const hit = raycaster.intersectObject(current, true).find((h) => !(h.object as THREE.Mesh).name.startsWith('Housing'))
    picked.textContent = hit ? `Part: ${hit.object.name || '(unnamed mesh)'}` : ''
  })

  stage.onFrame((dt) => {
    if (!spinGears || !current) return
    // Meshing gears: speed ratio = inverse of teeth ratio, opposite directions.
    current.getObjectByName('Small gear (12 teeth)')?.rotateZ(dt * 1.2)
    current.getObjectByName('Large gear (20 teeth)')?.rotateZ(-dt * 1.2 * (12 / 20))
  })

  show(demoGearbox())
  stage.start()
  return () => {
    window.removeEventListener('drop', onDrop)
    window.removeEventListener('dragover', onDragOver)
    stage.dispose()
  }
}

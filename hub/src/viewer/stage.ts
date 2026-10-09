// A reusable 3D "stage": renderer + camera + orbit controls + lights + the render loop.
// The render loop is the heartbeat of every game and simulation:
//   while running: measure time since last frame -> update the world -> draw it.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'

export type FrameFn = (dt: number, t: number) => void

export class Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly labels: CSS2DRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  paused = false
  /** Replace to draw something custom (e.g. two viewports). Default: one full view. */
  render: () => void = () => {
    this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
  }

  private frameFns: FrameFn[] = []
  private clock = new THREE.Clock()
  private time = 0
  private raf = 0
  private resizeObs: ResizeObserver

  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x0a0c14)
    container.appendChild(this.renderer.domElement)

    this.labels = new CSS2DRenderer()
    this.labels.domElement.className = 'label-layer'
    container.appendChild(this.labels.domElement)

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500)
    this.camera.position.set(4, 3, 5)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true

    this.scene.add(new THREE.HemisphereLight(0xdde6ff, 0x202030, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 2.2)
    sun.position.set(4, 8, 5)
    this.scene.add(sun)

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    this.resize()
  }

  onFrame(fn: FrameFn) { this.frameFns.push(fn) }

  lookAt(position: THREE.Vector3, target: THREE.Vector3) {
    this.camera.position.copy(position)
    this.controls.target.copy(target)
    this.controls.update()
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = Math.min(this.clock.getDelta(), 0.1) // clamp: a hidden tab shouldn't jump time
      if (!this.paused) {
        this.time += dt
        for (const fn of this.frameFns) fn(dt, this.time)
      }
      this.controls.update()
      this.render()
    }
    loop()
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.labels.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.resizeObs.disconnect()
    this.controls.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
      mats.forEach((mat) => mat.dispose())
    })
    this.renderer.dispose()
    this.container.innerHTML = ''
  }
}

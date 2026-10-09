// The 3D pipeline, live. Interactive twin of modules/01-3d-from-scratch/step1_points.py.
// Big view: you, floating outside, watching a camera look at a cube.
// Inset: what that camera sees. Panel: the real matrices and one vertex's journey.
import * as THREE from 'three'
import { makeLabel } from '../scene/render'
import { el, overlay, slider } from '../ui'
import { Stage } from '../viewer/stage'

const IMG_W = 640, IMG_H = 480 // pretend output image, like the Python renderer's

export function pipelinePage(root: HTMLElement) {
  const split = el('div', 'split')
  const view = el('div', 'stage')
  const panel = el('aside', 'panel')
  split.append(view, panel)
  root.append(split)

  const stage = new Stage(view)
  stage.lookAt(new THREE.Vector3(7, 5, 7), new THREE.Vector3(0, 0.5, 0))
  const { scene } = stage

  // --- the world: a cube (same ±1 corners as lab3d/meshes.py) and a floor ---
  const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: '#ff8c5a', roughness: 0.6 }))
  cube.add(new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: '#ffe0d0' })))
  scene.add(cube, new THREE.GridHelper(14, 14, 0x3a4060, 0x22263a))
  cube.position.y = 1

  // The corner we follow: (1, 1, 1) in the cube's own (model) space.
  const corner = new THREE.Mesh(new THREE.SphereGeometry(0.09), new THREE.MeshBasicMaterial({ color: '#ffd166' }))
  corner.position.set(1, 1, 1)
  const cornerLabel = makeLabel('corner (1,1,1)', '#ffd166')
  cornerLabel.position.set(0, 0.3, 0)
  corner.add(cornerLabel)
  cube.add(corner)

  // --- the subject camera: the one whose picture we compute ---
  const params = { fov: 50, near: 1, far: 12, dist: 6, angle: 35, height: 2.5, spin: 0.3 }
  const cam = new THREE.PerspectiveCamera(params.fov, IMG_W / IMG_H, params.near, params.far)
  const helper = new THREE.CameraHelper(cam)
  const camLabel = makeLabel('camera', '#9ad1ff')
  cam.add(camLabel)
  scene.add(cam, helper)

  // The ray from the corner to the camera, and where it pierces the near plane.
  // That pierce point IS the projection: perspective = "where does the ray hit the screen?"
  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
  const ray = new THREE.Line(rayGeo, new THREE.LineDashedMaterial({ color: '#ffd166', dashSize: 0.15, gapSize: 0.1 }))
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  scene.add(ray, hit)
  const observerOnly = [helper, ray, hit, camLabel, cornerLabel]

  const placeCamera = () => {
    const a = THREE.MathUtils.degToRad(params.angle)
    cam.position.set(Math.sin(a) * params.dist, params.height, Math.cos(a) * params.dist)
    cam.lookAt(0, 1, 0)
    cam.fov = params.fov; cam.near = params.near; cam.far = params.far
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    helper.update()
  }
  placeCamera()

  // --- the panel ---
  const ui = overlay('The 3D Pipeline, Live')
  root.append(ui.box)
  ui.addButton('Pause spin', (b) => { stage.paused = !stage.paused; b.textContent = stage.paused ? 'Resume spin' : 'Pause spin' })

  panel.append(
    el('h2', '', 'Camera controls'),
    slider('Field of view°', 15, 120, 1, params.fov, (v) => { params.fov = v; placeCamera() }),
    slider('Near plane', 0.2, 4, 0.1, params.near, (v) => { params.near = v; placeCamera() }),
    slider('Far plane', 4, 20, 0.5, params.far, (v) => { params.far = v; placeCamera() }),
    slider('Distance', 2.5, 12, 0.1, params.dist, (v) => { params.dist = v; placeCamera() }),
    slider('Orbit angle°', -180, 180, 1, params.angle, (v) => { params.angle = v; placeCamera() }),
    slider('Height', -2, 8, 0.1, params.height, (v) => { params.height = v; placeCamera() }),
    slider('Cube spin', 0, 2, 0.05, params.spin, (v) => { params.spin = v }),
  )
  const journey = el('pre', 'mono')
  const mats = el('pre', 'mono')
  panel.append(
    el('h2', '', 'Journey of the yellow corner'),
    journey,
    el('p', 'note', 'Watch w: it equals the distance in front of the camera. Dividing by w is what makes far things small. Push the corner outside the frustum (the pyramid) and its NDC leaves [-1, 1]: it gets clipped.'),
    el('h2', '', 'The matrices'),
    mats,
    el('p', 'note', 'Same math as lab3d/mathlib.py: look_at() builds the view matrix, perspective() builds the projection. Change FOV and watch the projection matrix change; move the camera and watch the view matrix change.'),
  )

  const f = (n: number) => n.toFixed(3).padStart(7)
  const row4 = (m: THREE.Matrix4, r: number) => [0, 1, 2, 3].map((c) => f(m.elements[c * 4 + r])).join(' ') // three.js stores columns
  const mat4 = (name: string, m: THREE.Matrix4) => `${name}\n` + [0, 1, 2, 3].map((r) => `  [${row4(m, r)} ]`).join('\n')

  const world = new THREE.Vector3(), camSpace = new THREE.Vector3(), clip = new THREE.Vector4()
  let lastText = 0
  const updatePanel = (now: number) => {
    corner.getWorldPosition(world)
    camSpace.copy(world).applyMatrix4(cam.matrixWorldInverse)
    clip.set(camSpace.x, camSpace.y, camSpace.z, 1).applyMatrix4(cam.projectionMatrix)
    const ndc = new THREE.Vector3(clip.x / clip.w, clip.y / clip.w, clip.z / clip.w)

    // Pierce point on the near plane, in camera space: scale the point so z = -near.
    const onNear = camSpace.clone().multiplyScalar(params.near / -camSpace.z)
    hit.position.copy(onNear.applyMatrix4(cam.matrixWorld))
    hit.visible = camSpace.z < 0
    rayGeo.setFromPoints([world, cam.position])
    ray.computeLineDistances()

    if (now - lastText < 100) return // the DOM is slow; 10 updates/sec is plenty for reading
    lastText = now
    const inside = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1 && clip.w > 0
    const px = ((ndc.x + 1) / 2) * IMG_W, py = ((1 - ndc.y) / 2) * IMG_H
    journey.textContent = [
      `model   [${f(1)} ${f(1)} ${f(1)} ${f(1)} ]`,
      `world   [${f(world.x)} ${f(world.y)} ${f(world.z)} ${f(1)} ]`,
      `camera  [${f(camSpace.x)} ${f(camSpace.y)} ${f(camSpace.z)} ${f(1)} ]`,
      `clip    [${f(clip.x)} ${f(clip.y)} ${f(clip.z)} ${f(clip.w)} ]  <- w`,
      `NDC     [${f(ndc.x)} ${f(ndc.y)} ${f(ndc.z)} ]`,
      inside ? `pixel   (${px.toFixed(1)}, ${py.toFixed(1)}) of ${IMG_W}x${IMG_H}` : 'pixel   — outside the view, clipped',
    ].join('\n')
    mats.textContent = mat4('VIEW (world → camera)', cam.matrixWorldInverse) + '\n\n' + mat4('PROJECTION (camera → clip)', cam.projectionMatrix)
  }

  stage.onFrame((dt) => { cube.rotation.y += params.spin * dt })

  // --- two viewports on one canvas: the observer view, then the camera's view as an inset ---
  const insetFrame = el('div', 'inset-frame')
  insetFrame.append(el('span', '', 'What the camera sees'))
  view.append(insetFrame)
  const size = new THREE.Vector2()
  stage.render = () => {
    const r = stage.renderer
    updatePanel(performance.now())
    r.getSize(size)
    r.setScissorTest(false)
    r.setViewport(0, 0, size.x, size.y)
    r.render(scene, stage.camera)
    stage.labels.render(scene, stage.camera)

    const iw = Math.round(Math.min(size.x * 0.42, 360)), ih = Math.round(iw * (IMG_H / IMG_W)), m = 12
    observerOnly.forEach((o) => (o.visible = false))
    r.setScissorTest(true)
    r.setViewport(size.x - iw - m, m, iw, ih)
    r.setScissor(size.x - iw - m, m, iw, ih)
    r.render(scene, cam)
    r.setScissorTest(false)
    observerOnly.forEach((o) => (o.visible = true))
    hit.visible = camSpace.z < 0
    Object.assign(insetFrame.style, { width: `${iw}px`, height: `${ih}px`, right: `${m}px`, bottom: `${m}px` })
  }

  stage.start()
  return () => stage.dispose()
}

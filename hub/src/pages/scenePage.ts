import { findScene } from '../registry'
import { buildScene, sceneToWorld } from '../scene/render'
import { el, overlay } from '../ui'
import { Stage } from '../viewer/stage'

export function scenePage(root: HTMLElement, id: string) {
  const spec = findScene(id)
  if (!spec) {
    root.append(el('p', 'error pad', `Scene "${id}" not found.`))
    return () => {}
  }
  const view = el('div', 'stage')
  root.append(view)
  const stage = new Stage(view)
  const built = buildScene(spec)
  stage.scene.add(built.root)
  stage.onFrame(built.update)

  const cam = spec.camera ?? {}
  const home = () => stage.lookAt(sceneToWorld(spec, cam.position ?? [4, 3, 5]), sceneToWorld(spec, cam.target ?? [0, 0, 0]))
  home()

  const ui = overlay(spec.title, spec.description)
  ui.addButton('Wireframe', (b) => { b.classList.toggle('on'); built.setWireframe(b.classList.contains('on')) })
  ui.addButton('Pause', (b) => { stage.paused = !stage.paused; b.textContent = stage.paused ? 'Play' : 'Pause' })
  ui.addButton('Reset view', home)
  const warn = el('div', 'warnings')
  ui.box.append(warn)
  // Some warnings (like a model that failed to load) arrive later, so re-check briefly.
  const showWarnings = () => { warn.textContent = built.warnings.join('\n') }
  showWarnings()
  const timer = setInterval(showWarnings, 1000)
  root.append(ui.box)

  stage.start()
  return () => { clearInterval(timer); stage.dispose() }
}

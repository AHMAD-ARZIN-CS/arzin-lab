// Everything the dashboard can open: built-in interactive modules + scene files.
import { validateScene, type SceneSpec } from './scene/spec'

// Vite reads every JSON file in /scenes at build time (and live-reloads in dev).
// Drop a new scene file in that folder and it appears on the dashboard.
const files = import.meta.glob('../../scenes/*.json', { eager: true, import: 'default' })

export const SCENES: SceneSpec[] = Object.entries(files).flatMap(([path, data]) => {
  try {
    return [validateScene(data)]
  } catch (e) {
    console.warn(`Skipping ${path}: ${(e as Error).message}`)
    return []
  }
})

export interface ModuleEntry {
  id: string
  title: string
  track: string
  description: string
}

export const MODULES: ModuleEntry[] = [
  {
    id: 'pipeline', track: '3d', title: 'The 3D Pipeline, Live',
    description: 'Move a camera and watch a vertex travel world → camera → clip → NDC → pixel. The interactive twin of step1_points.py.',
  },
  {
    id: 'models', track: '3d', title: 'Model Viewer & Exploder',
    description: 'Open any .glb model, count its triangles, and pull its parts apart to see how it is built.',
  },
]

// A scene opened from a file on this device (not part of the repo).
let localScene: SceneSpec | null = null
export const setLocalScene = (s: SceneSpec) => { localScene = s }
export const findScene = (id: string) => (id === 'local' ? localScene : SCENES.find((s) => s.id === id) ?? null)

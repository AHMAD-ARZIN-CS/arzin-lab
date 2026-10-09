// The scene file format ("arzin-scene/0"). Documented for humans and agents in scenes/README.md.
export type Vec3 = [number, number, number]
export type Range = [number, number]

export interface SceneSpec {
  spec: string
  id: string
  title: string
  track: string
  description?: string
  up?: 'y' | 'z' // 'z' = math convention (z is height)
  camera?: { position?: Vec3; target?: Vec3 }
  objects: SceneObject[]
}

interface Placed { position?: Vec3; spin?: Vec3 }

export type SceneObject =
  | { type: 'axes'; size?: number }
  | { type: 'grid'; size?: number; divisions?: number }
  | ({ type: 'box'; size?: Vec3; color?: string } & Placed)
  | ({ type: 'sphere'; radius?: number; color?: string } & Placed)
  | ({ type: 'mesh'; vertices: Vec3[]; triangles: Vec3[]; color?: string; flat?: boolean } & Placed)
  | ({ type: 'model'; src: string; scale?: number } & Placed)
  | { type: 'surface'; fn: string; x?: Range; y?: Range; resolution?: number; color?: string; opacity?: number }
  | { type: 'curve'; x: string; y: string; z?: string; u?: Range; samples?: number; color?: string }
  | { type: 'plot2d'; fn: string; x?: Range; samples?: number; color?: string }
  | { type: 'vector'; from?: Vec3; to: Vec3; color?: string; label?: string }
  | { type: 'points'; points: Vec3[]; color?: string; size?: number }
  | { type: 'label'; text: string; position: Vec3; color?: string }

export function validateScene(data: unknown): SceneSpec {
  const s = data as SceneSpec
  if (!s || typeof s !== 'object') throw new Error('Scene must be a JSON object')
  if (typeof s.spec !== 'string' || !s.spec.startsWith('arzin-scene/'))
    throw new Error('Missing "spec": "arzin-scene/0"')
  if (!Array.isArray(s.objects)) throw new Error('Missing "objects" array')
  return { ...s, id: s.id ?? 'untitled', title: s.title ?? 'Untitled scene', track: s.track ?? 'math' }
}

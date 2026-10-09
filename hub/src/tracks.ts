// The learning tracks of the lab. Every module and scene belongs to one.
export interface Track {
  id: string
  name: string
  blurb: string
  color: string
  status: 'active' | 'planned'
  upcoming?: string[]
}

export const TRACKS: Track[] = [
  {
    id: '3d', name: '3D Fundamentals', color: '#ff8c5a', status: 'active',
    blurb: 'How a 3D point becomes a pixel: matrices, cameras, triangles, GPUs.',
  },
  {
    id: 'math', name: 'Math & Textbook Visuals', color: '#b48cff', status: 'active',
    blurb: 'Surfaces, curves and vectors from any equation. Agents draw here.',
  },
  {
    id: 'physics', name: 'Physics & Simulation', color: '#6ec8ff', status: 'active',
    blurb: 'Motion, forces, integrators, and why naive simulations explode.',
    upcoming: ['Projectile lab with live integrator choice', 'Spring-mass systems', 'N-body orbits'],
  },
  {
    id: 'software', name: 'Software Engineering', color: '#7ee0a1', status: 'planned',
    blurb: 'How code actually runs: loops, the stack, memory — and what makes an app shippable.',
    upcoming: ['Loop stepper: watch a for-loop execute', 'Call stack visualizer', 'App quality checklist'],
  },
  {
    id: 'data', name: 'Data & Databases', color: '#ffd166', status: 'planned',
    blurb: 'How data is stored, indexed, recovered. Build a tiny database and watch it work.',
    upcoming: ['B-tree insert visualizer', 'Write-ahead log & crash recovery', 'Backup / restore lab'],
  },
  {
    id: 'security', name: 'Cybersecurity & Networks', color: '#ff6b8a', status: 'planned',
    blurb: 'Design a defensible network: segmentation, firewalls, DMZ, monitoring.',
    upcoming: ['3D network map with VLANs', 'Firewall rule simulator', 'Attack path tracer'],
  },
  {
    id: 'games', name: 'Games & RPG', color: '#f5a3ff', status: 'planned',
    blurb: 'Real games in Godot: the game loop, state machines, inventory, saves.',
    upcoming: ['Godot RPG skeleton', 'Stats & inventory systems', 'Web export embedded here'],
  },
  {
    id: 'agents', name: 'Prompt & Loop Engineering', color: '#9ad1d4', status: 'planned',
    blurb: 'Agents that plan, act, check, and use this Hub to explain things.',
    upcoming: ['Agent loop visualizer', 'Scene-writing agent', 'MCP server for the Hub'],
  },
  {
    id: 'tools', name: 'Strange Tools', color: '#c9c9c9', status: 'planned',
    blurb: 'Small weird useful things. Ideas welcome.',
  },
]

export const trackById = (id: string) => TRACKS.find((t) => t.id === id)

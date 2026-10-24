// HTTP calls to the workspace server. Every request carries X-Lab: 1 — the server rejects
// requests without it, which stops other websites from calling your local server.
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('X-Lab', '1')
  let body = init.body
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }
  const res = await fetch(path, { ...init, headers, body })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    const msg = type.includes('json') ? (await res.json()).error : await res.text()
    throw new Error(msg || `${res.status} ${res.statusText}`)
  }
  return (type.includes('json') ? res.json() : res.blob()) as Promise<T>
}

export interface TreeNode { name: string; path: string; type: 'file' | 'dir'; children?: TreeNode[] }
export interface Version { id: string; label: string; time: string; size: number }
export interface LanguageInfo { id: string; name: string; exts: string[]; monaco: string; compiled: boolean; trace: boolean; traceNote?: string }
export interface SandboxStatus { state: 'no-docker' | 'building' | 'starting' | 'ready' | 'error'; message: string }
export interface ProblemMeta { slug: string; title: string; topic: string; difficulty: string; language: string; starter: string; folder: string; testCount: number }

export const files = {
  tree: () => api<TreeNode[]>('/api/tree'),
  read: (path: string) => api<{ content: string }>(`/api/file?path=${encodeURIComponent(path)}`).then((r) => r.content),
  write: (path: string, content: string, snapshot?: string) => api('/api/file', { method: 'PUT', json: { path, content, snapshot } }),
  mkdir: (path: string) => api('/api/mkdir', { method: 'POST', json: { path } }),
  rename: (from: string, to: string) => api('/api/rename', { method: 'POST', json: { from, to } }),
  remove: (path: string) => api('/api/delete', { method: 'POST', json: { path } }),
  upload: (path: string, data: Blob) => api(`/api/raw?path=${encodeURIComponent(path)}`, { method: 'PUT', body: data }),
  download: async (path: string) => {
    const blob = await api<Blob>(`/api/raw?path=${encodeURIComponent(path)}`)
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: path.split('/').pop() })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  },
  versions: (path: string) => api<Version[]>(`/api/versions?path=${encodeURIComponent(path)}`),
  version: (path: string, id: string) => api<{ content: string }>(`/api/version?path=${encodeURIComponent(path)}&id=${encodeURIComponent(id)}`).then((r) => r.content),
  snapshot: (path: string, label: string) => api('/api/snapshot', { method: 'POST', json: { path, label } }),
}

export interface LibraryProblem { slug: string; title: string; topic: string; difficulty: string; concepts: string[]; testCount: number; installed: boolean; solved: boolean }
export interface LectureMeta { slug: string; title: string; source: string; kind: string; pageCount: number; hasImages: boolean; warnings: string[]; pending?: boolean }
export interface LecturePage { n: number; text: string; image: string | null; images: string[] }
export interface Lecture { slug: string; title: string; source: string; kind: string; pages: LecturePage[]; warnings: string[] }
export interface Progress { solved: Record<string, string>; attempts: Record<string, number> }

export const library = {
  list: () => api<LibraryProblem[]>('/api/library'),
  install: (slug: string) => api<{ folder: string; starter: string }>('/api/library/install', { method: 'POST', json: { slug } }),
  solution: (slug: string) => api<{ content: string }>(`/api/solution?slug=${encodeURIComponent(slug)}`).then((r) => r.content),
  progress: () => api<Progress>('/api/progress'),
}

export const lectures = {
  list: () => api<LectureMeta[]>('/api/lectures'),
  get: (slug: string) => api<Lecture>(`/api/lecture?slug=${encodeURIComponent(slug)}`),
}

/** URL for an image inside your code folder (used by boards for lecture slides). */
export const assetUrl = (path: string) => `/asset?path=${encodeURIComponent(path)}`

export const practice = {
  list: () => api<ProblemMeta[]>('/api/practice'),
  create: (p: { title: string; statement: string; starter: string; language: string; tests: { input: string; expected: string }[] }) =>
    api<{ folder: string; starter: string }>('/api/practice', { method: 'POST', json: p }),
}

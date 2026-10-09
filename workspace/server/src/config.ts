import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const WORKSPACE_DIR = path.resolve(here, '..', '..')
export const REPO_DIR = path.resolve(WORKSPACE_DIR, '..')

export const PORT = Number(process.env.LAB_PORT ?? 4317)
export const DEV_WEB_PORT = 5173

/** Your code lives here. It is mounted into the sandbox at /work, so the editor,
 *  the terminal, and Run all see exactly the same files. */
export const ROOT = path.resolve(process.env.LAB_ROOT ?? path.join(REPO_DIR, 'my-code'))
/** Workspace bookkeeping inside ROOT: version history, trash, scratch files. */
export const META_DIR = path.join(ROOT, '.lab')
export const CONTAINER_WORKDIR = '/work'

export const SANDBOX_DIR = path.join(WORKSPACE_DIR, 'sandbox')
export const IMAGE = 'arzin-lab-sandbox:latest'
export const CONTAINER = 'arzin-lab-sandbox'

/** Resource limits for the sandbox container and for each program run. */
export const LIMITS = {
  memoryBytes: 1024 * 1024 * 1024, // 1 GB for the whole sandbox
  cpus: 2,
  pids: 256,
  runCpuSeconds: 20,     // CPU time per program: stops infinite loops, not a program waiting for input
  runWallSeconds: 600,   // wall clock per interactive run
  testWallSeconds: 10,   // per test case
  traceWallSeconds: 90,
  traceMaxSteps: 1000,
  maxFileBytes: 5 * 1024 * 1024,
}

export const AI = {
  command: process.env.LAB_CLAUDE_CMD ?? 'claude',
  model: process.env.LAB_AI_MODEL ?? 'sonnet',
}

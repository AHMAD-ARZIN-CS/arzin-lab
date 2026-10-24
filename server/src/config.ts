import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
/** The Chalkbyte folder (the repository root). */
export const APP_DIR = path.resolve(here, '..', '..')

/** Optional per-machine settings, never committed: chalkbyte.local.json next to package.json.
 *  Example: { "codeDir": "D:/school/my-code", "port": 4317, "aiCommand": "claude", "aiModel": "sonnet" } */
interface LocalConfig { codeDir?: string; port?: number; aiCommand?: string; aiModel?: string }
function readLocalConfig(): LocalConfig {
  try { return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'chalkbyte.local.json'), 'utf8')) as LocalConfig } catch { return {} }
}
const local = readLocalConfig()
/** An environment variable wins (CHALKBYTE_*, or the older LAB_* names), then chalkbyte.local.json. */
const env = (name: string) => process.env[`CHALKBYTE_${name}`] ?? process.env[`LAB_${name}`]

export const PORT = Number(env('PORT') ?? local.port ?? 4317)
export const DEV_WEB_PORT = 5173

/** Your code lives here. It is mounted into the sandbox at /work, so the editor,
 *  the terminal, and Run all see exactly the same files. Default: my-code/ in the app folder (gitignored). */
export const ROOT = path.resolve(APP_DIR, env('ROOT') ?? local.codeDir ?? 'my-code')
/** Workspace bookkeeping inside ROOT: version history, trash, scratch files. */
export const META_DIR = path.join(ROOT, '.lab')
export const CONTAINER_WORKDIR = '/work'

export const SANDBOX_DIR = path.join(APP_DIR, 'sandbox')
export const IMAGE = 'chalkbyte-sandbox:latest'
export const CONTAINER = 'chalkbyte-sandbox'

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
  /** null = find the Claude Code CLI automatically. */
  command: env('CLAUDE_CMD') ?? local.aiCommand ?? null,
  model: env('AI_MODEL') ?? local.aiModel ?? 'sonnet',
}

// The sandbox: one long-lived Docker container with your code folder mounted at /work.
// Every run, test, trace and terminal is a `docker exec` into it, with limits:
//   no network · 1 GB RAM · 2 CPUs · 256 processes · read-only system files · non-root user
// plus per-program CPU-time and wall-clock limits.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough, type Duplex } from 'node:stream'
import Docker from 'dockerode'
import { CONTAINER, CONTAINER_WORKDIR, IMAGE, LIMITS, ROOT, SANDBOX_DIR } from './config.js'

export const docker = new Docker()

export type SandboxStatus =
  | { state: 'no-docker'; message: string }
  | { state: 'building'; message: string }
  | { state: 'starting'; message: string }
  | { state: 'ready'; message: string }
  | { state: 'error'; message: string }

let status: SandboxStatus = { state: 'starting', message: 'Connecting to Docker…' }
const listeners = new Set<(s: SandboxStatus) => void>()
const buildLog: string[] = []

export const getStatus = () => status
export const getBuildLog = () => buildLog.slice(-200)
export function onStatus(fn: (s: SandboxStatus) => void) { listeners.add(fn); return () => listeners.delete(fn) }
function setStatus(s: SandboxStatus) { status = s; listeners.forEach((fn) => fn(s)) }

/** Hash of the sandbox folder: when the Dockerfile or tools change, the image is rebuilt. */
function sandboxHash() {
  const h = crypto.createHash('sha256')
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name)
      if (fs.statSync(p).isDirectory()) walk(p)
      else h.update(path.relative(SANDBOX_DIR, p)).update(fs.readFileSync(p))
    }
  }
  walk(SANDBOX_DIR)
  return h.digest('hex').slice(0, 16)
}

function sandboxFiles(dir = SANDBOX_DIR): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return fs.statSync(p).isDirectory() ? sandboxFiles(p) : [path.relative(SANDBOX_DIR, p).split(path.sep).join('/')]
  })
}

async function buildImage(hash: string) {
  setStatus({ state: 'building', message: 'Building the sandbox image (first time takes a few minutes)…' })
  buildLog.length = 0
  const stream = await docker.buildImage({ context: SANDBOX_DIR, src: sandboxFiles() }, { t: IMAGE, labels: { 'lab.hash': hash } })
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err, res) => {
      const failed = err ?? (res as { error?: string }[]).find((r) => r.error)?.error
      failed ? reject(new Error(String(failed))) : resolve()
    }, (ev: { stream?: string; error?: string }) => {
      const line = (ev.stream ?? ev.error ?? '').trimEnd()
      if (line) { buildLog.push(line); setStatus({ state: 'building', message: line.slice(0, 160) }) }
    })
  })
}

let ensuring: Promise<void> | null = null
let readyAt = 0

/** Make sure Docker is up, the image is current, and the container is running. */
export function ensureSandbox(): Promise<void> {
  if (status.state === 'ready' && Date.now() - readyAt < 5000) return Promise.resolve()
  ensuring ??= doEnsure().finally(() => { ensuring = null })
  return ensuring
}

async function doEnsure() {
  try {
    await docker.ping()
  } catch {
    setStatus({ state: 'no-docker', message: 'Docker is not running. Start Docker Desktop, and the workspace will connect automatically.' })
    throw new Error(status.message)
  }
  try {
    const hash = sandboxHash()
    let img = await docker.getImage(IMAGE).inspect().catch(() => null)
    if (!img || img.Config?.Labels?.['lab.hash'] !== hash) {
      await buildImage(hash)
      img = await docker.getImage(IMAGE).inspect()
    }
    const c = docker.getContainer(CONTAINER)
    let info = await c.inspect().catch(() => null)
    if (info && info.Image !== img.Id) {         // image was rebuilt: replace the container
      await c.remove({ force: true })
      info = null
    }
    if (!info) {
      setStatus({ state: 'starting', message: 'Creating the sandbox container…' })
      await docker.createContainer({
        name: CONTAINER,
        Image: IMAGE,
        User: '1000:1000',
        WorkingDir: CONTAINER_WORKDIR,
        Env: ['HOME=/home/coder', 'TERM=xterm-256color', 'LANG=C.UTF-8'],
        Labels: { 'lab.role': 'sandbox' },
        HostConfig: {
          Mounts: [{ Type: 'bind', Source: ROOT, Target: CONTAINER_WORKDIR }],
          NetworkMode: 'none',
          Memory: LIMITS.memoryBytes,
          MemorySwap: LIMITS.memoryBytes,
          NanoCpus: LIMITS.cpus * 1e9,
          PidsLimit: LIMITS.pids,
          ReadonlyRootfs: true,
          Tmpfs: { '/tmp': 'rw,exec,size=512m', '/home/coder': 'rw,size=64m,uid=1000,gid=1000' },
          CapDrop: ['ALL'],
          CapAdd: ['SYS_PTRACE'],          // gdb needs it to trace your program
          SecurityOpt: ['no-new-privileges'],
          Init: true,
        },
      })
      info = await c.inspect()
    }
    if (!info.State.Running) {
      setStatus({ state: 'starting', message: 'Starting the sandbox…' })
      await c.start()
    }
    readyAt = Date.now()
    setStatus({ state: 'ready', message: 'Sandbox ready' })
  } catch (e) {
    setStatus({ state: 'error', message: `Sandbox problem: ${(e as Error).message}` })
    throw e
  }
}

/** Poll in the background so the UI notices when Docker Desktop starts. */
export function watchDocker() {
  const tick = () => ensureSandbox().catch(() => {}).finally(() => setTimeout(tick, status.state === 'ready' ? 15000 : 4000))
  tick()
}

// ---------------- exec helpers ----------------

export interface ExecOptions { env?: string[]; workdir?: string; tty?: boolean; stdin?: boolean }

export async function execStart(cmd: string[], opts: ExecOptions = {}) {
  await ensureSandbox()
  const exec = await docker.getContainer(CONTAINER).exec({
    Cmd: cmd,
    AttachStdin: opts.stdin ?? false,
    AttachStdout: true,
    AttachStderr: true,
    Tty: opts.tty ?? false,
    Env: opts.env,
    WorkingDir: opts.workdir ?? CONTAINER_WORKDIR,
  })
  const stream = (await exec.start({ hijack: true, stdin: opts.stdin ?? false, Tty: opts.tty ?? false })) as Duplex
  return { exec, stream }
}

/** Split Docker's multiplexed stream into stdout/stderr callbacks. */
export function demux(stream: Duplex, onOut: (s: string) => void, onErr: (s: string) => void) {
  const out = new PassThrough(), err = new PassThrough()
  out.setEncoding('utf8'); err.setEncoding('utf8')
  out.on('data', onOut); err.on('data', onErr)
  docker.modem.demuxStream(stream, out, err)
}

export async function exitCode(exec: Docker.Exec): Promise<number> {
  for (let i = 0; i < 50; i++) {
    const info = await exec.inspect()
    if (!info.Running) return info.ExitCode ?? -1
    await new Promise((r) => setTimeout(r, 40))
  }
  return -1
}

/** Run a command to completion and collect its output. */
export async function execCollect(cmd: string[], opts: ExecOptions & { input?: string } = {}) {
  const { exec, stream } = await execStart(cmd, { ...opts, stdin: opts.input !== undefined })
  let stdout = '', stderr = ''
  const done = new Promise<void>((resolve) => stream.on('end', resolve).on('close', resolve))
  demux(stream, (s) => (stdout += s), (s) => (stderr += s))
  if (opts.input !== undefined) { stream.write(opts.input); stream.end() }
  await done
  return { stdout, stderr, code: await exitCode(exec) }
}

/** Translate container paths (/work/foo.cpp) back to workspace paths (foo.cpp). */
export const toContainerPath = (rel: string) => `${CONTAINER_WORKDIR}/${rel}`
export const fromContainerPath = (s: string) => s.split(`${CONTAINER_WORKDIR}/`).join('')

// Which languages can run, and which can also be traced step by step.
// Adding a language = install it in sandbox/Dockerfile + add an entry here.
import path from 'node:path'

export type TraceSupport = 'gdb' | 'python' | null

export interface Language {
  id: string
  name: string
  exts: string[]
  monaco: string
  /** Command to compile `src` into build dir `out`; omitted for interpreted languages. */
  compile?: (src: string, out: string) => string[]
  /** Command to run the program. */
  run: (src: string, out: string) => string[]
  env?: string[]
  trace: TraceSupport
  traceNote?: string
}

const base = (src: string) => path.posix.basename(src, path.posix.extname(src))
const UNBUFFER = ['LD_PRELOAD=/opt/lab/unbuffer.so']

export const LANGUAGES: Language[] = [
  {
    id: 'cpp', name: 'C++', exts: ['.cpp', '.cc', '.cxx', '.c++'], monaco: 'cpp',
    compile: (src, out) => ['g++', '-std=c++20', '-g', '-O0', '-Wall', '-Wextra', '-fdiagnostics-color=never', '-o', `${out}/prog`, src],
    run: (_src, out) => [`${out}/prog`], env: UNBUFFER, trace: 'gdb',
  },
  {
    id: 'c', name: 'C', exts: ['.c'], monaco: 'c',
    compile: (src, out) => ['gcc', '-std=c17', '-g', '-O0', '-Wall', '-Wextra', '-fdiagnostics-color=never', '-o', `${out}/prog`, src, '-lm'],
    run: (_src, out) => [`${out}/prog`], env: UNBUFFER, trace: 'gdb',
  },
  {
    id: 'python', name: 'Python', exts: ['.py'], monaco: 'python',
    run: (src) => ['python3', '-u', src], trace: 'python',
  },
  {
    id: 'javascript', name: 'JavaScript (Node)', exts: ['.js', '.mjs'], monaco: 'javascript',
    run: (src) => ['node', src], trace: null,
    traceNote: 'Step-by-step tracing for JavaScript is not built yet. Run, input, output and errors all work.',
  },
  {
    id: 'java', name: 'Java', exts: ['.java'], monaco: 'java',
    compile: (src, out) => ['javac', '-d', out, src],
    run: (src, out) => ['java', '-cp', out, base(src)], trace: null,
    traceNote: 'Step-by-step tracing for Java is not built yet. Run, input, output and errors all work.',
  },
  {
    id: 'bash', name: 'Bash', exts: ['.sh'], monaco: 'shell',
    run: (src) => ['bash', src], trace: null,
    traceNote: 'Shell scripts run but are not traced.',
  },
]

export function languageFor(file: string): Language | undefined {
  const ext = path.posix.extname(file).toLowerCase()
  return LANGUAGES.find((l) => l.exts.includes(ext))
}

export function publicLanguages() {
  return LANGUAGES.map(({ id, name, exts, monaco, trace, traceNote, compile }) => ({
    id, name, exts, monaco, compiled: !!compile, trace: !!trace, traceNote,
  }))
}

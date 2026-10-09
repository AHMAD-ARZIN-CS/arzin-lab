// Monaco = the editor from VS Code. Its language services run in Web Workers.
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  },
}

monaco.editor.defineTheme('lab', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#0e1120',
    'editor.lineHighlightBackground': '#161a2c',
    'editorGutter.background': '#0e1120',
  },
})

const EXT_LANG: Record<string, string> = {
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.c++': 'cpp', '.h': 'cpp', '.hpp': 'cpp', '.c': 'c',
  '.py': 'python', '.js': 'javascript', '.mjs': 'javascript', '.ts': 'typescript', '.java': 'java',
  '.sh': 'shell', '.json': 'json', '.md': 'markdown', '.html': 'html', '.css': 'css', '.txt': 'plaintext',
  '.go': 'go', '.rs': 'rust', '.cs': 'csharp', '.sql': 'sql', '.yml': 'yaml', '.yaml': 'yaml',
}
export const monacoLanguage = (path: string) => EXT_LANG[path.slice(path.lastIndexOf('.')).toLowerCase()] ?? 'plaintext'

/** One model per open file keeps its own undo history. */
export function modelFor(path: string, content: string) {
  const uri = monaco.Uri.parse(`file:///${path}`)
  let model = monaco.editor.getModel(uri)
  if (!model) {
    model = monaco.editor.createModel(content, monacoLanguage(path), uri)
    model.setEOL(monaco.editor.EndOfLineSequence.LF)
  } else if (model.getValue() !== content) {
    model.setValue(content)
  }
  return model
}

export function disposeModel(path: string) {
  monaco.editor.getModel(monaco.Uri.parse(`file:///${path}`))?.dispose()
}

export { monaco }

# Chalkbyte

**A local coding notebook for learning to program.** Write code and run it for real in a sandbox. Watch it execute step by step. Work problems out by hand on a whiteboard, then circle anything and ask the AI about it.

- **Real execution, safely.** C, C++, Python, JavaScript, Java and Bash run in a locked-down Docker container (no network, memory and CPU limits, non-root, read-only system). Nothing is simulated.
- **See your program run.** A step-by-step visualizer for C, C++ and Python shows stack frames, recursion, arrays, pointers and linked structures from the real run.
- **A whiteboard that knows math and code.** It's a GoodNotes-style notebook with pressure-sensitive pens. Lasso a problem and choose *Solve*, *Explain*, *Visualize* or *Find the mistake*. Answers come back with live, Desmos-style graphs you can trace, animate and pin to the board.
- **Practice that checks itself.** It ships with 40 C++ problems whose expected outputs were produced by running reference solutions. Hints get stronger one level at a time, and you can generate problems from your own lecture slides.
- **Your files, on your disk.** Code, boards, notes and saved explanations are plain files in one folder you own.

> **Status:** early (0.1). It runs locally on your own computer, for one person. It is built and tested on Windows with Docker Desktop. macOS and Linux should work but are less tested.

## Quick start

You need:
1. **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**, running. All code runs inside a container, never directly on your computer.
2. **[Node.js](https://nodejs.org/) 22.12 or newer.**
3. **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)**, installed and signed in (run `claude` once in a terminal), for the AI features. Everything else works without it.

```bash
git clone https://github.com/AHMAD-ARZIN-CS/chalkbyte.git
cd chalkbyte
npm install
npm run dev
```

Then open **http://localhost:5173**. On the first start, Chalkbyte builds its sandbox image (Debian with g++, gcc, gdb, Python 3, Node and OpenJDK 21). That takes a few minutes, once.

Your code lives in **`my-code/`** inside the Chalkbyte folder. It is created on first start with starter files and practice problems, and git ignores it.

### About the AI

Chalkbyte currently gets its explanations from the **Claude Code CLI** installed on your computer, run with no tools (it can't read your files or run commands) in an empty folder. What you select, or circle on a board, is sent to Anthropic as part of the prompt. Check your plan's terms for how Claude Code may be used. Support for other providers (your own API key, local models) is planned.

### Settings

Put a `chalkbyte.local.json` file next to `package.json` to change settings. It is gitignored. Environment variables `CHALKBYTE_ROOT`, `CHALKBYTE_PORT`, `CHALKBYTE_CLAUDE_CMD` and `CHALKBYTE_AI_MODEL` override it.

```json
{
  "codeDir": "D:/school/my-code",
  "port": 4317,
  "aiCommand": "claude",
  "aiModel": "sonnet"
}
```

| Key | Default | What it does |
|---|---|---|
| `codeDir` | `my-code` | The folder with your code, boards and notes (absolute, or relative to the Chalkbyte folder) |
| `port` | `4317` | The server port (the dev UI's proxy expects 4317) |
| `aiCommand` | found automatically | The path to the `claude` CLI |
| `aiModel` | `sonnet` | The model passed to the CLI |

## Layout

```
┌ Files / Practice / History ┬──────── Editor (tabs) ────────┬ Visualize / Explain ┐
│ explorer, problem          │ your actual source code       │ step-by-step trace  │
│ statement, versions        ├───────────────────────────────┤ or explanations     │
│                            │ Output · Terminal · Problems  ├─────────────────────┤
│                            │ · Tests                       │ Notes / Whiteboard  │
└────────────────────────────┴───────────────────────────────┴─────────────────────┘
```

Source:

```
server/   Node server: files, Docker sandbox, run/terminal/trace/tests (WebSocket), AI, library, lectures
web/      React UI: Monaco editor, xterm.js terminal, visualizer, whiteboard (web/src/lib/board.ts), graphs (web/src/lib/plot.ts)
sandbox/  The sandbox image and its tools: gdbtrace.py (C/C++), pytrace.py (Python), slides.py (lectures)
library/  The practice problems (src/<slug>/), built into library.json by scripts/build-library.ts
seed/     Starter files copied into your code folder on first start
scripts/  End-to-end checks (smoke.mjs, board-storage-test.mjs) and tools
```

## The core flow

| Step | How |
|---|---|
| Create or bring code | **New File**, **Upload ▾** (files or a whole project folder), drag-and-drop onto the explorer, or paste into a new file |
| Edit | Monaco (the VS Code editor), tabs, Ctrl+S to save, right-click a file to rename, move, duplicate, download or delete |
| Run with input | **▶ Run** (Ctrl+Enter). Type stdin in the **Input** box, or interact live in the Output panel. **■ Stop** kills the program |
| See errors | Compile errors and runtime errors (crash signals, Python tracebacks, Java and Node stack traces) are marked on the line and listed under **Problems** |
| Visualize | **◉ Visualize** (Ctrl+Shift+Enter) re-runs the same code with the same input under a tracer. Play, pause, step forward or back, scrub, and change speed |
| Understand | Select anything, then right-click or use **Explain Selection ▾**. Answers appear in the right panel and can be continued ("Go deeper") or saved to notes |
| Save and reopen | Everything is files on disk. Open tabs are restored on reload, and every file keeps a version history |

## What actually runs where

| Capability | How it works |
|---|---|
| Execution | `docker exec` into one long-lived sandbox container. The container has no network, 1 GB RAM, 2 CPUs, a 256-process limit, a read-only system, and runs as a non-root user. Each program also gets a CPU-time limit (20 s, which catches infinite loops but not a program waiting for input) and a wall-clock limit |
| Terminal | A real `bash` shell in the same container, at `/work` (your `my-code/` folder), attached to xterm.js. It works on exactly the same files as the editor |
| Interactive input | The program's stdin is a live pipe. Prompts appear immediately because C and C++ output is unbuffered with a small preloaded library (`sandbox/tools/unbuffer.c`) |
| C/C++ tracing | `sandbox/tools/gdbtrace.py` drives **GDB** through its Python API. It compiles with `-g -O0`, steps line by line through your file only (the standard library is skipped), and reads every frame's variables. It reads `std::vector`, `std::string` and `std::map` through libstdc++'s pretty printers, and follows pointers to heap objects |
| Python tracing | `sandbox/tools/pytrace.py` uses `sys.settrace`, the same hook debuggers use |
| Explanations | The `claude` CLI with **no tools** (it can't read files or run commands), run in an empty temporary folder. Your selection, file, input, errors and the current trace step are sent in the prompt |

### Languages

| Language | Run (input, output, errors, stop) | Step-by-step visualization |
|---|---|---|
| C++ | yes | **yes**: stack frames, recursion, vectors and arrays with index markers, pointers, references, structs, linked structures on the heap |
| C | yes | **yes** (same tracer) |
| Python | yes | **yes**: frames, recursion, lists, dicts, objects (shared references drawn as arrows) |
| JavaScript (Node) | yes | not yet: it runs normally and says so |
| Java | yes | not yet: it runs normally and says so |
| Bash | yes | no |

To add a language, install it in `sandbox/Dockerfile` and add an entry in `server/src/languages.ts`.

### Visualization limits (honest list)

- Recording stops after **1000 steps**. Use small inputs for loops.
- C/C++: a local declared on the current line shows **?** until its line runs, because its memory holds garbage before that.
- Heap objects are drawn in the order they're found by following pointers, with arrows between them. Linked lists read naturally. Trees and graphs show correctly but aren't laid out as trees yet.
- Tracing steps through code in **one file** (the open one). Multi-file C++ projects run fine but only that file's lines are traced.
- Programs that read input interactively are traced using the **Input box** contents, because the trace runs non-interactively.

## Getting around

- **Code | Board** switch at the top (Ctrl+1 / Ctrl+2). Code mode is the editor, output and terminal. Board mode is a whiteboard.
- **Icon rail** on the left: Files, Practice, Boards, History. Clicking the active icon again hides the side panel.
- **Right panel**: Visualize · Explain · Notes.
- **Ctrl+K**: jump to any file, board or problem, or type `>` for commands.
- **Panels**: Ctrl+B (side), Ctrl+J (output/terminal), Ctrl+Alt+B (right). Ctrl+Shift+F is focus mode; Esc exits.
- **Light / dark** with the sun/moon button. The editor, terminal and boards all follow it. The default follows your OS setting.

## Whiteboard (GoodNotes-style)

Boards are notebooks saved as `my-code/boards/<name>.board.json`.

- **Tools**: pen with pressure (a stylus works; with a pen, your palm or finger pans instead of drawing), highlighter (drawn under the ink), eraser, lasso, text, and pan (or hold Space). Ctrl+scroll or pinch zooms. Paper can be dots, grid, lines or plain. Undo and redo work.
- **Three pens**: *Fine* (even width, follows your hand exactly; best for small writing and math), *Ballpoint* (a little pressure and smoothing; the default) and *Smooth* (fountain-pen style, very smooth). Your choice is remembered. Four thicknesses. The first touch of a stylus no longer leaves a fat dot. The eraser end of a stylus erases.
- **Text you can change later**: with the text tool, tap existing text to edit it. Or tap it with the lasso to get *Edit text*, smaller/bigger and colors, or drag a corner to resize. Double-click text (lasso, text or pan tool) to edit it. Clearing all the words deletes it.
- **Stray stylus taps**: a stylus tap on the toolbar within 0.4 s of finishing a stroke is ignored, so writing near the top edge doesn't switch tools.
- **Paste or drop a screenshot** of a textbook or LeetCode problem onto the board.
- **Circle anything with the lasso** (L), then use **Ask AI → Solve · Explain · Visualize · Find the mistake · Ask…**. Exactly what's inside the lasso is sent as an image, and the answer appears in Explain with a thumbnail of what the AI saw. The AI first writes down what it read, so you can catch handwriting it misread. *Visualize* answers can include diagrams (SVG, sanitized). The lasso also moves or deletes what it caught.

## Diagrams, everywhere

- **In answers:** the AI draws real graphics instead of code. ` ```plot ` blocks become function graphs, drawn by our own plotter with formulas parsed safely by mathjs, showing roots, extrema, shaded areas and labels. ` ```mermaid ` blocks become flowcharts, trees, state machines and call diagrams. Every diagram has **Put on board**.
- **Graphs are live, like Desmos:** drag to pan, scroll to zoom, hover to read values. **Trace** puts a dot on the curve with its x, y and slope ("increasing / decreasing"), **Play** walks it along the curve, and **Tangent** draws the tangent line. Graphs with parameters get sliders (a, b, h, k…) that you can drag or animate.
- **Animate / make interactive:** on any graph, asks the AI to turn constants into sliders and tell you what to try.
- **Board → Visualize:** the first diagram is placed on the board next to what you circled, in a free spot that doesn't cover your writing, and the view moves to show it. It is selected right away. Drag it to move it, and drag a corner to resize it.
- **Textbook notation in graphs:** labels are typeset from the formula itself, with italic variables and raised exponents: `sin(x)*x` shows as *x* sin *x*, `exp(-x^2/2)` as *e* with −*x*²/2 raised, `log(x)` as ln *x*, `sqrt(x+1)` as √(*x* + 1).
- **Open live graph:** tap a graph on the board with the lasso, then choose *Open live graph* to explore it again (or just double-click the graph). *Put on board* updates the picture with your current view and slider values.
- **Explain with a diagram:** a button on every answer asks for a diagram-based explanation.
- **Code visualizer views:**
  - **Memory**: the stack, heap, pointers and arrays, with an **arrays as bars** option for sorting and sums.
  - **Call tree**: grows as you step, and shows each call's arguments and return value.
  - **Timeline**: a small chart per number variable across the whole run.
  - **Flowchart**: drawn by the AI from your code; the box for the running line lights up as you step.
  Everything except the flowchart's layout comes from the real recorded run.

## Board storage

Boards are stored like a tiny database, not one growing file:
```
boards/notes.board.json            small manifest: paper, view, list of segments
boards/notes.board/seg-0001.json   up to 300 items (or ~2 MB) each
boards/notes.board/assets/<sha>.png pictures, stored once and named by content hash
```
New strokes are appended to the last segment, so a save rewrites only that segment, and full segments are never touched again. This is the same idea as database pages and log segments. Pictures stay out of the JSON, and the same screenshot pasted twice is stored once. Old single-file boards still open and are converted on their next save. Check it with `node scripts/board-storage-test.mjs`.

## Problem library

**Practice → Library** has 40 C++ problems in a learning order: Basics → Arrays & vectors → Strings → Functions & recursion → Pointers & linked lists → Stacks & queues → Hashing → Sorting & searching → Backtracking → Dynamic programming → Trees → Graphs.

- Clicking a problem copies it into `my-code/practice/<name>/`. Your code is never overwritten if you reinstall.
- **Every expected output was produced by running a reference solution in the sandbox**, not typed by hand (`scripts/build-library.ts`). Every starter is checked to compile. To add problems, put them in `library/src/` and run `npx tsx scripts/build-library.ts`.
- Passing all tests marks a problem **solved ✓**. Progress is saved in `my-code/progress.json`.
- **Reference solution** shows it as a diff next to your code, and only after a confirmation.

## Lecture slides

**Lectures** (left rail): upload or drop PDF, PPTX, Markdown or text slides. They are read **inside the sandbox**: `pdftotext` and `pdftoppm` for PDFs, slide XML for PPTX. Files land in `my-code/lectures/<name>/`.

- **Open as board**: the slides become notebook pages. Write on them, then circle anything and ask the AI.
- **Study notes**: key concepts, common mistakes, and check-yourself questions. You can save them to notes.
- **Practice problems**: the AI writes problems based on the slides along with a reference solution. The sandbox compiles and runs that solution to produce the expected outputs, and anything that doesn't compile or crashes is dropped. You can also generate problems from any topic under Practice → Generate.
- **Ask about this lecture**: questions answered using the slide text.

PDF works best. PPTX gives text and pictures, but not the exact layout; for that, export to PDF.

## Learning features

- **Practice** tab: problems are folders in `my-code/practice/<name>/` containing `problem.md`, `tests.json` and your code. Run the tests to see expected vs actual output, time and memory per case. **Visualize with this input** debugs one failing case. Hints get stronger one level at a time (nudge, approach, walkthrough, full solution), and the full solution needs a confirmation. **+ My own problem** takes a pasted statement, starter code and test cases. **What should I practice next?** suggests a targeted exercise.
- **Improve ▾**: *Suggest a fix*, *Optimize & compare*, or *Another approach*. The AI's code always opens as a **diff against yours**, and the right side is editable. **Test both** runs both versions on the same tests (3 runs each, median), flags any output differences, and keeps measured numbers separate from the explanation's theoretical complexity.
- **History** tab: the original version from before your first save, autosaves every 10 minutes, and a snapshot before any AI change is applied. Click a version to diff it and restore it if you want. Deleted files go to `my-code/.lab/trash`.
- **Notes**: per-file Markdown notes (`my-code/notes/<file>.md`). "Save to notes" stores an explanation with a link back to the line it's about. "Board for this file" opens a whiteboard tied to that file.

## Security model

This server can run code, so it is built so that only you can reach it:
- It listens on **127.0.0.1** only.
- It checks the `Host` header, which defends against DNS rebinding.
- Every API call needs an `X-Lab: 1` header. Browsers don't let other websites send custom headers cross-site without a CORS preflight, which this server never approves.
- WebSockets are accepted only from the workspace's own origin.
- File paths are confined to your code folder: `..` is rejected and symlinks are resolved and checked.
- AI output and notes are rendered through DOMPurify. Math is typeset by KaTeX with `trust: false`, mermaid runs in strict mode, and graph formulas are parsed by mathjs with its dangerous functions disabled, never evaluated as JavaScript.
- The AI CLI runs with no tools, in an empty temporary folder.

Found a security problem? Please see [SECURITY.md](SECURITY.md).

## Components (verified October 2026)

| Component | Used for | License |
|---|---|---|
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | editor + diff view | MIT |
| [xterm.js](https://github.com/xtermjs/xterm.js) | terminal | MIT |
| [dockerode](https://github.com/apocas/dockerode) | Docker API (exec, TTY, resize) | Apache-2.0 |
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | layout | MIT |
| [perfect-freehand](https://github.com/steveruizok/perfect-freehand) | smooth pressure-sensitive pen strokes | MIT |
| [lucide](https://github.com/lucide-icons/lucide) | icons | ISC |
| [marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify) | safe Markdown | MIT / Apache-2.0 or MPL-2.0 |
| [KaTeX](https://github.com/KaTeX/KaTeX) | math in explanations | MIT |
| [mathjs](https://github.com/josdejong/mathjs) | parsing graph formulas safely | Apache-2.0 |
| [mermaid](https://github.com/mermaid-js/mermaid) | flowcharts and diagrams | MIT |
| GDB, GCC, Python, Node, OpenJDK | inside the sandbox image only | GPL / PSF / MIT / GPL+CE |

**Considered and not used:**
- **Judge0**: GPL-3.0, last release April 2024, and needs cgroup v1, which Docker Desktop/WSL2 doesn't provide. It's also batch-only.
- **Piston**: the public API has needed an approved key since February 2026, and keys exclude individual projects. Self-hosting gives a stdin stream, not a terminal.
- **Python Tutor**: its repository appears to have been taken down, and its C++ backend is a Valgrind fork pinned to old Linux. Its ideas (one step per line, stack and heap with arrows, a step cap) shaped the visualizer.
- **CodeDive** (Park et al., 2025): an activity-monitoring IDE for instructors. The idea adapted here is a personal timeline: version history and a record of what changed between broken and working code.
- **tldraw**: requires a license key for production use.
- **Excalidraw** (used at first): great for diagrams, but not for handwriting notes. It was replaced with a small notebook engine on perfect-freehand (the same stroke library Excalidraw uses), which allowed lasso-to-AI, palm rejection and paper styles.

None of these provide step tracing, so the tracers are this project's own code.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to run the checks.

## License

[MIT](LICENSE) © 2026 Ahmad Sapy

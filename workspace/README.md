# Arzin Lab Workspace

A coding and learning workspace: **write code, run it for real, watch it execute, and ask about anything.**

```
┌ Files / Practice / History ┬──────── Editor (tabs) ────────┬ Visualize / Explain ┐
│ explorer, problem          │ your actual source code       │ step-by-step trace  │
│ statement, versions        ├───────────────────────────────┤ or explanations     │
│                            │ Output · Terminal · Problems  ├─────────────────────┤
│                            │ · Tests                       │ Notes / Whiteboard  │
└────────────────────────────┴───────────────────────────────┴─────────────────────┘
```

## Run it

Requirements:
1. **Docker Desktop** (free for personal and education use). All code runs inside a container, never directly on Windows.
2. **Node 20+**.
3. **Claude Code**, logged in, for explanations. Run `claude` once in a terminal and log in.

```bash
cd workspace
npm install
npm run dev
```

Then open **http://localhost:5173**. The first time Docker is running, the workspace builds the sandbox image automatically (Debian with g++, gcc, gdb, Python 3, Node, and OpenJDK 21). That takes a few minutes.

Your code lives in **`my-code/`** at the repository root. It is a normal folder, so you can commit it, edit it in VS Code, or point `LAB_ROOT` at another folder.

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

## Learning features

- **Practice** tab: problems are folders in `my-code/practice/<name>/` containing `problem.md`, `tests.json` and your code. Run the tests to see expected vs actual output, time and memory per case. **Visualize with this input** debugs one failing case. Hints get stronger one level at a time (nudge, approach, walkthrough, full solution), and the full solution needs a confirmation. **+ My own problem** takes a pasted statement, starter code and test cases. **What should I practice next?** suggests a targeted exercise.
- **Improve ▾**: *Suggest a fix*, *Optimize & compare*, or *Another approach*. The AI's code always opens as a **diff against yours**, and the right side is editable. **Test both** runs both versions on the same tests (3 runs each, median), flags any output differences, and keeps measured numbers separate from the explanation's theoretical complexity.
- **History** tab: the original version from before your first save, autosaves every 10 minutes, and a snapshot before any AI change is applied. Click a version to diff it and restore it if you want. Deleted files go to `my-code/.lab/trash`.
- **Notes**: per-file Markdown notes and an Excalidraw whiteboard, saved as `my-code/notes/<file>.md` and `.excalidraw`. "Save to notes" stores an explanation with a link back to the line it's about.
- **Focus** (Ctrl+Shift+F): collapses everything except the editor.

## Security model

This server can run code, so it is built so that only you can reach it:
- It listens on **127.0.0.1** only.
- It checks the `Host` header, which defends against DNS rebinding.
- Every API call needs an `X-Lab: 1` header. Browsers don't let other websites send custom headers cross-site without a CORS preflight, which this server never approves.
- WebSockets are accepted only from the workspace's own origin.
- File paths are confined to `my-code/`: `..` is rejected and symlinks are resolved and checked.
- AI output and notes are rendered through DOMPurify.

## Components (verified October 2026)

| Component | Used for | License |
|---|---|---|
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | editor + diff view | MIT |
| [xterm.js](https://github.com/xtermjs/xterm.js) | terminal | MIT |
| [dockerode](https://github.com/apocas/dockerode) | Docker API (exec, TTY, resize) | Apache-2.0 |
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | layout | MIT |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | whiteboard | MIT |
| [marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify) | safe Markdown | MIT / Apache-2.0 or MPL-2.0 |
| GDB, GCC, Python, Node, OpenJDK | inside the sandbox image only | GPL / PSF / MIT / GPL+CE |

**Considered and not used:**
- **Judge0**: GPL-3.0, last release April 2024, and needs cgroup v1, which Docker Desktop/WSL2 doesn't provide. It's also batch-only.
- **Piston**: the public API has needed an approved key since February 2026, and keys exclude individual projects. Self-hosting gives a stdin stream, not a terminal.
- **Python Tutor**: its repository appears to have been taken down, and its C++ backend is a Valgrind fork pinned to old Linux. Its ideas (one step per line, stack and heap with arrows, a step cap) shaped the visualizer.
- **CodeDive** (Park et al., 2025): an activity-monitoring IDE for instructors. The idea adapted here is a personal timeline: version history and a record of what changed between broken and working code.
- **tldraw**: requires a license key for production use, so Excalidraw was chosen.

None of these provide step tracing, so the tracers are this project's own code.

# Arzin Lab: instructions for Claude and other agents

## Purpose
Ahmad's coding and learning lab. Ahmad is a CS student transferring to UC Berkeley and studying for Security+.
He is learning C++ fundamentals now, working toward LeetCode problems and larger projects.
The goal is working code **plus understanding**: he writes code, runs it, sees what happens, and understands it.

## Layout
- `workspace/`: **the main product**, a local coding workspace (see `workspace/README.md`).
  - `server/src/`: Node server: files API, Docker sandbox, run/stop/terminal/trace/tests (WebSocket), AI via the `claude` CLI.
  - `web/src/`: React + Monaco + xterm.js UI. State and actions live in `web/src/lib/store.ts`.
  - `sandbox/`: Dockerfile and the tracers (`tools/gdbtrace.py` for C/C++, `tools/pytrace.py` for Python).
  - `seed/`: starter files and practice problems, copied into `my-code/` on first start.
- `my-code/`: Ahmad's own code, practice problems and notes. `.lab/` inside it holds history, trash and scratch files (gitignored).
- `modules/`, `hub/`, `scenes/`: an earlier 3D learning experiment, kept for reference.

## How to work here
- Keep the central flow working: create/upload → edit → run with input → see output/errors → visualize → explain → save/reopen.
- Never fake execution. Output must come from really running the code in the sandbox. If something isn't supported, say so in the UI.
- AI-proposed code is always shown as a diff and never applied without Ahmad clicking Apply. The original is snapshotted first.
- In practice mode, don't reveal solutions unless explicitly asked (hint level 4).
- When explaining a concept, start in plain English, use his code and real values, then go deeper on request.
- Match the code style: small focused files, comments that teach, no unnecessary dependencies.

## Commands
- `cd workspace && npm run dev`: server on :4317 and UI on http://localhost:5173 (needs Docker Desktop running).
- `npm run typecheck` / `npm run build`.

## Safety
- The server runs code: keep it bound to 127.0.0.1, keep the Host/X-Lab/Origin checks, and keep paths confined to `my-code/`.
- Never use `eval`/`innerHTML` with AI or file content (DOMPurify is used for Markdown).
- Never commit secrets. Ahmad's home folder (`C:\Users\arzin`) is ALSO a git repo, so never run git against it.

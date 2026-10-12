# Arzin Lab: instructions for Claude and other agents

## Purpose
Ahmad's coding and learning lab. Ahmad is a CS student transferring to UC Berkeley and studying for Security+.
He is learning C++ fundamentals now, working toward LeetCode problems and larger projects.
The goal is working code **plus understanding**: he writes code, runs it, sees what happens, and understands it.
Explain concepts as you build: plain English first, then the details. Ask what's unclear before building something big.

## Layout
- `workspace/`: **the main product**, a local coding workspace (see `workspace/README.md`).
  - `server/src/`: Node server: files API, Docker sandbox, run/stop/terminal/trace/tests (WebSocket), AI via the `claude` CLI,
    problem library, lectures, problem generation, saved explanations.
  - `web/src/`: React + Monaco + xterm.js UI. State and actions live in `web/src/lib/store.ts`; whiteboard engine in `web/src/lib/board.ts`.
  - `sandbox/`: Dockerfile and the sandbox tools (`tools/gdbtrace.py` for C/C++, `tools/pytrace.py` for Python, `tools/slides.py` for lectures).
  - `library/`: verified practice problems (`src/<slug>/`, built into `library.json` by `scripts/build-library.ts`).
  - `seed/`: starter files and practice problems, copied into `my-code/` on first start.
- `my-code/`: Ahmad's own code, practice, boards, notes, lectures and saved explanations (`.chats/`).
  `.lab/` inside it holds history, trash and scratch files (gitignored). **Don't edit or commit his files unless he asks.**
- `projects/`: **mini-projects** (see below).
- `modules/`, `hub/`, `scenes/`: an earlier 3D learning experiment (pure-Python renderer + three.js hub). Reusable for 3D work.

## Mini-projects (`projects/<name>/`)
Arzin Lab holds many mini-projects. When Ahmad starts a new one:
- Create `projects/<short-kebab-name>/` (create `projects/` if it doesn't exist). Everything for that project lives there.
- Give it a `README.md` covering: the goal, how to run/open it, the parts and how they work, and **what Ahmad learned** (concepts,
  formulas, decisions and why). Keep the README updated as the project grows.
- Add a line for it to the "Mini-projects" list in the root `README.md`.
- Reuse what the lab already has instead of rebuilding: the workspace sandbox for running code, the visualizer, boards
  (for sketches and circling questions), and the 3D hub/renderer for 3D models.
- Don't change `workspace/` from inside a mini-project unless the change helps the workspace in general. If you do,
  run the checks below.
- Commit each working step with a clear message (`<project>: what changed`) and push.

## How to work here
- Keep the workspace's central flow working: create/upload → edit → run with input → see output/errors → visualize → explain → save/reopen.
- Never fake execution or results. Output must come from really running things. If something isn't supported or failed, say so.
- AI-proposed code is always shown as a diff and never applied without Ahmad clicking Apply. The original is snapshotted first.
- In practice mode, don't reveal solutions unless explicitly asked (hint level 4).
- When explaining a concept, start in plain English, use his code and real values, then go deeper on request.
- Match the code style: small focused files, comments that teach, no unnecessary dependencies.
- Before adding a library, check its license and that it's maintained. Prefer open source.

## Commands and checks
- Ahmad runs `cd workspace && npm run dev`: server on :4317, UI on http://localhost:5173 (needs Docker Desktop running).
- After changing workspace code: `npm run typecheck`. After server/sandbox changes, also `node scripts/smoke.mjs`
  (25 end-to-end checks against the real sandbox).
- When testing in the browser, **never draw on or modify his real boards or files**. Use throwaway ones and clean up afterwards.
- Edit source files with the Edit/Write tools, not PowerShell regex rewrites (they once corrupted UTF-8).

## Safety
- The server runs code: keep it bound to 127.0.0.1, keep the Host/X-Lab/Origin checks, and keep paths confined to `my-code/`.
- Never use `eval`/`innerHTML` with AI or file content (DOMPurify is used for Markdown).
- Never commit secrets. Ahmad's home folder (`C:\Users\arzin`) is ALSO a git repo (it contains `.ssh`), so never run git against it:
  only run git inside the Arzin Lab folder.

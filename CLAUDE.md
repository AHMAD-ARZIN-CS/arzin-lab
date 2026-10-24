# Chalkbyte: instructions for Claude and other coding agents

## What this is
Chalkbyte is a local coding notebook for people learning to program: write code, run it for real in a Docker sandbox,
watch it execute step by step, and use a whiteboard where you can circle anything and ask the AI about it.
The goal is working code **plus understanding**. See `README.md` for the full feature guide.

## Layout
- `server/src/`: Node server. Files API, Docker sandbox, run/stop/terminal/trace/tests over WebSocket, AI via the `claude` CLI
  (`ai.ts`), problem library, lectures, problem generation, saved explanations, segmented board storage (`boards.ts`).
  Paths and settings: `config.ts` (code folder = `my-code/` or `chalkbyte.local.json` → `codeDir`).
- `web/src/`: React + Monaco + xterm.js UI. State and actions in `lib/store.ts`; whiteboard engine in `lib/board.ts`;
  graphs in `lib/plot.ts` and `components/InteractivePlot.tsx`; textbook notation for formulas in `lib/mathfmt.ts`.
- `sandbox/`: the Dockerfile and sandbox tools (`tools/gdbtrace.py` for C/C++, `tools/pytrace.py` for Python, `tools/slides.py`).
- `library/`: verified practice problems (`src/<slug>/`, built into `library.json` by `scripts/build-library.ts`).
- `seed/`: starter files copied into the code folder on first start.
- The user's code folder (`my-code/` by default) is **theirs**: gitignored, never edited or committed unless they ask.

## Rules
- Keep the central flow working: create/upload → edit → run with input → see output/errors → visualize → explain → save/reopen.
- Never fake execution or results. Output must come from really running things. If something isn't supported or failed, say so.
- AI-proposed code is always shown as a diff and never applied without the user clicking Apply. The original is snapshotted first.
- In practice mode, don't reveal solutions unless explicitly asked (hint level 4).
- Explanations: plain English first, using the learner's own code and real values, then go deeper on request.
- Small focused files, comments that teach, no unnecessary dependencies. Check a library's license and maintenance before adding it.

## Checks
- `npm run dev`: server on :4317, UI on http://localhost:5173 (Docker must be running).
- After code changes: `npm run typecheck`. After server or sandbox changes, also `npm run test:smoke` and `npm run test:boards`
  (with the dev server running).
- When testing in a browser, never modify the user's real boards or files. Use throwaway ones and clean up afterwards.

## Safety
- The server runs code: keep it bound to 127.0.0.1, keep the Host/X-Lab/Origin checks, and keep paths confined to the code folder.
- Never use `eval`/`innerHTML` with AI or file content (DOMPurify is used for Markdown; KaTeX with trust:false; mermaid strict).
- Never commit secrets or the user's code folder.

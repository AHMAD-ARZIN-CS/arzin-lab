# Arzin Lab

A practical coding and learning lab: **write code, run it for real, watch it execute step by step, and ask about anything you don't understand.** It starts with C++ fundamentals and works toward LeetCode-style problems and bigger projects.

## The workspace (start here)

```bash
cd workspace
npm install
npm run dev      # then open http://localhost:5173
```

Needs **Docker Desktop**, which runs your code in an isolated container, and **Claude Code** logged in, for explanations. The full guide is in [workspace/README.md](workspace/README.md).

- An editor, file explorer and tabs, with upload, rename, download, and version history for every file
- Real execution in a sandbox: C, C++, Python, JavaScript, Java and Bash, with live input, Stop, and errors marked on the line
- A real terminal on the same files
- A step-by-step visualizer for C, C++ and Python: stack frames, recursion, vectors with index markers, pointers, references, linked structures
- Select any code, then Explain, Show visually, Why this error, Small example, Hint, or Compare another approach
- Practice problems with tests, progressive hints, and your own problems
- AI fixes and optimizations shown as diffs, and tested side by side with your version
- Per-file notes and a whiteboard

## Layout

```
arzin-lab/
├── workspace/   The coding workspace: server, web UI, sandbox image, tracers
├── my-code/     YOUR code, practice problems and notes (created on first start)
├── projects/    Mini-projects, one folder each
├── modules/     Earlier: a 3D renderer written from scratch in Python
├── hub/         Earlier: 3D dashboard experiment (three.js)
└── scenes/      Earlier: 3D scene files for the hub
```

## Mini-projects

Each mini-project lives in `projects/<name>/` with its own README: the goal, how to run it, and what I learned.

| Project | What it is |
|---|---|
| _(none yet)_ | |

# Arzin Lab: instructions for Claude and other agents

## Purpose
This is Ahmad's learning-by-building lab. The goal is NOT just working code. It is working code
**plus understanding of the fundamentals underneath**. Ahmad is a CS student (transferring to UC
Berkeley) and a Security+ student.

## How to work here
- **Explain as you build.** For every new concept, explain the *why* in plain language, then the math/code.
  When Ahmad says he doesn't understand something, explain it visually: write a scene file in `scenes/`
  and point him to it in the Hub.
- **From scratch first, library second.** New fundamentals get a small no-dependency module in
  `modules/NN-name/` with a `NOTES.md` (concepts, how to run, "check yourself" questions).
  Once a fundamental is understood, use the real tool (three.js, Godot, SQLite...).
- **Everything shows in the Hub.** New interactive modules go in `hub/src/pages/` and are registered in
  `hub/src/registry.ts`. Static visuals are scene files in `scenes/` (spec: `scenes/README.md`).
- **Visualizing textbook problems:** for a physics/calculus/linear-algebra question, compute the answer,
  then write `scenes/<track>-<topic>.json` with labeled key points and a description of what to notice.
- **Match the code style:** small files, no UI framework in the Hub, comments that teach, not narrate.

## Commands
- Hub dev server: `cd hub && npm run dev` (port 5173). Build/type-check: `npm run build`.
- Module 01: `cd modules/01-3d-from-scratch && python step1_points.py` (also step2, step3, export_scene, make_icons).

## Safety
- Never commit secrets. `.env*` is gitignored.
- This repo is its own git repo. Ahmad's home folder (`C:\Users\arzin`) is ALSO a git repo,
  so never run git commands that target it.
- Scene formulas go through mathjs with dangerous functions disabled (`hub/src/scene/expr.ts`).
  Never use `eval`/`new Function` on scene content, and never put scene text into `innerHTML`.

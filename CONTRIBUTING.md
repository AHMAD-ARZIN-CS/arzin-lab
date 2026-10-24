# Contributing to Chalkbyte

Thanks for helping. Chalkbyte is a learning tool, so changes should keep two things true: **what it shows is real** (output comes from actually running code, never invented), and **the learner stays in control** (AI changes are shown as diffs and only applied when they click Apply).

## Set up

Follow the Quick start in the [README](README.md): Docker Desktop running, Node 22.12+, then `npm install` and `npm run dev`.

## Checks

Run these before opening a pull request:

```bash
npm run typecheck        # types for the web app and the server
npm run test:smoke       # end-to-end checks against the real sandbox (needs `npm run dev` running)
npm run test:boards      # board storage checks (needs the server running)
```

The smoke and board tests create throwaway files in your code folder and clean them up afterwards.

## Guidelines

- Keep files small and focused, with comments that explain *why*. Match the style around your change.
- Prefer no new dependency. If one is needed, it must be open source, maintained, and have a compatible license. Add it to the components table in the README.
- Never use `eval`, `new Function` or `innerHTML` with AI output or file content. Markdown goes through DOMPurify.
- Keep the server's protections: bound to 127.0.0.1, `Host`/`X-Lab`/`Origin` checks, and paths confined to the code folder.
- New languages: install them in `sandbox/Dockerfile` and add an entry in `server/src/languages.ts`.
- New practice problems: add `library/src/<slug>/` (problem, starter, reference solution, meta) and run `npx tsx scripts/build-library.ts`. That script produces the expected outputs by running the solution in the sandbox.

## Reporting bugs

Open an issue with what you did, what you expected and what happened, plus your OS and Docker version. For security problems, see [SECURITY.md](SECURITY.md) instead.

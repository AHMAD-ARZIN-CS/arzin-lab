# Security policy

Chalkbyte runs code, so security matters even though it is a local, single-user app.

## What it is designed to protect against

- **Other websites** reaching the local server: it listens on 127.0.0.1 only, checks the `Host` header (DNS rebinding), requires a custom header on every API call, and accepts WebSockets only from its own origin.
- **Code you run** reaching your computer: programs run in a Docker container with no network, memory, CPU and process limits, a read-only system, and a non-root user. Only your code folder is mounted.
- **Untrusted content** (AI answers, notes, files) running in the page: it is sanitized with DOMPurify, KaTeX runs with `trust: false`, mermaid in strict mode, and formulas are parsed by mathjs, never evaluated as JavaScript.
- **Path tricks**: paths are confined to the code folder, `..` is rejected, and symlinks are resolved and checked.

## Not in scope

- Exposing Chalkbyte to a network or hosting it for other people. It is not built for that.
- A malicious program escaping a correctly configured Docker container. That is a Docker or kernel issue.

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting: the repository's **Security** tab → **Report a vulnerability**. Include the steps to reproduce and what an attacker could do. You should get a reply within a week.

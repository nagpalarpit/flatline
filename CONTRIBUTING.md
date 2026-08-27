# Contributing to Flatline

Thanks for considering a contribution. Flatline is a small, focused project
— keep changes scoped and avoid adding new abstractions or config knobs
that aren't needed by the change at hand.

## Getting Started

Follow the "Local Development" section in the [README](README.md) to get a
working dev environment (D1 database, migrations, `wrangler dev`).

## Before Opening a PR

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
bash sample/smoke-test.sh   # end-to-end check against a running dev server
```

The first two must pass locally and in CI (`.github/workflows/ci.yml` runs
typecheck + test on every push and PR) — if it's red, the PR won't be
merged. The smoke test needs `wrangler dev` running in another terminal; run
it yourself for any change that touches request handling or the cron sweep.

If you're changing `src/lib/checks.ts` (webhook URL validation) or the cron
sweep logic, add or extend a test rather than only hand-testing — that file
is the most security-sensitive part of the codebase (see
[SECURITY.md](SECURITY.md)) and regressions there are easy to miss by eye.

## Pull Requests

- One logical change per PR. Unrelated cleanups make review harder — open a
  separate PR.
- Describe *why* the change is needed, not just what it does — the diff
  already shows what changed.
- If your change touches the API surface (routes, request/response shape),
  update the README's API section in the same PR.

## Reporting Bugs

Open a GitHub issue with a minimal reproduction (a `curl` sequence against a
freshly deployed instance is ideal). If it's a security issue, see
[SECURITY.md](SECURITY.md) instead — please don't file it as a public issue.

## Code Style

There's no linter configured yet; match the existing style in the file
you're editing (TypeScript, Hono route handlers, no unnecessary comments).

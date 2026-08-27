# Security Policy

Flatline is self-hosted: each deployment runs entirely inside the operator's
own Cloudflare account (Workers, D1, Cron Triggers). There is no shared
multi-tenant infrastructure and no hosted instance operated by this project,
so a vulnerability report is almost always about the code itself, not a
specific deployment.

## Supported Versions

Only the latest commit on `main` is supported. There are no maintained
release branches — if you're running an older checkout, update before
reporting an issue to confirm it still reproduces.

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security reports.

Email **hyperstring.labs@gmail.com** with:
- A description of the vulnerability and its impact.
- Steps to reproduce (a minimal request/curl example is ideal).
- The commit hash you tested against.

We aim to acknowledge reports within a few days. Once a fix is confirmed, it
will be pushed to `main` and credited to the reporter in the commit message
unless you ask to stay anonymous.

## Scope Notes

- **SSRF-adjacent webhook validation** (`src/lib/checks.ts`) is the most
  security-sensitive part of the codebase: `webhook_url` is checked against
  loopback/private/link-local IP literals at config time. DNS rebinding is
  explicitly out of scope by design (documented in the README) — a report
  that only demonstrates rebinding isn't news, but a bypass of the literal
  IP check itself is.
- The `/ping/:id` endpoint is intentionally unauthenticated (the check ID
  is the credential) — reports that this "lacks auth" are expected
  behavior, not a vulnerability, unless you can show the ID is guessable
  or enumerable.
- API key generation, tier enforcement, and the cron sweep logic that fires
  webhooks are also in scope — e.g. a bug that lets one API key read or
  modify another key's checks would be a high-severity report.
- Cloudflare platform-level issues (Workers runtime, D1, Cron Triggers
  itself) are out of scope — report those to Cloudflare directly.

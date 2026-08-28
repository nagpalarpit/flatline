# Flatline

A dead man's switch for cron jobs and scheduled tasks. Ping it after every run; get alerted the moment it stops. Self-hosted on your own Cloudflare account.

[![CI](https://github.com/nagpalarpit/flatline/actions/workflows/ci.yml/badge.svg)](https://github.com/nagpalarpit/flatline/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/nagpalarpit/flatline)](https://github.com/nagpalarpit/flatline/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nagpalarpit/flatline)

This is a self-hosted product: you deploy it to your own Cloudflare account (free tier is enough to start) and it's entirely yours — your data, your checks, no third party in the request path. Alerting is outbound webhook-only, so there's no email/SMS provider to configure either.

## How it works

1. Register for an API key.
2. Create a "check" for each cron job / scheduled task you want monitored, with an expected `period_seconds` (how often it should run) and `grace_seconds` (how late it's allowed to be).
3. Add a `curl` to your job that pings the check's `ping_url` on every successful run.
4. Flatline sweeps every minute for checks that haven't pinged within `period_seconds + grace_seconds` and fires your configured webhook the moment one goes overdue — and again when it recovers.

## Quick Start

```bash
# After deploying (see below), register a key on your own instance:
curl -X POST https://your-worker.your-subdomain.workers.dev/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'

# Create a check
curl -X POST https://your-worker.your-subdomain.workers.dev/checks \
  -H 'Authorization: Bearer sk_YOUR_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"name":"nightly-backup","period_seconds":86400,"grace_seconds":3600,"webhook_url":"https://hooks.example.com/alert"}'

# Add this to the end of your cron job:
curl https://your-worker.your-subdomain.workers.dev/ping/CHECK_ID
```

## API

```
POST   /register              self-serve free-tier API key (IP rate-limited)
POST   /checks                create a check
GET    /checks                list your checks
GET    /checks/:id            view a single check
PATCH  /checks/:id            update a check (name, period, grace, webhook_url)
DELETE /checks/:id            soft-delete a check
GET|POST /ping/:id            heartbeat — no API key required, the check id is the credential
```

All `/checks*` routes require `Authorization: Bearer sk_your_key`.

## Built-in tiers

The code ships with a free/pro/business tier model already wired up (check-count limits and a minimum ping interval per tier, to bound worst-case request volume). Self-serve registration only ever grants `free`; there's no billing wired up, so `pro`/`business` only matter if you grant them yourself (e.g. via a direct D1 update) while self-hosting for a team.

| Tier | Max checks | Min ping interval |
|------|-----------|-------------------|
| Free | 25 | 300s |
| Pro | 100 | 60s |
| Business | 1000 | 60s |

## Security notes

`webhook_url` is validated against loopback/private/link-local IP literals at config time (SSRF-adjacent hardening) — see `src/lib/checks.ts` for what is and isn't covered (DNS rebinding is explicitly out of scope).

## Local Development

### Prerequisites
- Node.js 18+, npm
- Wrangler (`npm install -g wrangler`)
- A Cloudflare account with Workers access

### Setup

```bash
git clone https://github.com/nagpalarpit/flatline.git
cd flatline
npm install

# 1. Create D1 database
wrangler d1 create flatline-db
# Copy the returned database_id into wrangler.toml [d1_databases]

# 2. Apply migrations locally
npm run db:local

# 3. Start dev server
npm run dev
```

Open http://127.0.0.1:8787

### Test

```bash
npm test
bash sample/smoke-test.sh
```

### Typecheck

```bash
npm run typecheck
```

## Deployment

The one-click button above handles this for you. To deploy manually instead:

```bash
# 1. Create remote D1 database
wrangler d1 create flatline-db
# Update wrangler.toml with the database_id

# 2. Apply migrations to remote
npm run db:remote

# 3. Deploy (this also registers the cron trigger that sweeps for overdue checks)
wrangler deploy
```

## Tech Stack

- [Cloudflare Workers](https://workers.cloudflare.com/) — edge compute + Cron Triggers
- [Hono](https://hono.dev/) — HTTP framework
- [Cloudflare D1](https://developers.cloudflare.com/d1/) — SQLite for checks, events, and webhook delivery logs

## License

MIT

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-08-29

### Fixed
- `wrangler.toml`'s `env.staging` and `env.production` declared zero
  bindings — wrangler does not inherit top-level `d1_databases` into
  named environments, so `wrangler deploy --env staging` (or
  `--env production`) would have shipped a Worker with `env.DB`
  undefined, crashing every DB-touching route. Confirmed via
  `wrangler deploy --dry-run`, which now shows the binding present.
  Neither named environment was in the documented deploy path, so this
  had not yet affected the default `npm run deploy` flow fixed in
  0.1.1.

[0.1.2]: https://github.com/nagpalarpit/flatline/releases/tag/v0.1.2

## [0.1.1] - 2026-08-28

### Fixed
- `deploy` never applied D1 migrations, and `db:remote` was missing the
  `--remote` flag so it silently migrated the local sqlite state instead
  of the real database. Both the one-click deploy button and a manual
  `wrangler deploy` shipped a Worker bound to an empty remote database,
  so every DB-touching route (`/register`, `/checks`) 500'd on first use.
  `deploy` now applies migrations to `--remote` after provisioning.

[0.1.1]: https://github.com/nagpalarpit/flatline/releases/tag/v0.1.1

## [0.1.0] - 2026-08-28

Initial public release.

### Added
- `POST /checks` to register a check, ping it after every cron run, get alerted on silence
- Configurable grace period per check, webhook + email alerting
- One-click deploy button and documented D1 bindings for self-hosters
- CI on every push, MIT licensed

### Fixed
- Double-webhook race on concurrent recovery pings
- Lost-update race on concurrent `PATCH /checks/:id`
- Ping-interval-floor race on concurrent already-up pings

[0.1.0]: https://github.com/nagpalarpit/flatline/releases/tag/v0.1.0

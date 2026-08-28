# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-08-17

### Added

- **Channel-aware card**: the sidebar card now follows the current session's
  model provider (`session.models`). `deepseek-official` renders the balance /
  spend card; any other provider (e.g. OpenCode Go, DashScope) renders a
  minimal "channel not supported" placeholder showing the channel name; no
  current session renders nothing.
- Provider tracking combines three signals: `sessions.list` subscription
  (instant on session switch), a 1s light poll of the local `session.models`
  RPC (in-session model switches), and the `llm/adapters-updated` remote
  event (channel-catalog changes).
- Channel registry skeleton (`CHANNELS` map in `lib/client.js`) so future
  channels are one-line additions.

### Changed

- The host half (`lib/index.js`) is untouched by the channel logic: on
  non-official channels the client never calls `/balance`, so no balance or
  usage-API requests are made.

## [0.1.2] — 2026-08-14 (upstream)

- Spend ledger survives refills; refill re-fills the ratio bar.
- Collapse-rail balance format never overstates.

## [0.1.0] — 2026-08-14 (upstream)

- Initial release: DeepSeek account balance, remaining-ratio bar, and today's
  spend in the dsh sidebar footer.

[0.2.0]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.1.2...0.2.0
[0.1.2]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.1.0...0.1.2
[0.1.0]: https://github.com/alanzhao0128/dsh-balance-monitor/releases/tag/0.1.0

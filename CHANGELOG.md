# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] — 2026-08-28

### Added

- **Channel credentials group** in the settings panel: shows every credential
  each channel needs and its status, split by ownership:
  - Read-only rows (referenced by the DSH model configuration, decided via
    `ctx.llm.listConfigurableProviders()` + `ctx.settings.describe()`):
    `DEEPSEEK_API_KEY`, `COMMANDCODE_API_KEY`.
  - Writable password boxes (plugin-specific): `DEEPSEEK_PLATFORM_TOKEN`
    (existing, moved into the group, with the three-part explainer),
    `ARK_ACCESS_KEY_ID`, `ARK_SECRET_ACCESS_KEY` — saved through the official
    `credentials.set` seam, never written by the plugin.
- New host RPC `/credential-status` (loopback): per-ref configured/writable/
  source + `managedByDsh` flag, plus the resolved Ark region.

### Changed

- **Sidebar card follows the current session's provider again** (reverts the
  0.5.1 fixed multi-card model): one card for the active channel (DeepSeek /
  Volcano Ark / Command Code), unsupported placeholder otherwise, nothing
  without a session. The `channels.enabled` setting and its checkboxes are
  removed entirely.
- **Ark region follows the DSH model configuration**: `fetchArkQuota` now
  resolves the region from the huoshan provider's `baseURL`
  (`ark.<region>.volces.com`), falling back to `cn-beijing`; no manual
  selection needed.
- `providerConfig()` resolves a configurable provider's config via its
  declared `settingsPath`, covering both the top-level shape
  (`dsh-llm-deepseek`, `settingsPath: []`) and the nested shape
  (`dsh-llm-pi-ai`, `settingsPath: ["providers", "<id>"]`).

## [0.5.2] — 2026-08-28

### Fixed

- **Sidebar cards vanished** after upgrading to 0.5.1: schemastery fills an
  absent `channels.enabled` array with `[]` (not `undefined`), so the client's
  settings reader saw an empty list and rendered no cards. The schema now
  declares `.default(CHANNEL_DEFAULT)` and the client falls back to all
  channels on an empty list — the cards can never silently disappear.
- **Channel checkboxes were unclickable** in the settings panel: the
  channel-toggle handler called an undefined `onChange` (should have been
  `setField`), throwing on every click. Fixed.

## [0.5.1] — 2026-08-28

### Added

- **Channel display configuration** (`channels.enabled`): the settings panel
  gained a 渠道 group with one checkbox per provider (DeepSeek official /
  Volcano Ark / Command Code). Checked channels now render **fixed cards** in
  the sidebar — all at once, stacked, independent of the current session —
  instead of following the session's provider. An empty list falls back to
  all channels so the widget can never silently disappear.

### Changed

- **Seconds instead of milliseconds** in the settings panel: `ui.pollMs`,
  `network.cacheMs`, `network.timeoutMs`, `network.platformTimeoutMs` are
  edited as seconds (e.g. 60, 40, 20, 15) and converted to ms on save — the
  document still stores ms, so existing values stay valid. Removed
  `ui.providerPollMs` (provider detection is gone with the fixed-card model).
- The `DEEPSEEK_PLATFORM_TOKEN` box now carries a three-part explainer:
  what it is (web-session token — the API key only queries balance, spend
  needs this), how to get it (platform.deepseek.com → DevTools Console →
  `JSON.parse(localStorage.getItem('userToken')).value`), and what it does
  (real official usage instead of a balance-delta estimate).

## [0.5.0] — 2026-08-27

### Added

- **Settings page** (Settings → 余额监控 / Balance Monitor): a `settings.section`
  slot editing the `dsh-balance-monitor` namespace, persisted to
  `~/.dsh/settings.yaml` via the official settings service — no more editing
  `cordis.patch.yml` to tune the card.
  - Display: `ui.showCard` (hide the sidebar card and stop provider
    detection), `ui.warnThreshold` / `ui.dangerThreshold` (bar colour cutoffs).
  - Refresh: `ui.pollMs` (card poll interval, default 60000),
    `ui.providerPollMs` (provider detection, default 1000).
  - Network: `network.cacheMs` (host quota cache, default 40000),
    `network.timeoutMs` (Ark / Command Code upstream timeout, default 20000),
    `network.platformTimeoutMs` (DeepSeek platform usage timeout, default 15000).
  - Credentials: `credentials.file` (document filename relative to DSH home,
    default `.credentials.yaml`).
- **Platform token box** in the credentials group: a password field that
  writes `DEEPSEEK_PLATFORM_TOKEN` through the official
  `ctx.credentials` seam (`credentials.set`) — lands in
  `~/.dsh/.credentials.yaml` under `refs:` with lock + atomic write, no file
  editing. Shows configured / not-configured state and writability.
- **Token-expired banner** on the DeepSeek card: when the platform usage API
  answers 40002/40003 the host marks `platformTokenExpired` and the card shows
  a red hint pointing at the settings page, instead of silently falling back
  to the balance estimate.

### Changed

- Credentials are now read through the official `ctx.credentials` seam
  (process env → managed document → `.env` fallbacks) instead of hand-rolled
  regex parsing of `.credentials.yaml` — future credential-format changes are
  absorbed by the seam, not the plugin.
- All previous module constants (cache/timeout/poll) became settings-managed
  defaults; behaviour is unchanged until a user edits the panel.

## [0.4.1] — 2026-08-27

### Fixed

- Command Code monthly window reset time showed `—`: `currentPeriodEnd` is an
  ISO string, but the parser used `Number(isoString)` (NaN) instead of
  `new Date(isoString).getTime()`. Fixed to parse ISO strings (numeric
  epoch-ms still works).

## [0.4.0] — 2026-08-27

### Added

- **Command Code channel**: when the session's provider is `commandcode`, the
  sidebar card shows 5h / weekly / monthly used % with reset countdowns and the
  plan name (GOAT / Pro / Max).
- New host RPC `/cmdcode-quota`: Bearer-auths `api.commandcode.ai/alpha/billing/credits`,
  `/alpha/usage/summary`, and `/alpha/billing/subscriptions`, normalising the
  three windows into the same shape as the Ark card; cached for 40s.
  - Monthly is derived as `totalMonthlyCredits / (totalMonthlyCredits +
    monthlyCredits)` because Command Code's API exposes the monthly quota as a
    *remaining* balance, not a used/cap window.
- Credential `COMMANDCODE_API_KEY` read from `.credentials.yaml` (indented-safe).

## [0.3.5] — 2026-08-21

### Fixed

- Credentials no longer resolve after DSH upgraded to 0.1.1-rc.1, which
  migrated `$DSH_HOME/.credentials.yaml` to an indented `refs:` structure
  (`  KEY: value`). The host half's regexes anchored the key at line start
  (`^KEY:`), so every credential read failed and both `/balance` and
  `/ark-quota` returned "not found". Anchors relaxed to `^\s*KEY:` — both the
  legacy flat format and the new indented format are parsed.

## [0.3.4] — 2026-08-18

### Changed

- Volcano Ark quota numbers now show **used %** on the wide card and the
  collapsed rail, matching the progress-bar fill and color (previously the
  label showed remaining % while the bar filled by used %).

## [0.3.3] — 2026-08-18

### Fixed

- Collapsed rail on the Volcano Ark card now shows the **5h** window's
  remaining percent (previously the most-used window, which could be weekly or
  monthly). Falls back to the most-used window only if 5h is absent.

## [0.3.2] — 2026-08-18

### Changed

- Ark card: progress bars widened (56px → 84px); reset countdown now
  right-aligned within each row and zero-padded to `04h 52m` / `00h 05m`
  (day prefix kept when > 0: `5d 09h 50m`).
- Ark quota refresh timing fixed: host cache reduced from 60s to 40s so it is
  strictly below the browser's 60s poll — a 60s cache + 60s poll could skip a
  refresh at the cache boundary and leave data ~2 minutes stale.

## [0.3.1] — 2026-08-18

### Changed

- Ark quota refresh now matches the DeepSeek cadence: host cache reduced from
  5 minutes to 60s.
- Ark card: removed the "N 个窗口" header counter; shortened the progress bars
  to a fixed width; added a reset countdown after the percentage
  (`2d 3h 15m`, days/hours omitted when zero, `已重置` after expiry).

## [0.3.0] — 2026-08-17

### Added

- **Volcano Ark Agent Plan channel**: `huoshan` provider renders quota bars for
  the 5h / weekly / monthly windows, colored by usage (green → amber → red).
- New host RPC `/ark-quota`: signs the `GetAFPUsage` control-plane OpenAPI with
  AK/SK (Volcengine SigV4 variant) and caches the response for 5 minutes.
- New `lib/signature.js`: pure, unit-testable Volcengine SigV4 signing
  (port of the algorithm from dsh-ark-quota, MIT).
- Credentials `ARK_ACCESS_KEY_ID` / `ARK_SECRET_ACCESS_KEY` read from
  `$DSH_HOME/.credentials.yaml` (env overrides).

### Changed

- `CHANNELS` registry entries are now objects `{ type }`: `balance` and
  `ark-plan` card variants; the ChannelCard shell dispatches on `type`.
- Docs: README (zh + en) cover the Ark channel, credentials, and layout.

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

[0.6.0]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.5.2...0.6.0
[0.5.2]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.5.1...0.5.2
[0.5.1]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.5.0...0.5.1
[0.5.0]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.4.1...0.5.0
[0.4.1]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.4.0...0.4.1
[0.4.0]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.3.5...0.4.0
[0.3.5]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.3.4...0.3.5
[0.3.4]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.3.3...0.3.4
[0.3.2]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.3.1...0.3.2
[0.3.1]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.3.0...0.3.1
[0.3.0]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.1.2...0.2.0
[0.1.2]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.1.0...0.1.2
[0.1.0]: https://github.com/alanzhao0128/dsh-balance-monitor/releases/tag/0.1.0

English | [简体中文](README.md)

# dsh-balance-monitor

DeepSeek balance and spend windows, right in the dsh sidebar footer.

A minimal [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) plugin that shows your DeepSeek API account balance plus **today / 7-day / 30-day** spend windows, pinned above Settings in the sidebar footer, styled with the stock design tokens. With a platform token all windows are **official** (same data as the platform.deepseek.com usage page); without one, today falls back to a balance-delta estimate.

<p align="center">
  <img src="docs/preview/balance-wide.png" alt="dsh-balance-monitor in the sidebar footer" width="280">
  <img src="docs/preview/balance-rail.png" alt="dsh-balance-monitor collapsed to the rail" width="56">
</p>

> The previews show the early layout; the current card is a "Balance" line plus a three-cell today / 7d / 30d spend-window row (the ratio bar is gone).

## Features

| What | How |
|---|---|
| Live balance | Queries `GET https://api.deepseek.com/user/balance` through the host half, using the `DEEPSEEK_API_KEY` from `$DSH_HOME/.credentials.yaml` (env var wins) |
| Today / 7d / 30d spend (official) | With `DEEPSEEK_PLATFORM_TOKEN` set, the host queries the official usage API `platform.deepseek.com/api/v0/usage/cost` (the same data the platform console shows) and sums per-day windows: 7d = today minus 6 days, 30d = today minus 29 days (both inclusive). Accurate no matter where else the API key is used |
| Balance-delta fallback | Without the platform token (or when the official API fails), today falls back to a balance-drop ledger (only accumulating drops; refills never inflate or wash out spend); 7d/30d show `—` |
| Channel awareness | The card follows the current session's model provider: the DeepSeek official channel shows balance/spend; other channels (e.g. OpenCode Go, DashScope) show a "channel not supported" placeholder; no session renders nothing |
| Placement | Registered on the official `sidebar.footer.action` slot — above Settings, no patch hacks |
| Collapsed rail | Shrinks to a 36px circle with a compact balance and a tooltip |
| Resilience | 60s polling + re-poll on tab visibility; on upstream failure the last known numbers stay visible (dimmed as stale) instead of an error flash |

## Install

Works from source directly — the browser bundle is a hand-written classic script with **no build step**, so a git install needs no prepare script:

```sh
dsh plugin --profile web add "github:alanzhao0128/dsh-balance-monitor#main"
```

or from npm (once published):

```sh
dsh plugin --profile web add dsh-balance-monitor
```

Then restart the Web UI (`dsh --profile web`). The widget appears at the bottom of the expanded sidebar, above Settings.

## Configuration

Both credentials live in `$DSH_HOME/.credentials.yaml` (write them from the Web UI Models page, or edit the file directly):

| Credential | Required | Purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | Balance lookup `api.deepseek.com/user/balance` |
| `DEEPSEEK_PLATFORM_TOKEN` | optional | Official usage (today/7d/30d). Get it: sign in at [platform.deepseek.com](https://platform.deepseek.com) → DevTools Console, run `JSON.parse(localStorage.getItem('userToken')).value`, store the output as the credential |

> ⚠️ `DEEPSEEK_PLATFORM_TOKEN` is a web-session token and **expires** (the official API returns code 40002/40003 when stale). On expiry the plugin silently falls back to the balance-delta estimate; refresh the token from the console and update the credential. Balance lookup is unaffected.

## How it works

One combined plugin row (`dsh.bundle` patch + `dsh.client` roster declaration):

- **Host half** (`lib/index.js`) — registers one RPC channel `/balance` (loopback trust fence) on `ctx.connection`. Each call reads the API key and queries the balance API; with a platform token it fetches the current month (plus the previous month when a window crosses the boundary) from the official usage API and aggregates today/7d/30d; without it, a balance-drop ledger backs today's spend. Answers `{ ok, value }`.
- **Browser half** (`lib/client.js`) — a zero-dependency classic-script bundle registering a `sidebar.footer.action` entry. It tracks the current session's provider via `sessions.list` subscription plus a light 5s poll of `session.models` (a local RPC), then dispatches through the channel registry: `deepseek-official` renders the balance card (60s polling, re-poll on tab visibility); unregistered channels render the unsupported placeholder; no session renders nothing. The `llm/adapters-updated` remote event triggers an immediate re-check.

State file (`$DSH_HOME/storages/balance-monitor.json`):

```json
{
  "date": "2026-08-17",
  "dayStart": 100.0,
  "lastTotal": 97.7,
  "lastCurrency": "CNY",
  "spent": 1.65,
  "spent7d": 5.24,
  "spent30d": 18.54,
  "spentSource": "official",
  "updatedAt": 1755400000000
}
```

`spentSource` is `official` (platform API) or `estimate` (balance-delta ledger).

## Security notes

- The API key and platform token never leave the host: the browser half only ever sees balance/spend numbers over the RPC channel, never the credentials.
- The channel is served under the `loopback` trust authority.
- No telemetry, no network beyond the official balance and usage endpoints.

## Layout

```
dsh-balance-monitor/
├── package.json        # dsh.bundle (patch) + dsh.client (browser roster)
├── cordis.patch.yml    # inserts the one combined plugin row
└── lib/
    ├── index.js        # host half: /balance RPC channel (balance + official windows + fallback ledger)
    └── client.js       # browser half: sidebar footer card (hand-written, no build)
```

## Development

No toolchain required. Edit `lib/*.js` directly; the bundle format mirrors what the official `tsdown` preset emits (`window.__ModuleLoader__.load({ id, factory })`).

## License

MIT

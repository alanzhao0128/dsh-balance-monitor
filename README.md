# dsh-balance-monitor

DeepSeek account balance, right in the dsh sidebar footer.

A minimal [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) plugin that shows your DeepSeek API account balance, a thin remaining-ratio bar, and how much the current day has cost — pinned above Settings in the sidebar footer, styled with the stock design tokens.

<p align="center">
  <img src="docs/preview/balance-wide.png" alt="dsh-balance-monitor in the sidebar footer" width="280">
  <img src="docs/preview/balance-rail.png" alt="dsh-balance-monitor collapsed to the rail" width="56">
</p>

## Features

| What | How |
|---|---|
| Live balance | Queries `GET https://api.deepseek.com/user/balance` through the host half, using the `DEEPSEEK_API_KEY` from `$DSH_HOME/.credentials.yaml` (env var wins) |
| Today's spend | The first successful query of a calendar day becomes that day's baseline (persisted in `$DSH_HOME/storages/balance-monitor.json`); spend = `max(0, baseline − current)`. Refills clamp to 0 instead of going negative |
| Ratio bar | Current balance ÷ day-start baseline, blue → amber → red as it drops |
| Placement | Registered on the official `sidebar.footer.action` slot — above Settings, no patch hacks |
| Collapsed rail | Shrinks to a 36px circle with a compact amount and a tooltip |
| Resilience | 60s polling + re-poll on tab visibility; on upstream failure the last known numbers stay visible (dimmed as stale) instead of an error flash |

## Install

Works from source directly — the browser bundle is a hand-written classic script with **no build step**, so a git install needs no prepare script:

```sh
dsh plugin --profile web add "github:<you>/dsh-balance-monitor#main"
```

or from npm (once published):

```sh
dsh plugin --profile web add dsh-balance-monitor
```

Then restart the Web UI (`dsh --profile web`). The widget appears at the bottom of the expanded sidebar, above Settings.

## How it works

One combined plugin row (`dsh.bundle` patch + `dsh.client` roster declaration):

- **Host half** (`lib/index.js`) — registers one RPC channel `/balance` (loopback trust fence) on `ctx.connection`. Each call reads the API key, queries the balance API, folds the result into the day-start baseline, and answers `{ ok, value }`.
- **Browser half** (`lib/client.js`) — a zero-dependency classic-script bundle registering a `sidebar.footer.action` entry. The card polls every 60s and re-polls when the tab becomes visible.

State file (`$DSH_HOME/storages/balance-monitor.json`):

```json
{
  "date": "2026-08-14",
  "dayStart": 100.0,
  "lastTotal": 99.5,
  "lastCurrency": "CNY",
  "updatedAt": 1755200000000
}
```

## Security notes

- The API key never leaves the host: the browser half only ever sees balance numbers over the RPC channel, never the key.
- The channel is served under the `loopback` trust authority.
- No telemetry, no network beyond the official balance endpoint.

## Layout

```
dsh-balance-monitor/
├── package.json        # dsh.bundle (patch) + dsh.client (browser roster)
├── cordis.patch.yml    # inserts the one combined plugin row
└── lib/
    ├── index.js        # host half: /balance RPC channel
    └── client.js       # browser half: sidebar footer card (hand-written, no build)
```

## Development

No toolchain required. Edit `lib/*.js` directly; the bundle format mirrors what the official `tsdown` preset emits (`window.__ModuleLoader__.load({ id, factory })`).

## License

MIT

English | [简体中文](README.md)

# dsh-balance-monitor

DeepSeek balance and spend windows, right in the dsh sidebar footer.

A minimal [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) plugin that shows the current session's channel balance/usage in the sidebar footer, styled with the stock design tokens. The **DeepSeek official channel** shows balance plus today / 7-day / 30-day spend windows (official usage data when a platform token is set); the **Volcano Ark channel** shows Agent Plan quota bars (5h / weekly / monthly); the **Command Code channel** shows 5h / weekly / monthly usage windows (GOAT / Pro / Max plans); the **Google AI Pro channel** (Antigravity reversed through CLIProxyAPI) shows 5h / weekly remaining quota for the Gemini and Claude/GPT model groups.

<p align="center">
  <img src="docs/preview/balance-wide.png" alt="dsh-balance-monitor in the sidebar footer" width="280">
  <img src="docs/preview/balance-rail.png" alt="dsh-balance-monitor collapsed to the rail" width="56">
</p>

## Features

| What | How |
|---|---|
| Live balance | Queries `GET https://api.deepseek.com/user/balance` through the host half, using the `DEEPSEEK_API_KEY` from `$DSH_HOME/.credentials.yaml` (env var wins) |
| Today / 7d / 30d spend (official) | With `DEEPSEEK_PLATFORM_TOKEN` set, the host queries the official usage API `platform.deepseek.com/api/v0/usage/cost` (the same data the platform console shows) and sums per-day windows: 7d = today minus 6 days, 30d = today minus 29 days (both inclusive). Accurate no matter where else the API key is used |
| Balance-delta fallback | Without the platform token (or when the official API fails), today falls back to a balance-drop ledger (only accumulating drops; refills never inflate or wash out spend); 7d/30d show `—` |
| Channel awareness | The card follows the current session's model provider: the DeepSeek official channel shows balance/spend; the Volcano Ark channel shows Agent Plan bars; the Command Code channel shows usage windows; the Google AI Pro channel (`cliproxy`) shows 5h / weekly remaining quota; other channels show a "channel not supported" placeholder; no session renders nothing |
| Volcano Ark Agent Plan | With AK/SK configured, calls the `GetAFPUsage` control-plane API (SigV4 signed) and shows 5h / weekly / monthly quota bars, colored by usage (green → amber → red) |
| Command Code usage | With `COMMANDCODE_API_KEY` configured, calls `api.commandcode.ai/alpha/billing/credits` etc. and shows 5h / weekly / monthly used % with reset countdowns |
| Google AI Pro quota | With the CPA management URL, Basic auth, and management key configured, reads the quota snapshot probed by the `antigravity-priority` plugin on your CPA and shows 5h / weekly remaining percentages plus reset countdowns for the Gemini and Claude+GPT model groups (an empty snapshot right after a CPA restart triggers one probe automatically). **The server side is yours to build — see [the setup guide](#setting-up-the-google-ai-pro-cliproxyapi-channel)** |
| Placement | Registered on the official `sidebar.footer.action` slot — above Settings, no patch hacks |
| Collapsed rail | Shrinks to a 36px circle with a compact balance and a tooltip |
| Resilience | 60s polling + re-poll on tab visibility; on upstream failure the last known numbers stay visible (dimmed as stale) instead of an error flash |

## Install

Works from source directly — the browser bundle is a hand-written classic script with **no build step**, so a git install needs no prepare script:

```sh
dsh plugin --profile web add "github:alanzhao0128/dsh-balance-monitor#main"
```

or from npm:

```sh
dsh plugin --profile web add @alanzhao/dsh-balance-monitor
```

Then restart the Web UI (`dsh --profile web`). The widget appears at the bottom of the expanded sidebar, above Settings.

> **Version requirement**: `0.7.2+` needs dsh `>= 0.1.5-rc.1` (dsh 0.1.5 removed the usable `connection.rpc.handle` path; the plugin's RPC moved to exact Fetch routes on the shared `/api` channel). On a dsh `0.1.2-rc.1` host, pin `0.7.1`. The Google AI Pro channel arrived in `0.7.3`.

## Configuration

### Settings panel (recommended)

Open dsh settings (gear) → **Balance Monitor** to edit the card's behaviour; saving writes the `dsh-balance-monitor:` section of `~/.dsh/settings.yaml` and applies immediately (a few fields after restart):

| Group | Field | Default | Purpose |
|---|---|---|---|
| Display | `ui.showCard` | `true` | Turning this off hides all channel cards |
| Display | `ui.warnThreshold` | `30` | Bar turns amber at this used % |
| Display | `ui.dangerThreshold` | `70` | Bar turns red at this used % |
| Refresh | `ui.pollMs` | `60` s | Card refresh interval (the panel shows seconds; stored internally as ms) |
| Network | `network.cacheMs` | `40` s | Host quota cache; keep below the card refresh interval |
| Network | `network.timeoutMs` | `20` s | Upstream timeout (Volcano Ark / Command Code / DeepSeek official usage / CPA management API) |
| Network | `network.cpaBaseUrl` | empty | **Your own** CLIProxyAPI management address (quota source for the Google AI Pro channel); when empty that channel reads "CPA base URL not configured" — see [the setup guide](#setting-up-the-google-ai-pro-cliproxyapi-channel) |
| Network | `network.cpaStaleMs` | `1200` s | A CPA snapshot older than this counts as stale and the plugin requests a probe automatically (keep it above the CPA-side schedule) |
| Credentials | `credentials.file` | `.credentials.yaml` | Credentials document filename (relative to `$DSH_HOME`) |

### Channel credentials

The settings panel's **「渠道凭证 / Channel credentials」 group** shows which credentials each channel needs for its balance/usage display, and whether they are read-only (already referenced by the DSH model configuration) or writable:

| Channel | Credential | Interaction |
|---|---|---|
| DeepSeek official | `DEEPSEEK_API_KEY` | read-only (referenced by DSH model config), shows ✅/⚠️ status |
| DeepSeek official | `DEEPSEEK_PLATFORM_TOKEN` | **writable** password box (needed for official spend; expires), with a three-part explainer: what it is / how to get it (platform.deepseek.com → F12 → Console → `JSON.parse(localStorage.getItem('userToken')).value`) / what it does |
| Volcano Ark | `ARK_ACCESS_KEY_ID` | **writable** password box (plugin-specific; dsh models use `HUOSHAN_API_KEY` — a different pair) |
| Volcano Ark | `ARK_SECRET_ACCESS_KEY` | **writable** password box |
| Volcano Ark | region | read-only, auto-follows the DSH model config (parsed from the huoshan provider's `baseURL`, e.g. `cn-beijing`) |
| Command Code | `COMMANDCODE_API_KEY` | read-only (referenced by DSH model config), shows ✅/⚠️ status |
| Google AI Pro | `CPA_BASIC_AUTH` | **writable** password field, `user:pass` — the Basic auth of the nginx in front of CPA (second lock) |
| Google AI Pro | `CPA_MANAGEMENT_KEY` | **writable** password field — the CPA management key (third lock); sent as `X-CPA-Key` and rewritten by nginx into the upstream `Authorization: Bearer` |

Writable boxes save through the official `ctx.credentials.set()` into `$DSH_HOME/.credentials.yaml` (`refs:` section, locked + atomic write); the plugin never writes the file itself.

### Credentials

Credentials live in `$DSH_HOME/.credentials.yaml` (write them from the Web UI Models page, or edit the file directly; the plugin reads them through the official `ctx.credentials` service, env vars win):

| Credential | Required | Purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | Balance lookup `api.deepseek.com/user/balance` |
| `DEEPSEEK_PLATFORM_TOKEN` | optional | Official usage (today/7d/30d). Get it: sign in at [platform.deepseek.com](https://platform.deepseek.com) → DevTools Console, run `JSON.parse(localStorage.getItem('userToken')).value`, store the output as the credential |

> ⚠️ `DEEPSEEK_PLATFORM_TOKEN` is a web-session token and **expires** (the official API returns code 40002/40003 when stale). On expiry the card shows a red hint and falls back to the balance-delta estimate; paste a fresh token in the settings panel credentials group to restore official usage. Balance lookup is unaffected.

| Credential | Required | Purpose |
|---|---|---|
| `ARK_ACCESS_KEY_ID` | Volcano Ark channel | Volcengine access key for the control-plane API (Agent Plan quota) |
| `ARK_SECRET_ACCESS_KEY` | Volcano Ark channel | Volcengine secret access key |
| `COMMANDCODE_API_KEY` | Command Code channel | Command Code API key (`user_...`) for the 5h / weekly / monthly usage query |
| `CPA_BASIC_AUTH` | Google AI Pro channel | Basic auth of the nginx in front of CPA, formatted `user:pass` |
| `CPA_MANAGEMENT_KEY` | Google AI Pro channel | CPA management key, used to read the quota snapshot probed by the `antigravity-priority` plugin |

> Get Ark AK/SK: sign in at [console.volcengine.com](https://console.volcengine.com) → Access Control → API Access Keys → create a key. Note: AK/SK are IAM account-level credentials that can operate all resources — keep them private.

## Setting up the Google AI Pro (CLIProxyAPI) channel

This channel has **no ready-made public endpoint**: Google exposes no queryable quota API, and [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (CPA) does not expose quota by itself either — a **quota-provider plugin** running on CPA has to probe Antigravity's 5-hour / weekly windows, and this plugin reads that probe's snapshot. So seeing this card means wiring up the chain below yourself:

```
dsh plugin ──HTTPS:443──▶ nginx (TLS + Basic auth + rate limit)
                           └──▶ CPA 127.0.0.1:8317 (management key)
                                  └──▶ antigravity-priority plugin (probes Antigravity quota)
                                         └──▶ Antigravity upstream
```

`network.cpaBaseUrl` defaults to **empty** (this project ships nobody's address), and the card then reads "CPA base URL not configured". Fill in your address and the two credentials to light it up.

### 1. CPA side

CPA `config.yaml` (v7.3+):

```yaml
# Management API: secret-key must be non-empty, otherwise /v0/management/* is unavailable
remote-management:
  secret-key: "<strong random key — this becomes CPA_MANAGEMENT_KEY>"

# Allow non-localhost callers on the management API (nginx forwards into it)
allow-remote: true

# Quota probe plugin
plugins:
  enabled: true
  dir: "plugins"
  configs:
    antigravity-priority:
      enabled: true
      state_cache_path: "/root/.cli-proxy-api/antigravity-priority-cache.json"

# IMPORTANT: declare the proxy's source subnet so CPA sees real client IPs.
# Without it every proxied request shares one IP, and CPA bans a source IP for
# ~30 minutes after repeated failed management auth — locking out your own chain.
trusted-proxies:
  - "172.23.0.0/16"
```

Install the [`antigravity-priority`](https://github.com/ygq-future/antigravity-priority) quota plugin into `plugins/` (a Go c-shared `.so`; it reports `supports_quota: false` and exposes its own `plugins/antigravity-priority/snapshot/latest`, `run?mode=probe`, `samples` and `diagnostics` routes instead of the standard CPA quota API). **Dropping the plugin in without enabling it means an always-empty snapshot.**

> **⚠️ It also has to actually probe, or the card freezes.** `antigravity-priority`'s background scheduling is gated by its own runtime switch **`auto_apply`**, which **defaults to off** — while it is off the plugin only probes when explicitly asked, so the snapshot stays frozen on whatever the last probe produced (symptom: the card shows no error and does show numbers, but they never move for hours). Pick either:
>
> - **Turn on the plugin's own scheduler**: in CPA's management panel open **⚙️ Configuration Center** and enable **automatic scheduling (`auto_apply`)** (default interval 15 min). It probes periodically **and writes credential priorities back** — that is the plugin's whole point, so enable it if you want its dual-window pacing and 429 cooldown.
> - **Do nothing**: this plugin probes by itself once the snapshot is older than `network.cpaStaleMs` (20 min by default) — probe only, no priority write-back — so the card cannot sit on stale numbers forever. It renders those numbers semi-transparent to mark them as not fresh.
>
> To diagnose: `GET .../plugins/antigravity-priority/diagnostics` and check `management_api.auto_apply` plus `run_history` — a single, ancient `run_history` entry means nothing is probing.

Keep the container on loopback and publish only 443:

```yaml
# docker-compose.yml
ports:
  - "127.0.0.1:8317:8317"
volumes:
  - ./plugins:/CLIProxyAPI/plugins
```

### 2. nginx reverse proxy (two locks + path lockdown)

Pass `/v1/` (inference) through, put a Basic layer on `/v0/` (management), 404 everything else, and rate-limit to blunt brute force:

```nginx
limit_req_zone $binary_remote_addr zone=cpa_mgmt:10m rate=30r/m;

server {
  listen 443 ssl http2;          # nginx 1.24 and older: http2 belongs on the listen line
  server_name cpa.example.com;   # ← your own domain

  ssl_certificate     /etc/letsencrypt/live/cpa.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/cpa.example.com/privkey.pem;

  # Inference path: passthrough, authenticated by CPA's own API key
  location /v1/ {
    # Key detail: nginx defaults to 1m here while a 0.5M-token context is
    # already >=2MB of plain text, so large contexts fail with 413 before the
    # request ever reaches CPA
    client_max_body_size 128m;
    # Stream large bodies straight to the upstream instead of buffering to disk
    proxy_request_buffering off;

    proxy_pass http://127.0.0.1:8317;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  # Management path: Basic auth + rate limit + auth-header rewrite
  location /v0/ {
    limit_req zone=cpa_mgmt burst=5 nodelay;
    auth_basic "CPA";
    auth_basic_user_file /etc/nginx/.htpasswd-cpa;

    proxy_pass http://127.0.0.1:8317;
    # Key detail: Basic occupies the Authorization header, but CPA only accepts
    # Authorization: Bearer. The client therefore sends the management key as
    # X-CPA-Key and nginx rewrites it into Bearer for the upstream.
    proxy_set_header Authorization "Bearer $http_x_cpa_key";
  }

  location / { return 404; }
}
```

> `/v0/` only serves this plugin, so keep its blast radius small — add an IP allowlist or keep it on a private network / WireGuard if you can.

### 3. Plugin side

| Where | What |
|---|---|
| Settings → Network → **CPA base URL** | `https://cpa.example.com` (your nginx entry point — do **not** append `/v0`) |
| Settings → Channel credentials → **Basic auth** | `CPA_BASIC_AUTH`, formatted `user:pass` (matching nginx `.htpasswd-cpa`) |
| Settings → Channel credentials → **Management key** | `CPA_MANAGEMENT_KEY`, i.e. CPA's `remote-management.secret-key` |

### 4. Self-check

```bash
# (1) no Basic → 401 (nginx rejects)
curl -s -o /dev/null -w '%{http_code}\n' https://cpa.example.com/v0/management/quota/providers

# (2) Basic but no management key → 401 (CPA rejects)
curl -s -o /dev/null -w '%{http_code}\n' -u user:pass https://cpa.example.com/v0/management/quota/providers

# (3) both → 200
curl -s -u user:pass -H 'X-CPA-Key: <management key>' \
  https://cpa.example.com/v0/management/plugins/antigravity-priority/snapshot/latest
```

### 5. Pitfalls

- **Quota endpoint returns 501 / snapshot is empty**: no quota-provider plugin installed or enabled on CPA. When the snapshot is empty (e.g. right after a CPA restart) this plugin automatically POSTs `.../run?mode=probe` once and re-reads; still empty means the probe itself failed.
- **Numbers show up but never move for hours**: nothing on the CPA side is probing — i.e. `auto_apply` is off, as described above. This plugin self-heals a stale snapshot (default: older than 20 min), but for continuously fresh data enable the plugin-side scheduler.
- **Basic and Bearer fight over the same `Authorization` header**: send the management key as `X-CPA-Key` and let nginx rewrite it into the upstream Bearer, as above; passing both `Authorization` flavours just overwrites one with the other.
- **Repeated auth failures ban the source IP**: CPA bans a source IP for ~30 minutes after too many failed management attempts. Behind a proxy every request looks like one IP, so triggering it takes down the whole chain — configure `trusted-proxies`, and `docker restart <container>` to clear a ban.
- **`413 Request Entity Too Large` (the response body is nginx's HTML error page)**: you hit nginx's built-in `client_max_body_size` default of **1m**. It has nothing to do with the model's token limit — the request is rejected at the proxy and never reaches CPA or the model. A 0.5M-token context is already >=2MB of plain text, so any large context triggers it; add `client_max_body_size 128m;` to `location /v1/` as shown above. Note the directive is **not** inherited from a sibling location like `/v0/` — it must be set in `/v1/` itself (or in an enclosing `server`/`http` block).
- **Large contexts upload slowly**: `proxy_request_buffering off` removes nginx's disk buffering, but the body still has to be transferred in full, so the bottleneck becomes the **client's upstream bandwidth** (measured: 3MB ≈ 15s). No config setting fixes that part.
- **`http2 on;` is unsupported on nginx 1.24**: older versions need `listen 443 ssl http2;`; the new syntax aborts nginx with `unknown directive "http2"`.
- **TLS is mandatory**: Basic auth is plaintext; serving it over bare HTTP broadcasts the password.
- **Inference and management use different keys**: the `/v1/` API key (`CLIPROXYAPI_KEY` in your dsh models) and the `/v0/` management key are unrelated.

> This project ships none of the server-side pieces above and carries no default address — you deploy CPA + the quota plugin + a reverse proxy, then fill the address into `network.cpaBaseUrl`.

## How it works

One combined plugin row (`dsh.bundle` patch + `dsh.client` roster declaration):

- **Host half** (`lib/index.js`) — registers six RPC endpoints as exact Fetch routes on the shared `/api` channel via `connection.fetch.register` (inheriting the official trust fence and browser authentication): `balance/snapshot` (DeepSeek balance + official usage windows + fallback ledger), `ark-quota/snapshot` (Volcano Ark Agent Plan quota, signed with AK/SK SigV4 against `GetAFPUsage`, cached for 40s — strictly below the browser's 60s poll so every poll triggers a fresh upstream fetch), `cmdcode-quota/snapshot` (Command Code usage, Bearer `api.commandcode.ai/alpha/billing/credits` etc., cached for 40s), `cpa-quota/snapshot` (Google AI Pro quota, read from the `antigravity-priority` snapshot on CPA's management API), `credential-status/snapshot` (credential status + region), and `session-provider/snapshot` (resolves the channel provider for a given session). Cache and timeout durations come from the settings panel (`network.*`); credentials are read through the official `ctx.credentials` service.
- **Browser half** (`lib/client.js`) — a zero-dependency classic-script bundle registering a `sidebar.footer.action` entry. It tracks the current session's provider via `sessions.list` subscription plus a light 1s poll of the `/session-provider` RPC (passing the active `sessionId`; the host resolves the channel from that session's `modelSelection` projection, so the card follows cross-session switches too since 0.7.1), then dispatches through the channel registry: `deepseek-official` renders the balance card (60s polling, re-poll on tab visibility); `huoshan` renders the Ark quota bars; `commandcode` renders the usage windows; unregistered channels render the unsupported placeholder; no session renders nothing. The `llm/adapters-updated` remote event triggers an immediate re-check. It also registers a `settings.section` page (Balance Monitor) reading/writing the `dsh-balance-monitor` namespace; the `credential-status` endpoint (credential status + region) decides which refs are read-only via `ctx.llm`/`ctx.settings`.

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

- The API key, platform token, and Ark AK/SK never leave the host: the browser half only ever sees balance/spend/quota numbers over the RPC channel, never the credentials.
- The channel is served under the `loopback` trust authority.
- No telemetry, no network beyond the official balance, usage, and Ark quota endpoints.

## Layout

```
dsh-balance-monitor/
├── package.json        # dsh.bundle (patch) + dsh.client (browser roster)
├── cordis.patch.yml    # inserts the one combined plugin row
└── lib/
    ├── index.js        # host half: five /api RPC endpoints (balance / Ark / Command Code / credentials / session channel) + settings wiring
    ├── config.js       # settings schema + defaults (mirrored by the panel)
    ├── signature.js    # Volcengine OpenAPI SigV4 signing (AK/SK)
    └── client.js       # browser half: sidebar footer card + settings page (hand-written, no build)
```

## Development

No toolchain required. Edit `lib/*.js` directly; the bundle format mirrors what the official `tsdown` preset emits (`window.__ModuleLoader__.load({ id, factory })`).

## License

MIT

# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.6] — 2026-09-25

### Changed

- **`network.cpaBaseUrl` 默认值改为空**。此前它硬编码了本项目维护者自己的
  CLIProxyAPI 部署地址，这既把一个人的私有主机名发布给了所有使用者，也会让
  其他使用者的配额请求打到陌生人的服务器上。现在该字段默认留空，cliproxy 渠道
  在填写前保持休眠（host 端返回 `unconfigured`，不发任何网络请求）。
  **升级后需要手动填写**：升级前依赖旧默认值的安装请在设置面板 →「网络 → CPA 地址」
  填回自己的地址，否则卡片会提示「未配置 CPA 地址」。
- 设置面板的 CPA 地址提示改为占位示例 `https://cpa.example.com`；空值输入会自动
  去掉首尾空格与结尾 `/`（`https://host/` 也能用）。

### Added

- **卡片空状态**：CPA 地址未配置 / 凭证被拒时，卡片显示对应的说明文字
  （「未配置 CPA 地址」/「CPA 凭证未配置或被拒绝」）而不是一张空卡片；
  折叠态与 tooltip 同步显示原因。
- **README 新增「Google AI Pro（CLIProxyAPI）渠道搭建」完整指南**（中英双语）：
  这条链路无法复用现成接口（Google 侧没有配额 API，CPA 自身也不暴露配额，必须
  由配额插件探测），因此补上可复现的全流程 —— 链路图、CPA `config.yaml`
  （`allow-remote` / `remote-management.secret-key` / `plugins` / `trusted-proxies`）、
  容器只监听回环、nginx 反代示例（限流 + `/v1/` 直通 + `/v0/` Basic +
  `Authorization` 头改写 + 其余 404）、插件侧三个字段怎么填、三步 curl 自检，
  以及踩坑清单（501 与空快照、认证头冲突、**连续失败封源 IP 约 30 分钟**、
  nginx 1.24 的 `http2 on;` 不支持、必须 TLS、推理与管理是两套密钥）。
  文档中所有主机名均为 `cpa.example.com` 占位。

## [0.7.5] — 2026-09-25

### Changed

- **Google AI Pro 卡片的用量语义回归与火山方舟 / Command Code 一致**：数字改为
  **已用百分比**（`100 - 剩余`），进度条按已用比例填充、配色按已用分档
  （≥ danger 红、≥ warn 黄、否则绿），与两张同类的套餐额度卡完全同款。
  0.7.4 曾把该卡单独改成"剩余"语义，虽然卡内自洽，但与既有的两张卡读法不同，
  同一块侧边栏里出现两种口径反而更难扫读。
- 折叠态同样改为显示已用%（优先取当前活跃模型组的 5h 窗口，其次任意 5h，最后
  取用量最高的窗口），与方舟折叠态的选择逻辑一致。

## [0.7.4] — 2026-09-25

### Fixed

- **Google AI Pro 卡片：`Gemini 5h` 被截断成 `Gemini ...`**。组标签列宽
  52px 装不下 `Gemini` + 窗口名，现已加宽到 64px（进度条相应由 72px 收到
  62px，整行宽度不变）。

### Changed

- **Google AI Pro 卡片的进度条改为按「剩余额度」填充**，颜色也改为按剩余分档
  （剩余 ≤ 30% 红、≤ 70% 黄、否则绿）。此前数字显示的是剩余百分比，而进度条
  与配色沿用了 Ark / Command Code 的「已用」语义，导致「剩余 100%」渲染成一条
  空进度条，容易被误读成额度已用尽。现在数字、填充比例、颜色三者语义一致：
  满条 + 绿色 = 额度充足。

## [0.7.3] — 2026-09-25

### Added

- **Google AI Pro 渠道卡片（cliproxy / CPA 反代）**：会话使用 `cliproxy`
  provider（Google Antigravity 经 CLIProxyAPI 反代）时，侧边栏显示该渠道的
  5 小时 / 每周剩余配额，按 `gemini` 与 `claude_gpt` 两个模型组分行，带重置
  倒计时；折叠态显示 5h 窗口剩余比例。卡片沿用 Ark / Command Code 的进度条
  语义（按已用比例着色），CPA 上报的是剩余量，卡内取 `100 - 剩余`。
- 新增 host RPC `cpa-quota/snapshot`（走 0.7.2 起的 `/api` 精确路由）：
  经 `network.cpaBaseUrl`（默认**留空**，见 0.7.6）读取 CPA 管理接口
  上 `antigravity-priority` 插件探测到的配额快照；若快照为空（CPA/插件刚重启）
  自动触发一次 `?mode=probe` 再读。沿用 40s 缓存 + 上游失败回退上次数据
  （`stale: true`）的既有模式。
- 新增两条可写渠道凭证（设置页 →「渠道凭证 → Google AI Pro（CPA 反代）」）：
  `CPA_BASIC_AUTH`（nginx Basic，`user:pass`）与 `CPA_MANAGEMENT_KEY`
  （CPA 管理密钥）。两者都会出现在 `/credential-status` 的状态列表里。
- 新增设置项 `network.cpaBaseUrl`。

### Changed

- 管理接口请求同时携带两层独立凭据：`Authorization: Basic ...`（由 nginx 校验）
  与 `X-CPA-Key: <management key>`（由 nginx 改写成上游
  `Authorization: Bearer ...`）。二者不能共用一个 `Authorization` 头，这是该
  头设计的由来。

## [0.7.2] — 2026-09-10

### Changed

- **Adapted to dsh 0.1.5-rc.1**: `connection.rpc.handle` is unusable upstream
  (the connection plugin no longer injects `webServer`, so any plugin
  registering a channel through it aborts boot with
  `cannot get property "webServer" without inject` —
  deepseek-ai/deepseek-harness discussion #5926). Official plugin RPC now
  rides the shared `/api` channel as exact Fetch routes:
  - Host: the five RPC channels (`/balance`, `/ark-quota`, `/cmdcode-quota`,
    `/credential-status`, `/session-provider`) register via
    `connection.fetch.register` as `/api/<channel>/snapshot` exact routes,
    behind a `rpcHandle(ctx, channel, endpoint, handler)` shim that keeps the
    old call shape (handler signatures unchanged). The `client-request` →
    `server-response` envelope protocol is unchanged, including the official
    `415` content-type and `400` bad-envelope branches; unexpected handler
    throws answer `200 + { ok: false, error: { code: 'gateway/internal' } }`
    so the browser client never leaves its graceful `{ ok: false }` path.
  - Client: `connection.rpc.call('/api', '<channel>/snapshot', payload)`
    replaces `connection.rpc.call('<channel>', 'snapshot', payload)` at all
    five call sites; response parsing (`result.ok` / `result.value`) is
    unchanged.

## [0.7.1] — 2026-09-07

### Fixed

- **The card did not follow the model channel when switching between sessions
  that use different channels** (in-session switches worked, cross-session did
  not). The `/session-provider` RPC now resolves the *active session's* model
  selection via `ctx.sessionController.resolveAgent(sessionId)` and the
  session-scoped `modelSelection` projection (`pending ?? lastUsed`), falling
  back to `agentDefaultModel.currentSelection()` when the session is
  unresolvable. The client passes the active `sessionId` as the RPC payload.

## [0.7.0] — 2026-09-07

### Changed

- **Adapted to dsh 0.1.2-rc.1** (breaking platform upgrade; requires the
  0.1.2-rc.1 host — the old 0.1.1-rc.2 host does not provide the new APIs):
  - Host: settings registration moved from the removed
    `installSettingsSection(ctx, settingsNamespace(...))` to
    `settings.installSection(ctx, 'dsh-balance-monitor', ...)` via a lazy
    `ctx.inject(['settings'])` (absent settings service is a silent no-op).
  - Host: `rpc.handle` calls dropped the removed third `{ authority }`
    argument.
  - Host: new `/session-provider` RPC resolves the card's channel from
    `ctx.agentDefaultModel.currentSelection()` (with a display name from the
    LLM registry), replacing the removed browser `connection.api.sessions.models`
    aggregate. DSH keeps the default in sync with session model switches, so
    the card still follows the session channel.
  - Client: settings saves go through the bound `scope.mutate(ops, revision)`
    (replaces `connection.api.settings.mutate`); credential writes go through
    `remote.credentials.set(ref, value)` (replaces
    `connection.api.credentials.set`); the inject list adds `remote`,
    `remote.credentials`.
  - Packaging: `dsh.client.inject` no longer names the removed
    `@deepseek-ai/dsh-client-runtime`; depends on `@deepseek-ai/schemastery`
    only (dsh-settings no longer imported at runtime).

## [0.6.5] — 2026-08-28

### Fixed

- **Browser bundle registered the unscoped id**: `lib/client.js` called
  `__ModuleLoader__.load({ id: 'dsh-balance-monitor' })`, but the loader
  expects the entry id to match the (scoped) package name, so the client
  bundle failed to register with
  `loaded without registering "@alanzhao/dsh-balance-monitor"`. The client now
  registers as `@alanzhao/dsh-balance-monitor`.

## [0.6.4] — 2026-08-28

### Fixed

- **npm install broke the profile boot**: the bundle patch's entry `name` was
  the unscoped `dsh-balance-monitor`, but the package is published as the scoped
  `@alanzhao/dsh-balance-monitor`. Cordis's loader imports the entry by that
  name, so a fresh npm install failed with
  `ERR_MODULE_NOT_FOUND: Cannot find package 'dsh-balance-monitor'`. The patch
  now uses `@alanzhao/dsh-balance-monitor`.

## [0.6.3] — 2026-08-28

### Changed

- **Merged the two upstream timeouts into one**: `network.platformTimeoutMs`
  (DeepSeek official usage) is gone; all quota/usage fetches (Volcano Ark,
  Command Code, DeepSeek platform) now share `network.timeoutMs` (default 20 s).
  The settings panel shows a single 上游超时 / Upstream timeout field.

## [0.6.2] — 2026-08-28

### Fixed

- **Channel-credential panel still showed all "not configured"** (and region
  `—`) even after the host fix: the client's `/credential-status` fetch
  destructured `{ result }` from `connection.rpc.call(...)`, but `rpc.call`
  resolves to `{ ok, value }` directly (the `{ result }` wrapper only applies
  to `connection.api.*` calls). The fetch threw → `credStatus` stayed null.
  Now reads `result.ok` / `result.value` directly, matching the other cards.

## [0.6.1] — 2026-08-28

### Fixed

- **Channel-credential status showed everything as "not configured"** after
  the 0.6.0 upgrade: the host plugin's `inject` array declared only
  `connection`, so cordis did not guarantee the `credentials`/`settings`/`llm`
  services were ready at `apply()` time — `ctx.get()` failed (silently
  swallowed) and `/credential-status` fell back to the no-service path
  (all `configured: false, managedByDsh: false`).
  - Declared `credentials`, `settings`, `llm` in the host `inject` array.
  - Services are now resolved lazily: `refreshServices()` runs at `apply()`
    and on every RPC entry, and only replaces a cached reference when the
    service resolves non-null (an early miss can't clobber a later success).
  - `readCredential()` continues to fall back to env + direct file parsing
    when the seam is absent, so balance/usage lookups were never affected.

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

[0.7.6]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.7.5...0.7.6
[0.7.5]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.7.4...0.7.5
[0.7.4]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.7.3...0.7.4
[0.7.3]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.7.2...0.7.3
[0.7.2]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.7.1...0.7.2
[0.7.1]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.7.0...0.7.1
[0.7.0]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.6.5...0.7.0
[0.6.5]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.6.4...0.6.5
[0.6.4]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.6.3...0.6.4
[0.6.3]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.6.2...0.6.3
[0.6.2]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.6.1...0.6.2
[0.6.1]: https://github.com/alanzhao0128/dsh-balance-monitor/compare/0.6.0...0.6.1
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

[English](README.en.md) | 简体中文


# dsh-balance-monitor

DeepSeek 余额与花费窗口，直接显示在 dsh 侧边栏底部。

一个极简的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) 插件：在侧边栏底部（设置上方）显示当前会话渠道的余额/用量。**DeepSeek 官方渠道**显示余额与今日/7日/30日花费窗口（支持官方用量数据）；**火山方舟渠道**显示 Agent Plan 套餐额度（5小时/周/月进度条）；**Command Code 渠道**显示 5h/周/月 用量窗口（GOAT/Pro/Max 等套餐）；**Google AI Pro 渠道**（Antigravity 经 CLIProxyAPI 反代）显示 5 小时/周剩余额度（Gemini 与 Claude/GPT 两个模型组）。样式完全使用官方设计令牌，克制内敛。

<p align="center">
  <img src="docs/preview/balance-wide.png" alt="侧边栏底部余额卡片" width="280">
</p>

## 功能

| 功能 | 实现 |
|---|---|
| 实时余额 | 服务端调用 `GET https://api.deepseek.com/user/balance`，使用 `$DSH_HOME/.credentials.yaml` 中的 `DEEPSEEK_API_KEY`（环境变量优先） |
| 今日/7日/30日花费（官方） | 配置 `DEEPSEEK_PLATFORM_TOKEN` 后，服务端调用官方用量接口 `platform.deepseek.com/api/v0/usage/cost`（与平台用量页同一份数据），按日期窗口累加。7日 = 今天往前 6 天，30日 = 今天往前 29 天（均含今天）。不受「在其他环境使用 API」影响 |
| 余额差值回退 | 无平台 token 或官方接口失败时，今日花费回退为余额差值账本（只累计余额下降，充值不冲账）；7日/30日显示 `—` |
| 渠道感知 | 卡片跟随当前会话的模型渠道（provider）自动显隐：DeepSeek 官方显示余额/花费；火山方舟显示 Agent Plan 进度条；Command Code 显示用量窗口；Google AI Pro（`cliproxy`）显示 5h/周 剩余额度；其他渠道显示「暂不支持」占位；无会话不显示 |
| 火山方舟 Agent Plan | 配置 AK/SK 后，调用 `GetAFPUsage` 控制面 API（SigV4 签名），显示 5小时/周/月 三档套餐额度进度条，颜色随用量变化（绿→黄→红） |
| Command Code 用量 | 配置 `COMMANDCODE_API_KEY` 后，调用 `api.commandcode.ai/alpha/billing/credits` 等接口，显示 5h/周/月 三窗口已用百分比与重置倒计时 |
| Google AI Pro 额度 | 配置 CPA 管理地址 + Basic 认证 + 管理密钥后，读取 CPA 上 `antigravity-priority` 插件探测的配额快照，按 Gemini / Claude+GPT 两个模型组显示 5h 与每周剩余百分比、重置倒计时（CPA 刚重启导致快照为空时自动触发一次探测） |
| 位置 | 注册在官方 `sidebar.footer.action` 槽位 —— 设置上方，零 hack |
| 折叠态 | 收起后变为 36px 圆形，显示紧凑余额 + tooltip |
| 健壮性 | 60s 轮询 + 切回标签页时刷新；上游失败时保留上次数据（变淡标记 stale），不闪错误 |

## 安装

浏览器端 bundle 是手写的 classic script，**无构建步骤**，git 安装无需 prepare 脚本：

```sh
dsh plugin --profile web add "github:alanzhao0128/dsh-balance-monitor#main"
```

或从 npm：

```sh
dsh plugin --profile web add @alanzhao/dsh-balance-monitor
```

然后重启 Web UI（`dsh --profile web`）。卡片出现在展开的侧边栏底部、设置按钮上方。

> **版本要求**：`0.7.2+` 需要 dsh `≥ 0.1.5-rc.1`（0.1.5 起官方弃用 `connection.rpc.handle`，插件 RPC 迁移到共享 `/api` 通道的精确 Fetch 路由）；dsh `0.1.2-rc.1` 宿主请固定安装 `0.7.1`。

## 配置

### 设置面板（推荐）

打开 dsh 设置（齿轮）→ **余额监控 / Balance Monitor**，可编辑卡片行为参数，保存后写入 `~/.dsh/settings.yaml` 的 `dsh-balance-monitor:` 段，**即时生效**（个别参数重启后生效）：

| 分组 | 字段 | 默认 | 说明 |
|---|---|---|---|
| 显示 | `ui.showCard` | `true` | 关闭后不显示任何渠道卡片 |
| 显示 | `ui.warnThreshold` | `30` | 用量 ≥ 该百分比进度条变黄 |
| 显示 | `ui.dangerThreshold` | `70` | 用量 ≥ 该百分比进度条变红 |
| 刷新 | `ui.pollMs` | `60` 秒 | 卡片刷新间隔（面板以秒显示，内部存毫秒） |
| 网络 | `network.cacheMs` | `40` 秒 | 服务端配额缓存，建议保持低于卡片刷新间隔 |
| 网络 | `network.timeoutMs` | `20` 秒 | 上游超时（火山方舟 / Command Code / DeepSeek 官方用量 / CPA 管理接口） |
| 网络 | `network.cpaBaseUrl` | `https://cpa.alanzhao.xyz` | CLIProxyAPI 管理地址（Google AI Pro 渠道的配额来源） |
| 凭证 | `credentials.file` | `.credentials.yaml` | 凭证文档文件名（相对 `$DSH_HOME`） |

### 渠道凭证

设置面板的 **「渠道凭证」分组** 显示每个渠道展示余额/用量需要的凭证及其配置状态，按是否已被 DSH 模型配置引用区分只读/可写：

| 渠道 | 凭证 | 交互 |
|---|---|---|
| DeepSeek 官方 | `DEEPSEEK_API_KEY` | 只读（DSH 模型配置已引用），显示 ✅/⚠️ 状态 |
| DeepSeek 官方 | `DEEPSEEK_PLATFORM_TOKEN` | **可写**密码框（官方花费需要，会过期），带三段说明：它是什么 / 怎么取（platform.deepseek.com → F12 → Console → `JSON.parse(localStorage.getItem('userToken')).value`）/ 用来干什么 |
| 火山方舟 | `ARK_ACCESS_KEY_ID` | **可写**密码框（插件专属，DSH 模型用的是 `HUOSHAN_API_KEY`，两套不同凭证） |
| 火山方舟 | `ARK_SECRET_ACCESS_KEY` | **可写**密码框 |
| 火山方舟 | 区域 | 只读，自动跟随 DSH 模型配置（从 huoshan provider 的 `baseURL` 解析，如 `cn-beijing`） |
| Command Code | `COMMANDCODE_API_KEY` | 只读（DSH 模型配置已引用），显示 ✅/⚠️ 状态 |
| Google AI Pro | `CPA_BASIC_AUTH` | **可写**密码框，格式 `user:pass` —— CPA 服务器上 nginx 的 Basic 认证（第二把锁） |
| Google AI Pro | `CPA_MANAGEMENT_KEY` | **可写**密码框 —— CPA 的 management key（第三把锁）；插件把它放在 `X-CPA-Key` 头里，由 nginx 改写成上游的 `Authorization: Bearer` |

可写框保存时走官方 `ctx.credentials.set()` 写入 `$DSH_HOME/.credentials.yaml`（`refs:` 段，带锁 + 原子写），插件自身不写文件。

### 凭证

凭证存于 `$DSH_HOME/.credentials.yaml`（Web 界面 Models 页写入，或直接编辑文件；插件通过官方 `ctx.credentials` 服务读取，环境变量优先）：

| 凭证 | 必需 | 用途 |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | 查询余额 `api.deepseek.com/user/balance` |
| `DEEPSEEK_PLATFORM_TOKEN` | 可选 | 查询官方用量（今日/7日/30日）。获取：登录 [platform.deepseek.com](https://platform.deepseek.com) → DevTools Console 执行 `JSON.parse(localStorage.getItem('userToken')).value`，把输出写入凭证 |

> ⚠️ `DEEPSEEK_PLATFORM_TOKEN` 是网页会话 token，**会过期**（官方返回 code 40002/40003 即过期）。过期时卡片显示红色提示并回退余额差值估算；在设置面板凭证组粘贴新 token 即可恢复，余额查询不受影响。

| 凭证 | 必需 | 用途 |
|---|---|---|
| `ARK_ACCESS_KEY_ID` | 火山方舟渠道时需要 | 火山方舟控制面 API 签名（AK/SK），查询 Agent Plan 套餐额度 |
| `ARK_SECRET_ACCESS_KEY` | 火山方舟渠道时需要 | 同上，Secret Access Key |
| `COMMANDCODE_API_KEY` | Command Code 渠道时需要 | Command Code API key（`user_...`），查询 5h/周/月 用量 |
| `CPA_BASIC_AUTH` | Google AI Pro 渠道时需要 | CPA 前置 nginx 的 Basic 认证，格式 `user:pass` |
| `CPA_MANAGEMENT_KEY` | Google AI Pro 渠道时需要 | CPA management key，用于读取 `antigravity-priority` 插件探测到的配额快照 |

> 火山方舟 AK/SK 获取：登录 [console.volcengine.com](https://console.volcengine.com) → 访问控制 → API 访问密钥 → 新建密钥。注意：AK/SK 是 IAM 账号级凭证，能操作所有资源，请妥善保管。

## Google AI Pro（cliproxy）接入前提

该渠道的配额数据**不在 Google 侧直接可查**，而是由你自己的 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)（CPA）反向代理提供。插件读的是 CPA 管理接口上配额插件探测到的快照，因此需要 CPA 侧满足：

1. CPA 开启管理 API（`remote-management.secret-key` 非空），并允许反代转发（`allow-remote: true`）；
2. 安装并启用一个配额 provider 插件 —— 推荐 [`antigravity-priority`](https://github.com/ygq-future/antigravity-priority)（`plugins.enabled: true` + `plugins.configs.antigravity-priority.enabled: true`），它负责探测 Antigravity 的 5h / 每周窗口；
3. 管理接口经 TLS 暴露（建议前置 nginx/Caddy 反代，公网只放行推理路径，`/v0/` 再叠一层 Basic）；
4. 把 Basic 认证写入 `CPA_BASIC_AUTH`、management key 写入 `CPA_MANAGEMENT_KEY`，并在设置面板填好 `network.cpaBaseUrl`。

> 管理接口请求会同时带 `Authorization: Basic ...`（给反代）与 `X-CPA-Key`（反代改写成上游 `Authorization: Bearer`）—— 两者不能共用一个 `Authorization` 头。

## 工作原理

一个插件行同时承担两种角色（`dsh.bundle` patch + `dsh.client` 浏览器注册表声明）：

- **服务端半**（`lib/index.js`）—— 通过 `connection.fetch.register` 在共享 `/api` 通道上注册 6 个 RPC 端点（继承官方信任围栏与浏览器认证）：`balance/snapshot`（DeepSeek 余额+官方用量窗口）、`ark-quota/snapshot`（火山方舟 Agent Plan 额度，每次调用签 AK/SK SigV4 调 `GetAFPUsage`，缓存 40s——严格小于浏览器端 60s 轮询，保证每次轮询都触发上游刷新）、`cmdcode-quota/snapshot`（Command Code 用量，Bearer 调 `api.commandcode.ai/alpha/billing/credits` 等，缓存 40s）、`cpa-quota/snapshot`（Google AI Pro 配额，读 CPA 管理接口上 `antigravity-priority` 插件的快照）、`credential-status/snapshot`（凭证状态与区域）、`session-provider/snapshot`（按会话解析渠道 provider）。缓存与超时时长来自设置面板（`network.*`）。凭证统一走官方 `ctx.credentials` 服务读取。
- **浏览器半**（`lib/client.js`）—— 零依赖 classic-script bundle，注册 `sidebar.footer.action` 条目。通过 `sessions.list` 订阅 + 1s 轻量轮询 `/session-provider` RPC（携带当前 `sessionId`，host 端按该会话的 `modelSelection` 投影解析渠道；0.7.1 起跨会话切换也会跟随）感知当前会话的 provider，再按渠道注册表分发：`deepseek-official` 渲染余额卡片（每 60s 轮询一次余额，标签页重新可见时立即刷新）；未注册渠道渲染「暂不支持」占位；无会话则不渲染。渠道目录变化（`llm/adapters-updated` 事件）会立即触发重新判定。同时注册 `settings.section` 设置页（余额监控），读写 `dsh-balance-monitor` 命名空间；`credential-status` 端点（凭证状态 + 区域解析，host 端从 `ctx.llm`/`ctx.settings` 判定哪些凭证被 DSH 模型配置引用）。

状态文件（`$DSH_HOME/storages/balance-monitor.json`）：

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

`spentSource` 为 `official`（官方接口）或 `estimate`（余额差值估算）。

## 安全说明

- API key 与平台 token 永不离开服务端：浏览器半只能通过 RPC 通道看到余额/花费数字，接触不到凭证。
- 通道走 `loopback` 信任策略。
- 无遥测，网络请求仅官方余额接口与官方用量接口。

## 目录结构

```
dsh-balance-monitor/
├── package.json        # dsh.bundle (patch) + dsh.client (浏览器注册表)
├── cordis.patch.yml    # 插入这一个组合插件行
└── lib/
    ├── index.js        # 服务端半：5 个 /api RPC 端点（余额/方舟/Command Code/凭证状态/会话渠道）+ settings 接入
    ├── config.js       # 设置 schema + 默认值（与设置面板字段一一对应）
    ├── signature.js    # 火山方舟 SigV4 签名
    └── client.js       # 浏览器半：侧边栏卡片 + 设置页（手写，无构建）
```

## 开发

无需工具链。直接改 `lib/*.js`；bundle 格式与官方 `tsdown` 预设产物一致（`window.__ModuleLoader__.load({ id, factory })`）。

## License

MIT

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
| Google AI Pro 额度 | 配置 CPA 管理地址 + Basic 认证 + 管理密钥后，读取 CPA 上 `antigravity-priority` 插件探测的配额快照，按 Gemini / Claude+GPT 两个模型组显示 5h 与每周剩余百分比、重置倒计时（CPA 刚重启导致快照为空时自动触发一次探测）。**服务端需自行搭建，见[搭建指南](#google-ai-procliproxy渠道搭建)** |
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
| 网络 | `network.cpaBaseUrl` | 留空 | **你自己的** CLIProxyAPI 管理地址（Google AI Pro 渠道的配额来源）；留空则该渠道显示「未配置 CPA 地址」，见下文[搭建指南](#google-ai-procliproxy渠道搭建) |
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

## Google AI Pro（CLIProxyAPI）渠道搭建

这个渠道**没有现成的公共接口可用**：Google 侧不提供可查询的配额 API，[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)（下称 CPA）自身也不暴露配额 —— 必须由 CPA 上运行的一个**配额 provider 插件**去探测 Antigravity 的 5 小时 / 每周窗口，本插件再读这份探测快照。所以想看到这张卡片，需要你自己把下面这条链路搭起来：

```
dsh 插件 ──HTTPS:443──▶ nginx（TLS + Basic 认证 + 限流）
                          └──▶ CPA 127.0.0.1:8317（management key 鉴权）
                                 └──▶ antigravity-priority 插件（探测 Antigravity 配额）
                                        └──▶ Antigravity 上游
```

`network.cpaBaseUrl` 默认**留空**（本项目不附带任何他人地址），此时卡片显示「未配置 CPA 地址」；搭好后填入地址、再配上两条凭证即可。

### 1. CPA 侧

CPA `config.yaml`（v7.3+）：

```yaml
# 管理 API：secret-key 必须非空，否则 /v0/management/* 不可用
remote-management:
  secret-key: "<随机强密钥 —— 这就是 CPA_MANAGEMENT_KEY>"

# 允许非本机来源访问管理接口（我们要经 nginx 转发进来）
allow-remote: true

# 配额探测插件
plugins:
  enabled: true
  dir: "plugins"
  configs:
    antigravity-priority:
      enabled: true
      state_cache_path: "/root/.cli-proxy-api/antigravity-priority-cache.json"

# 【重要】声明反代来源网段，让 CPA 看到真实客户端 IP。
# 不配的话，经反代的所有请求都来自同一个 IP，而 CPA 对连续失败的管理鉴权
# 会把源 IP 封禁约 30 分钟 —— 等于把你自己的整条链路封死。
trusted-proxies:
  - "172.23.0.0/16"
```

把配额插件 [`antigravity-priority`](https://github.com/ygq-future/antigravity-priority) 装进 `plugins/` 目录（Go 编译的 c-shared `.so`；它 `supports_quota: false`，不走 CPA 标准配额接口，而是提供自己的 `plugins/antigravity-priority/snapshot/latest`、`run?mode=probe`、`samples`、`diagnostics` 路由）。**只放插件不启用 = 快照永远为空**。

容器只监听回环，公网只暴露 443：

```yaml
# docker-compose.yml
ports:
  - "127.0.0.1:8317:8317"
volumes:
  - ./plugins:/CLIProxyAPI/plugins
```

### 2. nginx 反代（两层锁 + 路径封锁）

`/v1/`（推理）直通，`/v0/`（管理）叠一层 Basic，其余路径一律 404；再加限流防爆破：

```nginx
limit_req_zone $binary_remote_addr zone=cpa_mgmt:10m rate=30r/m;

server {
  listen 443 ssl http2;          # nginx 1.24 及更早：http2 只能写在 listen 行上
  server_name cpa.example.com;   # ← 换成你自己的域名

  ssl_certificate     /etc/letsencrypt/live/cpa.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/cpa.example.com/privkey.pem;

  # 推理路径：直通，靠 CPA 自己的 API key 鉴权
  location /v1/ {
    proxy_pass http://127.0.0.1:8317;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  # 管理路径：Basic 认证 + 限流 + 认证头改写
  location /v0/ {
    limit_req zone=cpa_mgmt burst=5 nodelay;
    auth_basic "CPA";
    auth_basic_user_file /etc/nginx/.htpasswd-cpa;

    proxy_pass http://127.0.0.1:8317;
    # 关键：Basic 占用了 Authorization 头，而 CPA 只认 Authorization: Bearer。
    # 所以客户端把 management key 放在 X-CPA-Key，这里为上游改写成 Bearer。
    proxy_set_header Authorization "Bearer $http_x_cpa_key";
  }

  location / { return 404; }
}
```

> `/v0/` 只服务于本插件，暴露面越小越好；有条件可再叠一层 IP allowlist，或干脆只走内网 / WireGuard。

### 3. 插件侧

| 位置 | 填什么 |
|---|---|
| 设置面板 → 网络 → **CPA 地址** | `https://cpa.example.com`（你的 nginx 入口，**不要**带 `/v0` 后缀） |
| 设置面板 → 渠道凭证 → **Basic 认证** | `CPA_BASIC_AUTH`，格式 `user:pass`（对应 nginx 的 `.htpasswd-cpa`） |
| 设置面板 → 渠道凭证 → **管理密钥** | `CPA_MANAGEMENT_KEY`，即 CPA 的 `remote-management.secret-key` |

### 4. 自检

```bash
# ① 无 Basic → 401（被 nginx 拦下）
curl -s -o /dev/null -w '%{http_code}\n' https://cpa.example.com/v0/management/quota/providers

# ② 有 Basic、无 management key → 401（被 CPA 拦下）
curl -s -o /dev/null -w '%{http_code}\n' -u user:pass https://cpa.example.com/v0/management/quota/providers

# ③ 两者齐 → 200
curl -s -u user:pass -H 'X-CPA-Key: <management key>' \
  https://cpa.example.com/v0/management/plugins/antigravity-priority/snapshot/latest
```

### 5. 踩坑清单

- **配额接口 501 / 快照为空**：CPA 上没装或没启用配额 provider 插件。快照为空时（例如 CPA 刚重启）本插件会自动 POST 一次 `.../run?mode=probe` 再读一次，第二次仍空则说明插件侧没探测成功。
- **Basic 与 Bearer 抢同一个 `Authorization` 头**：必须按上面的写法把 management key 放进 `X-CPA-Key`，由 nginx 改写成上游 Bearer；同时传两种 `Authorization` 只会互相覆盖。
- **连续鉴权失败会封源 IP**：CPA 对失败的管理鉴权有暴力破解封禁（约 30 分钟）。经反代时所有请求源 IP 相同，一旦触发就是整条链路不可用 —— 所以务必配 `trusted-proxies`；已经触发时 `docker restart <容器>` 可清除封禁。
- **`http2 on;` 在 nginx 1.24 上不支持**：老版本只能写 `listen 443 ssl http2;`，写错会 `unknown directive "http2"` 导致 nginx 起不来。
- **必须走 TLS**：Basic 是明文凭据，公网裸 HTTP 等于把密码广播出去。
- **推理与管理是两套密钥**：`/v1/` 用的 API key（DSH 模型里的 `CLIPROXYAPI_KEY`）和 `/v0/` 用的 management key 互不通用。

> 本项目不含以上任何服务端组件，也不附带默认地址 —— 你需要自己部署 CPA + 配额插件 + 反代，并把地址填进 `network.cpaBaseUrl`。

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
    ├── index.js        # 服务端半：6 个 /api RPC 端点（余额/方舟/Command Code/Google AI Pro/凭证状态/会话渠道）+ settings 接入
    ├── config.js       # 设置 schema + 默认值（与设置面板字段一一对应）
    ├── signature.js    # 火山方舟 SigV4 签名
    └── client.js       # 浏览器半：侧边栏卡片 + 设置页（手写，无构建）
```

## 开发

无需工具链。直接改 `lib/*.js`；bundle 格式与官方 `tsdown` 预设产物一致（`window.__ModuleLoader__.load({ id, factory })`）。

## License

MIT

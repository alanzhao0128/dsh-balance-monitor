[English](README.en.md) | 简体中文


# dsh-balance-monitor

DeepSeek 余额与花费窗口，直接显示在 dsh 侧边栏底部。

一个极简的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) 插件：在侧边栏底部（设置上方）显示当前会话渠道的余额/用量。**DeepSeek 官方渠道**显示余额与今日/7日/30日花费窗口（支持官方用量数据）；**火山方舟渠道**显示 Agent Plan 套餐额度（5小时/周/月进度条）。样式完全使用官方设计令牌，克制内敛。

<p align="center">
  <img src="docs/preview/balance-wide.png" alt="侧边栏底部余额卡片" width="280">
</p>

## 功能

| 功能 | 实现 |
|---|---|
| 实时余额 | 服务端调用 `GET https://api.deepseek.com/user/balance`，使用 `$DSH_HOME/.credentials.yaml` 中的 `DEEPSEEK_API_KEY`（环境变量优先） |
| 今日/7日/30日花费（官方） | 配置 `DEEPSEEK_PLATFORM_TOKEN` 后，服务端调用官方用量接口 `platform.deepseek.com/api/v0/usage/cost`（与平台用量页同一份数据），按日期窗口累加。7日 = 今天往前 6 天，30日 = 今天往前 29 天（均含今天）。不受「在其他环境使用 API」影响 |
| 余额差值回退 | 无平台 token 或官方接口失败时，今日花费回退为余额差值账本（只累计余额下降，充值不冲账）；7日/30日显示 `—` |
| 渠道感知 | 卡片跟随当前会话的模型渠道（provider）自动显隐：DeepSeek 官方渠道显示余额/花费；火山方舟渠道显示 Agent Plan 进度条；其他渠道显示「暂不支持此渠道」占位；无会话时不显示 |
| 火山方舟 Agent Plan | 配置 AK/SK 后，调用 `GetAFPUsage` 控制面 API（SigV4 签名），显示 5小时/周/月 三档套餐额度进度条，颜色随用量变化（绿→黄→红） |
| 位置 | 注册在官方 `sidebar.footer.action` 槽位 —— 设置上方，零 hack |
| 折叠态 | 收起后变为 36px 圆形，显示紧凑余额 + tooltip |
| 健壮性 | 60s 轮询 + 切回标签页时刷新；上游失败时保留上次数据（变淡标记 stale），不闪错误 |

## 安装

浏览器端 bundle 是手写的 classic script，**无构建步骤**，git 安装无需 prepare 脚本：

```sh
dsh plugin --profile web add "github:alanzhao0128/dsh-balance-monitor#main"
```

或从 npm（发布后）：

```sh
dsh plugin --profile web add dsh-balance-monitor
```

然后重启 Web UI（`dsh --profile web`）。卡片出现在展开的侧边栏底部、设置按钮上方。

## 配置

两个凭证都在 `$DSH_HOME/.credentials.yaml`（Web 界面 Models 页写入，或直接编辑文件）：

| 凭证 | 必需 | 用途 |
|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | 查询余额 `api.deepseek.com/user/balance` |
| `DEEPSEEK_PLATFORM_TOKEN` | 可选 | 查询官方用量（今日/7日/30日）。获取：登录 [platform.deepseek.com](https://platform.deepseek.com) → DevTools Console 执行 `JSON.parse(localStorage.getItem('userToken')).value`，把输出写入凭证 |

> ⚠️ `DEEPSEEK_PLATFORM_TOKEN` 是网页会话 token，**会过期**（官方返回 code 40002/40003 即过期）。过期时插件自动回退余额差值估算，重新登录官网取新 token 更新即可；余额查询不受影响。

| 凭证 | 必需 | 用途 |
|---|---|---|
| `ARK_ACCESS_KEY_ID` | 火山方舟渠道时需要 | 火山方舟控制面 API 签名（AK/SK），查询 Agent Plan 套餐额度 |
| `ARK_SECRET_ACCESS_KEY` | 火山方舟渠道时需要 | 同上，Secret Access Key |

> 火山方舟 AK/SK 获取：登录 [console.volcengine.com](https://console.volcengine.com) → 访问控制 → API 访问密钥 → 新建密钥。注意：AK/SK 是 IAM 账号级凭证，能操作所有资源，请妥善保管。

## 工作原理

一个插件行同时承担两种角色（`dsh.bundle` patch + `dsh.client` 浏览器注册表声明）：

- **服务端半**（`lib/index.js`）—— 在 `ctx.connection` 上注册两个 RPC 通道（loopback 信任围栏）：`/balance`（DeepSeek 余额+官方用量窗口）和 `/ark-quota`（火山方舟 Agent Plan 额度，每次调用签 AK/SK SigV4 调 `GetAFPUsage`，缓存 5 分钟）。
- **浏览器半**（`lib/client.js`）—— 零依赖 classic-script bundle，注册 `sidebar.footer.action` 条目。先通过 `sessions.list` 订阅 + 1s 轻量轮询 `session.models`（本地 RPC）感知当前会话的 provider，再按渠道注册表分发：`deepseek-official` 渲染余额卡片（每 60s 轮询一次余额，标签页重新可见时立即刷新）；未注册渠道渲染「暂不支持」占位；无会话则不渲染。渠道目录变化（`llm/adapters-updated` 事件）会立即触发重新判定。

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
    ├── index.js        # 服务端半：/balance RPC 通道（余额 + 官方用量窗口 + 回退账本）
    └── client.js       # 浏览器半：侧边栏卡片（手写，无构建）
```

## 开发

无需工具链。直接改 `lib/*.js`；bundle 格式与官方 `tsdown` 预设产物一致（`window.__ModuleLoader__.load({ id, factory })`）。

## License

MIT

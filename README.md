[English](README.en.md) | 简体中文


# dsh-balance-monitor

DeepSeek 余额与花费窗口，直接显示在 dsh 侧边栏底部。

一个极简的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) 插件：在侧边栏底部（设置上方）显示你的 DeepSeek API 账户余额，以及 **今日 / 7日 / 30日** 三个花费窗口。有平台 token 时全部为**官方口径**（与 platform.deepseek.com 用量页一致）；没有 token 时今日回退为余额差值估算。样式完全使用官方设计令牌，克制内敛。

<p align="center">
  <img src="docs/preview/balance-wide.png" alt="侧边栏底部余额卡片" width="280">
</p>

> 预览图为早期布局；最新版为「余额」一行 + 「今日 / 7日 / 30日」三列花费窗口，中间比例条已移除。

## 功能

| 功能 | 实现 |
|---|---|
| 实时余额 | 服务端调用 `GET https://api.deepseek.com/user/balance`，使用 `$DSH_HOME/.credentials.yaml` 中的 `DEEPSEEK_API_KEY`（环境变量优先） |
| 今日/7日/30日花费（官方） | 配置 `DEEPSEEK_PLATFORM_TOKEN` 后，服务端调用官方用量接口 `platform.deepseek.com/api/v0/usage/cost`（与平台用量页同一份数据），按日期窗口累加。7日 = 今天往前 6 天，30日 = 今天往前 29 天（均含今天）。不受「在其他环境使用 API」影响 |
| 余额差值回退 | 无平台 token 或官方接口失败时，今日花费回退为余额差值账本（只累计余额下降，充值不冲账）；7日/30日显示 `—` |
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

## 工作原理

一个插件行同时承担两种角色（`dsh.bundle` patch + `dsh.client` 浏览器注册表声明）：

- **服务端半**（`lib/index.js`）—— 在 `ctx.connection` 上注册 `/balance` RPC 通道（loopback 信任围栏）。每次调用：读取 API key 查余额；有平台 token 时并行拉取当前月（+ 跨月窗口所需的上月）官方用量数据，按日期窗口累加出今日/7日/30日；官方不可用时以余额差值账本兜底。返回 `{ ok, value }`。
- **浏览器半**（`lib/client.js`）—— 零依赖 classic-script bundle，注册 `sidebar.footer.action` 条目。卡片每 60s 轮询一次，标签页重新可见时立即刷新。

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

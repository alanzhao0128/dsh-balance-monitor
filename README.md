[English](README.en.md) | 简体中文


# dsh-balance-monitor

DeepSeek 账户余额，直接显示在 dsh 侧边栏底部。

一个极简的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) 插件：在侧边栏底部（设置上方）显示你的 DeepSeek API 账户余额、一条细的余额剩余比例条，以及当天已花费的金额。样式完全使用官方设计令牌，克制内敛。

<p align="center">
  <img src="docs/preview/balance-wide.png" alt="侧边栏底部余额卡片" width="280">
</p>

## 功能

| 功能 | 实现 |
|---|---|
| 实时余额 | 服务端调用 `GET https://api.deepseek.com/user/balance`，使用 `$DSH_HOME/.credentials.yaml` 中的 `DEEPSEEK_API_KEY`（环境变量优先） |
| 今日花费 | 当天首次成功查询的余额记为基线（持久化在 `$DSH_HOME/storages/balance-monitor.json`）；花费 = `max(0, 基线 − 当前)`。充值不会让数字变负 |
| 比例条 | 当前余额 ÷ 当日基线，蓝 → 琥珀 → 红 三档渐降 |
| 位置 | 注册在官方 `sidebar.footer.action` 槽位 —— 设置上方，零 hack |
| 折叠态 | 收起后变为 36px 圆形，显示紧凑金额 + tooltip |
| 健壮性 | 60s 轮询 + 切回标签页时刷新；上游失败时保留上次数据（变淡标记 stale），不闪错误 |

## 安装

浏览器端 bundle 是手写的 classic script，**无构建步骤**，git 安装无需 prepare 脚本：

```sh
dsh plugin --profile web add "github:<you>/dsh-balance-monitor#main"
```

或从 npm（发布后）：

```sh
dsh plugin --profile web add dsh-balance-monitor
```

然后重启 Web UI（`dsh --profile web`）。卡片出现在展开的侧边栏底部、设置按钮上方。

## 工作原理

一个插件行同时承担两种角色（`dsh.bundle` patch + `dsh.client` 浏览器注册表声明）：

- **服务端半**（`lib/index.js`）—— 在 `ctx.connection` 上注册 `/balance` RPC 通道（loopback 信任围栏）。每次调用读取 API key、查询余额 API、折算当日基线，返回 `{ ok, value }`。
- **浏览器半**（`lib/client.js`）—— 零依赖 classic-script bundle，注册 `sidebar.footer.action` 条目。卡片每 60s 轮询一次，标签页重新可见时立即刷新。

状态文件（`$DSH_HOME/storages/balance-monitor.json`）：

```json
{
  "date": "2026-08-14",
  "dayStart": 100.0,
  "lastTotal": 99.5,
  "lastCurrency": "CNY",
  "updatedAt": 1755200000000
}
```

## 安全说明

- API key 永不离开服务端：浏览器半只能通过 RPC 通道看到余额数字，接触不到 key。
- 通道走 `loopback` 信任策略。
- 无遥测，网络请求仅官方余额接口。

## 目录结构

```
dsh-balance-monitor/
├── package.json        # dsh.bundle (patch) + dsh.client (浏览器注册表)
├── cordis.patch.yml    # 插入这一个组合插件行
└── lib/
    ├── index.js        # 服务端半：/balance RPC 通道
    └── client.js       # 浏览器半：侧边栏卡片（手写，无构建）
```

## 开发

无需工具链。直接改 `lib/*.js`；bundle 格式与官方 `tsdown` 预设产物一致（`window.__ModuleLoader__.load({ id, factory })`）。

## License

MIT

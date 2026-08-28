// dsh-balance-monitor — host half.
//
// Two RPC channels:
// - /balance (DeepSeek): balance + official daily cost windows (today/7d/30d)
//   + balance-delta fallback. See header comments below.
// - /ark-quota (Volcano Ark): Agent Plan quota windows (5h/weekly/monthly)
//   via the GetAFPUsage control-plane OpenAPI, signed with AK/SK (SigV4).
//
// When the upstream call fails and a state file exists, the last known
// numbers are returned with a `stale: true` flag so the UI can keep showing
// something instead of flashing an error.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { buildSignedRequest, DEFAULT_REGION, DEFAULT_VERSION, OPENAPI_HOST } from './signature.js'
import { Config, resolveConfig } from './config.js'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

export const name = 'dsh-balance-monitor'
export const inject = ['connection']

const BALANCE_API = 'https://api.deepseek.com/user/balance'
/** Platform usage (cost) endpoint: per-day cost for one month, filterable by date. */
const PLATFORM_USAGE_URL = 'https://platform.deepseek.com/api/v0/usage/cost'
const STATE_FILE = 'balance-monitor.json'

// ---- Volcano Ark Agent Plan quota -----------------------------------------

// Timeout/cache durations live in the settings-managed config (lib/config.js),
// not as module constants, so the settings panel can tune them at runtime.

// ---- Command Code quota ----------------------------------------------------

const CMDCODE_API_BASE = 'https://api.commandcode.ai'
const CMDCODE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/**
 * The live settings-managed configuration. `resolveConfig` is applied once
 * here (defaults + user layer), and the settings section re-resolves it on
 * every change; consumers read through `liveConfig()` so edits take effect
 * without a restart. Absent a settings service, `apply` falls back to the
 * composition entry (which resolveConfig defaults).
 */
let live = null
const liveConfig = () => {
  if (live === null) throw new Error('dsh-balance-monitor: config not initialised')
  return live
}
const credentialsFile = () => join(dshHome(), liveConfig().credentials.file)

/** The official `ctx.credentials` service, or null when unavailable. */
let credentialsService = null
const creds = () => credentialsService

/**
 * Resolve one credential through the official credentials seam
 * (`ctx.credentials.resolve`, which layers process env → managed document →
 * `.env` fallbacks). Falls back to the legacy env-var + file regex path when
 * the service is absent (e.g. tests, minimal profiles).
 */
async function readCredential(ref) {
  const svc = creds()
  if (svc) {
    try {
      const resolved = await svc.resolve(ref)
      if (resolved && typeof resolved.value === 'string' && resolved.value.length > 0) return resolved.value
      return null
    } catch {
      // fall through to the legacy path
    }
  }
  if (process.env[ref]) return process.env[ref]
  try {
    const yaml = await readFile(credentialsFile(), 'utf8')
    return yaml.match(new RegExp(`^\\s*${ref}:\\s*(\\S+)`, 'm'))?.[1] ?? null
  } catch {
    return null
  }
}

/** Extract the API key (env → credentials seam → legacy file). */
const readApiKey = () => readCredential('DEEPSEEK_API_KEY')

/** Extract the optional platform session token (localStorage `userToken` of platform.deepseek.com). */
const readPlatformToken = () => readCredential('DEEPSEEK_PLATFORM_TOKEN')

function today() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Local calendar day as `YYYY-MM-DD` (dashboard rows are keyed by date). */
function localDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Coerce a possibly-string number to a finite number, or NaN. */
function toFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}

/**
 * Fetch one month of official daily cost from the DeepSeek platform
 * dashboard API — the same date-filterable data the platform console
 * shows. Parsing is defensive against renamed fields.
 * @returns array of `{ date: 'YYYY-MM-DD', cost: number }` (may include
 *   future calendar rows with zero cost), or `null` when the shape differs.
 * @throws on transport errors, non-zero envelope codes, and HTTP failures.
 */
async function fetchPlatformMonthDays(token, year, month) {
  const url = `${PLATFORM_USAGE_URL}?month=${month}&year=${year}`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'x-app-version': '1.0.0',
      Origin: 'https://platform.deepseek.com',
      Referer: 'https://platform.deepseek.com/usage',
    },
    signal: AbortSignal.timeout(liveConfig().network.platformTimeoutMs),
  })
  if (!response.ok) throw new Error(`platform usage api responded ${response.status}`)
  const body = await response.json()
  const biz = body && typeof body === 'object' ? body.data : undefined
  if (body?.code !== 0 || biz === undefined || biz.biz_code !== 0) {
    const code = body?.code ?? biz?.biz_code
    if (code === 40002 || code === 40003) {
      const error = new Error('DEEPSEEK_PLATFORM_TOKEN 已过期：请重新登录 platform.deepseek.com 并更新 userToken')
      error.code = 'PLATFORM_TOKEN_EXPIRED'
      throw error
    }
    throw new Error(`platform usage api error (code ${code ?? 'unknown'})`)
  }
  const bizData = biz.biz_data
  const container = Array.isArray(bizData) ? bizData[0] : bizData
  const days = container && typeof container === 'object' ? container.days : undefined
  if (!Array.isArray(days)) return null
  const rows = []
  for (const entry of days) {
    if (!entry || typeof entry.date !== 'string' || !Array.isArray(entry.data)) continue
    let dayTotal = 0
    for (const modelEntry of entry.data) {
      if (!modelEntry || typeof modelEntry !== 'object' || !Array.isArray(modelEntry.usage)) continue
      for (const u of modelEntry.usage) {
        if (!u || typeof u !== 'object') continue
        const value = toFinite(u.cost ?? u.amount)
        if (Number.isFinite(value)) dayTotal += value
      }
    }
    rows.push({ date: entry.date, cost: Math.round(dayTotal * 100) / 100 })
  }
  return rows
}

/** Date `n` calendar days before today, as `YYYY-MM-DD`. */
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDate(d)
}

/**
 * Sum official daily cost over an inclusive `[from, to]` date window
 * (`YYYY-MM-DD`, lexicographic compare is safe for this format).
 * @returns rounded sum, or `null` when the window contains no rows at all.
 */
function sumWindow(rows, from, to) {
  const inWindow = rows.filter((r) => r.date >= from && r.date <= to)
  if (inWindow.length === 0) return null
  return Math.round(inWindow.reduce((s, r) => s + r.cost, 0) * 100) / 100
}

async function fetchBalance(apiKey, signal) {
  const res = await fetch(BALANCE_API, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  if (!res.ok) throw new Error(`balance api responded ${res.status}`)
  const json = await res.json()
  const infos = Array.isArray(json.balance_infos) ? json.balance_infos : []
  const info = infos.find((i) => i.currency === 'CNY') ?? infos[0]
  if (!info) throw new Error('balance api returned no balance_infos')
  return {
    available: json.is_available === true,
    currency: info.currency,
    total: Number.parseFloat(info.total_balance),
    granted: Number.parseFloat(info.granted_balance),
    toppedUp: Number.parseFloat(info.topped_up_balance),
  }
}

const statePath = () => join(dshHome(), 'storages', STATE_FILE)

async function loadState() {
  try {
    const state = JSON.parse(await readFile(statePath(), 'utf8'))
    if (state && typeof state.date === 'string' && typeof state.dayStart === 'number') return state
  } catch {
    // no state yet
  }
  return null
}

async function saveState(state) {
  try {
    await mkdir(join(dshHome(), 'storages'), { recursive: true })
    await writeFile(statePath(), JSON.stringify(state, null, 2))
  } catch (error) {
    console.error('[balance-monitor] state write failed:', error)
  }
}

// ---- Volcano Ark Agent Plan quota -----------------------------------------

/** Read AK/SK through the credentials seam (env → managed document → legacy file). */
async function readArkCredentials() {
  const ak = await readCredential('ARK_ACCESS_KEY_ID')
  const sk = await readCredential('ARK_SECRET_ACCESS_KEY')
  return { ak, sk };
}

/**
 * Parse GetAFPUsage Result windows → [{ level, percentUsed, percentRemaining, resetAt }].
 * Absolute Used / Quota values come from the control-plane API; this normalises
 * them into consistent percentages for the widget.
 */
function parseAgentPlan(result) {
  const windows = [
    ["AFPFiveHour", "5h"],
    ["AFPWeekly", "weekly"],
    ["AFPMonthly", "monthly"],
  ];
  const out = [];
  for (const [key, level] of windows) {
    const win = result?.[key];
    const quota = Number(win?.Quota ?? 0);
    if (!(quota > 0)) continue;
    const used = Number(win?.Used ?? 0);
    const percentUsed = Math.round((used / quota) * 100 * 100) / 100;
    out.push({
      level,
      percentUsed,
      percentRemaining: Math.max(0, Math.min(100, Math.round((100 - percentUsed) * 100) / 100)),
      cap: 100,
      resetAt: typeof win.ResetTime === "number" ? win.ResetTime : null,
    });
  }
  return out;
}

/**
 * Call GetAFPUsage once with the current AK/SK and region.
 * @returns { quota, status, updatedAt } or null on failure.
 */
async function fetchArkQuota() {
  const creds = await readArkCredentials();
  if (!creds.ak || !creds.sk) throw new Error("ARK_ACCESS_KEY_ID / ARK_SECRET_ACCESS_KEY not found in .credentials.yaml");
  const { url, headers } = buildSignedRequest({
    accessKeyId: creds.ak,
    secretAccessKey: creds.sk,
    region: DEFAULT_REGION,
    version: DEFAULT_VERSION,
    action: "GetAFPUsage",
  });
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: "",
    signal: AbortSignal.timeout(liveConfig().network.timeoutMs),
  });
  if (!response.ok) throw new Error(`ark GetAFPUsage responded ${response.status}`);
  const body = await response.json();
  const result = body?.Result;
  if (!result) throw new Error("ark GetAFPUsage returned no Result");
  const quota = parseAgentPlan(result);
  return {
    ok: true,
    plan: "agent-plan",
    status: body?.Status ?? null,
    updatedAt: typeof body?.UpdateTimestamp === "number" ? body.UpdateTimestamp : Math.floor(Date.now() / 1000),
    hasReward: body?.HasReward === true,
    quota,
  };
}

// ---- Command Code quota ----------------------------------------------------

/** Read the Command Code API key through the credentials seam. */
const readCommandCodeKey = () => readCredential('COMMANDCODE_API_KEY')

/**
 * Normalise Command Code usage into the same window shape as the Ark card:
 * [{ level, used, cap, percentUsed, resetAt }].
 *   - 5h / weekly come straight from windowLimits (used/cap/resetAt).
 *   - monthly has no window structure: monthlyCredits is the *remaining*
 *     balance, and usage.summary.totalMonthlyCredits is what was consumed this
 *     billing period, so used = totalMonthlyCredits, cap = used + remaining.
 */
function parseCommandCodeQuota(credits, summary, subscription) {
  const windows = []
  const fiveHour = credits?.windowLimits?.fiveHour
  if (fiveHour && Number(fiveHour.cap) > 0) {
    const used = Number(fiveHour.used) || 0
    const cap = Number(fiveHour.cap)
    windows.push({
      level: '5h',
      used,
      cap,
      percentUsed: Math.round((used / cap) * 10000) / 100,
      resetAt: Number(fiveHour.resetAt) || null,
    })
  }
  const weekly = credits?.windowLimits?.weekly
  if (weekly && Number(weekly.cap) > 0) {
    const used = Number(weekly.used) || 0
    const cap = Number(weekly.cap)
    windows.push({
      level: 'weekly',
      used,
      cap,
      percentUsed: Math.round((used / cap) * 10000) / 100,
      resetAt: Number(weekly.resetAt) || null,
    })
  }
  const remainingMonthly = Number(credits?.credits?.monthlyCredits) || 0
  const usedMonthly = Number(summary?.totalMonthlyCredits) || 0
  const monthlyCap = usedMonthly + remainingMonthly
  if (monthlyCap > 0) {
    windows.push({
      level: 'monthly',
      used: usedMonthly,
      cap: monthlyCap,
      percentUsed: Math.round((usedMonthly / monthlyCap) * 10000) / 100,
      resetAt: (() => {
        const raw = subscription?.data?.currentPeriodEnd
        if (!raw) return null
        const t = new Date(raw).getTime()
        return Number.isFinite(t) ? t : null
      })(),
    })
  }
  return windows
}

/** Call the Command Code usage endpoints once with the API key. */
async function fetchCommandCodeQuota() {
  const key = await readCommandCodeKey()
  if (!key) throw new Error("COMMANDCODE_API_KEY not found in .credentials.yaml")
  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'User-Agent': CMDCODE_UA,
    Origin: 'https://commandcode.ai',
    Referer: 'https://commandcode.ai/',
  }
  const getJson = async (path) => {
    const res = await fetch(`${CMDCODE_API_BASE}${path}`, {
      headers,
      signal: AbortSignal.timeout(liveConfig().network.timeoutMs),
    })
    if (!res.ok) throw new Error(`commandcode ${path} responded ${res.status}`)
    return res.json()
  }
  const [credits, summary, subscription] = await Promise.all([
    getJson('/alpha/billing/credits'),
    getJson('/alpha/usage/summary'),
    getJson('/alpha/billing/subscriptions').catch(() => null),
  ])
  const quota = parseCommandCodeQuota(credits, summary, subscription)
  return {
    ok: true,
    plan: subscription?.data?.planId ?? null,
    status: subscription?.data?.status ?? null,
    updatedAt: Math.floor(Date.now() / 1000),
    quota,
  }
}

export function apply(ctx, config) {
  // In-process fallback so a transient upstream failure after a success
  // still answers the UI without touching disk.
  let last = null

  // Live settings-managed config: defaults + user layer (settings.yaml).
  // The settings section re-resolves on every change; cache/timeout/credential
  // reads go through liveConfig() so panel edits apply without a restart.
  let source = () => config
  live = resolveConfig(config)
  installSettingsSection(ctx, settingsNamespace('dsh-balance-monitor'), Config, config, {
    setSource: (get) => { source = get },
    onChange: () => { live = resolveConfig(source()) },
  })

  // Official credentials seam (env → managed .credentials.yaml → .env).
  try { credentialsService = ctx.get('credentials') } catch { /* absent */ }

  ctx.connection.rpc.handle(
    '/balance',
    async (endpoint, _payload, signal) => {
      try {
        const apiKey = await readApiKey()
        if (!apiKey) {
          return {
            ok: false,
            error: {
              code: 'unauthorized',
              message: 'DEEPSEEK_API_KEY not found in .credentials.yaml',
              details: {},
            },
          }
        }
        const balance = await fetchBalance(apiKey, signal)
        const state = (await loadState()) ?? {}
        const date = today()
        const sameDay = state.date === date
        const sameCurrency = state.lastCurrency === undefined || state.lastCurrency === balance.currency

        // Cross-day or currency switch: reset the day-start baseline and the
        // spend ledger (never carry either across days or currencies).
        let dayStart = sameDay && sameCurrency ? state.dayStart : balance.total
        let spent = sameDay && sameCurrency ? (state.spent ?? 0) : 0
        const prevTotal = sameDay && sameCurrency ? state.lastTotal : balance.total

        // Official source first: with a platform token, read daily cost
        // straight from the DeepSeek dashboard usage API (same data as the
        // platform console). This is the accurate figure regardless of where
        // the API key was used from. The API returns one month per request,
        // so fetch the current month plus the previous one when the 7d/30d
        // windows may reach back across the month boundary. Falls back to
        // the balance estimate below on: missing token, transport/envelope
        // errors, or no rows at all.
        let spentSource = 'estimate'
        let spent7d = null
        let spent30d = null
        const platformToken = await readPlatformToken()
        if (platformToken) {
          try {
            const now = new Date()
            const months = [{ year: now.getFullYear(), month: now.getMonth() + 1 }]
            if (now.getDate() <= 29) {
              const prev = new Date(now.getFullYear(), now.getMonth(), 0) // last day of previous month
              months.push({ year: prev.getFullYear(), month: prev.getMonth() + 1 })
            }
            const monthRows = await Promise.all(
              months.map(({ year, month }) => fetchPlatformMonthDays(platformToken, year, month)),
            )
            const rows = monthRows.filter(Boolean).flat()
            if (rows.length > 0) {
              const today = localDate()
              const officialToday = sumWindow(rows, today, today)
              spent7d = sumWindow(rows, daysAgo(6), today)
              spent30d = sumWindow(rows, daysAgo(29), today)
              if (officialToday !== null) {
                spent = officialToday
                spentSource = 'official'
              } else {
                console.warn('[balance-monitor] platform usage api returned no row for today; falling back to balance estimate')
              }
            } else {
              console.warn('[balance-monitor] platform usage api returned no rows; falling back to balance estimate')
            }
          } catch (error) {
            console.warn('[balance-monitor] platform usage api failed; falling back to balance estimate:', error?.message ?? error)
          }
        }

        // Balance-delta ledger — only when the official source did not win.
        // Accumulate balance *drops* only. A refill (or refund) raises the
        // balance and is not consumption, so it must not inflate today's
        // spend — and must not wash out spend already accumulated.
        if (spentSource !== 'official') {
          if (prevTotal > balance.total) {
            spent += prevTotal - balance.total
            spent = Math.round(spent * 100) / 100 // keep float drift out of the ledger
          }
        }

        // Refill re-fills the bar: the baseline follows balance rises, so the
        // ratio bar reads full right after a top-up and every later drop is
        // visible immediately instead of being clamped at 100%.
        if (balance.total > dayStart) dayStart = balance.total

        await saveState({
          date,
          dayStart,
          lastTotal: balance.total,
          lastCurrency: balance.currency,
          spent,
          spent7d,
          spent30d,
          spentSource,
          updatedAt: Date.now(),
        })

        const snapshot = {
          date,
          dayStart,
          total: balance.total,
          currency: balance.currency,
          available: balance.available,
          spent,
          spent7d,
          spent30d,
          spentSource,
          updatedAt: Date.now(),
          stale: false,
        }
        last = snapshot
        return { ok: true, value: snapshot }
      } catch (error) {
        // Upstream failure: serve the freshest known numbers if we have any.
        // The in-process `last` is a snapshot (total/dayStart/spent) while the
        // disk state uses lastTotal/lastCurrency — accept both shapes.
        const platformTokenExpired = error && typeof error === 'object' && error.code === 'PLATFORM_TOKEN_EXPIRED'
        const fallback = last ?? (await loadState())
        const lastTotal = fallback && (typeof fallback.lastTotal === 'number' ? fallback.lastTotal : typeof fallback.total === 'number' ? fallback.total : NaN)
        if (fallback && Number.isFinite(lastTotal)) {
          return {
            ok: true,
            value: {
              date: fallback.date,
              dayStart: fallback.dayStart,
              total: lastTotal,
              currency: fallback.lastCurrency ?? fallback.currency ?? 'CNY',
              available: false,
              spent: fallback.spent ?? Math.max(0, fallback.dayStart - lastTotal),
              spent7d: fallback.spent7d ?? null,
              spent30d: fallback.spent30d ?? null,
              spentSource: fallback.spentSource ?? 'estimate',
              updatedAt: fallback.updatedAt ?? 0,
              stale: true,
              ...(platformTokenExpired ? { platformTokenExpired: true } : {}),
            },
          }
        }
        const message = error instanceof Error ? error.message : String(error)
        return {
          ok: false,
          error: {
            code: platformTokenExpired ? 'platform-token-expired' : 'internal',
            message: `balance query failed: ${message}`,
            details: {},
          },
        }
      }
    },
    { authority: 'loopback' },
  )

  // ---- Volcano Ark Agent Plan quota RPC ----------------------------------

  let arkCache = null // { at: number, payload: { ok, quota, ... } }

  ctx.connection.rpc.handle(
    '/ark-quota',
    async (_endpoint, _payload, _signal) => {
      try {
        const now = Date.now();
        if (arkCache !== null && now - arkCache.at < liveConfig().network.cacheMs) {
          return { ok: true, value: arkCache.payload };
        }
        const payload = await fetchArkQuota();
        arkCache = { at: now, payload };
        return { ok: true, value: payload };
      } catch (error) {
        if (arkCache !== null) {
          return {
            ok: true,
            value: { ...arkCache.payload, stale: true },
          };
        }
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          error: { code: 'internal', message: `ark quota query failed: ${message}`, details: {} },
        };
      }
    },
    { authority: 'loopback' },
  )

  // ---- Command Code quota RPC ---------------------------------------------

  let cmdcodeCache = null // { at: number, payload: { ok, quota, ... } }

  ctx.connection.rpc.handle(
    '/cmdcode-quota',
    async (_endpoint, _payload, _signal) => {
      try {
        const now = Date.now();
        if (cmdcodeCache !== null && now - cmdcodeCache.at < liveConfig().network.cacheMs) {
          return { ok: true, value: cmdcodeCache.payload };
        }
        const payload = await fetchCommandCodeQuota();
        cmdcodeCache = { at: now, payload };
        return { ok: true, value: payload };
      } catch (error) {
        if (cmdcodeCache !== null) {
          return {
            ok: true,
            value: { ...cmdcodeCache.payload, stale: true },
          };
        }
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          error: { code: 'internal', message: `commandcode quota query failed: ${message}`, details: {} },
        };
      }
    },
    { authority: 'loopback' },
  )
}

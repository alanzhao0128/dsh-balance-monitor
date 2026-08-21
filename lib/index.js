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

export const name = 'dsh-balance-monitor'
export const inject = ['connection']

const BALANCE_API = 'https://api.deepseek.com/user/balance'
/** Platform usage (cost) endpoint: per-day cost for one month, filterable by date. */
const PLATFORM_USAGE_URL = 'https://platform.deepseek.com/api/v0/usage/cost'
const PLATFORM_TIMEOUT_MS = 15000
const CREDENTIALS_FILE = '.credentials.yaml'
const STATE_FILE = 'balance-monitor.json'

// ---- Volcano Ark Agent Plan quota -----------------------------------------

/** How long the host caches an upstream GetAFPUsage response.
 *  Kept strictly below the client poll interval (60s) so every client poll
 *  triggers a fresh upstream fetch — a 60s cache + 60s poll could otherwise
 *  skip a refresh at the cache boundary and show data ~2 minutes stale. */
const ARK_CACHE_MS = 40000  // 40s < 60s client poll
const ARK_UPSTREAM_TIMEOUT_MS = 20000

function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

function today() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Extract the API key: env first, then the one-line YAML in .credentials.yaml. */
async function readApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
  try {
    const yaml = await readFile(join(dshHome(), CREDENTIALS_FILE), 'utf8')
    const match = yaml.match(/^\s*DEEPSEEK_API_KEY:\s*(\S+)/m)
    if (match) return match[1]
  } catch {
    // fall through
  }
  return null
}

/** Extract the optional platform session token (localStorage `userToken` of platform.deepseek.com). */
async function readPlatformToken() {
  if (process.env.DEEPSEEK_PLATFORM_TOKEN) return process.env.DEEPSEEK_PLATFORM_TOKEN
  try {
    const yaml = await readFile(join(dshHome(), CREDENTIALS_FILE), 'utf8')
    const match = yaml.match(/^\s*DEEPSEEK_PLATFORM_TOKEN:\s*(\S+)/m)
    if (match) return match[1]
  } catch {
    // fall through
  }
  return null
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
    signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`platform usage api responded ${response.status}`)
  const body = await response.json()
  const biz = body && typeof body === 'object' ? body.data : undefined
  if (body?.code !== 0 || biz === undefined || biz.biz_code !== 0) {
    const code = body?.code ?? biz?.biz_code
    if (code === 40002 || code === 40003) {
      throw new Error('DEEPSEEK_PLATFORM_TOKEN 已过期：请重新登录 platform.deepseek.com 并更新 userToken')
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

/** Read AK/SK: env first, then one-line YAML in .credentials.yaml. */
async function readArkCredentials() {
  const ak = process.env.ARK_ACCESS_KEY_ID
    ?? (await (async () => { try { const y = await readFile(join(dshHome(), CREDENTIALS_FILE), 'utf8'); return y.match(/^\s*ARK_ACCESS_KEY_ID:\s*(\S+)/m)?.[1]; } catch { return null; } })());
  const sk = process.env.ARK_SECRET_ACCESS_KEY
    ?? (await (async () => { try { const y = await readFile(join(dshHome(), CREDENTIALS_FILE), 'utf8'); return y.match(/^\s*ARK_SECRET_ACCESS_KEY:\s*(\S+)/m)?.[1]; } catch { return null; } })());
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
    signal: AbortSignal.timeout(ARK_UPSTREAM_TIMEOUT_MS),
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

export function apply(ctx, config) {
  // In-process fallback so a transient upstream failure after a success
  // still answers the UI without touching disk.
  let last = null

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
            },
          }
        }
        const message = error instanceof Error ? error.message : String(error)
        return {
          ok: false,
          error: { code: 'internal', message: `balance query failed: ${message}`, details: {} },
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
        if (arkCache !== null && now - arkCache.at < ARK_CACHE_MS) {
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
}

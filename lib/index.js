// dsh-balance-monitor — host half.
//
// One logical RPC channel, /balance, serving a single endpoint
// ("snapshot"). On every call it reads the DeepSeek API key from
// $DSH_HOME/.credentials.yaml (env DEEPSEEK_API_KEY wins), queries
// GET https://api.deepseek.com/user/balance, and folds the result into a
// tiny state file ($DSH_HOME/storages/balance-monitor.json) that keeps the
// day-start baseline across page refreshes and process restarts.
//
// Day-spend semantics: the first successful query of a calendar day (local
// time) becomes that day's baseline; spend = max(0, baseline - current).
// A refill pushes current above baseline, which clamps spend to 0 rather
// than going negative. When the upstream call fails and a state file exists,
// the last known numbers are returned with a `stale: true` flag so the UI
// can keep showing something instead of flashing an error.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-balance-monitor'
export const inject = ['connection']

const BALANCE_API = 'https://api.deepseek.com/user/balance'
const CREDENTIALS_FILE = '.credentials.yaml'
const STATE_FILE = 'balance-monitor.json'

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
    const match = yaml.match(/^DEEPSEEK_API_KEY:\s*(\S+)/m)
    if (match) return match[1]
  } catch {
    // fall through
  }
  return null
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

export function apply(ctx) {
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

        // Spend ledger: accumulate balance *drops* only. A refill (or refund)
        // raises the balance and is not consumption, so it must not inflate
        // today's spend — and must not wash out spend already accumulated.
        if (prevTotal > balance.total) {
          spent += prevTotal - balance.total
          spent = Math.round(spent * 100) / 100 // keep float drift out of the ledger
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
          updatedAt: Date.now(),
        })

        const snapshot = {
          date,
          dayStart,
          total: balance.total,
          currency: balance.currency,
          available: balance.available,
          spent,
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
}

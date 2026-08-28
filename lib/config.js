/**
 * dsh-balance-monitor — configuration contracts.
 *
 * The schemastery `Config` validates the shape a user writes in
 * cordis.yml / settings.yaml (every field optional); `resolveConfig`
 * performs explicit defaulting — the only place defaults are applied.
 *
 * Defaults mirror the historical hardcoded constants of the plugin, so an
 * upgrade is a no-op for every existing install. All fields resolve live
 * through the settings service except `credentials.file` (a path read at
 * RPC time — see lib/index.js) which is effectively restart-safe anyway.
 *
 * @module dsh-balance-monitor/config
 */
import z from '@deepseek-ai/schemastery'

/** Validate the plugin configuration shape. Unknown keys are tolerated. */
export const Config = z.object({
  ui: z.object({
    /** Whether the sidebar cards render at all. */
    showCard: z.boolean(),
    /** Sidebar card refresh interval (ms). */
    pollMs: z.number(),
    /** Used % at which the progress bar turns amber. */
    warnThreshold: z.number(),
    /** Used % at which the progress bar turns red. */
    dangerThreshold: z.number(),
  }),
  channels: z.object({
    /** Provider ids to render as fixed cards (independent of the session). */
    enabled: z.array(z.string()),
  }),
  network: z.object({
    /** Host-side cache lifetime for Ark / Command Code quota RPCs (ms). */
    cacheMs: z.number(),
    /** Upstream timeout for Ark / Command Code quota fetches (ms). */
    timeoutMs: z.number(),
    /** Upstream timeout for the DeepSeek platform usage fetch (ms). */
    platformTimeoutMs: z.number(),
  }),
  credentials: z.object({
    /** Credentials document filename relative to the harness home. */
    file: z.string(),
  }),
})

export const DEFAULTS = {
  ui: {
    showCard: true,
    pollMs: 60000,
    warnThreshold: 30,
    dangerThreshold: 70,
  },
  channels: {
    enabled: ['deepseek-official', 'huoshan', 'commandcode'],
  },
  network: {
    cacheMs: 40000, // 40s < 60s client poll
    timeoutMs: 20000,
    platformTimeoutMs: 15000,
  },
  credentials: {
    file: '.credentials.yaml',
  },
}

/** Normalize and default a raw configuration. */
export function resolveConfig(config = {}) {
  const ui = {
    showCard: config.ui?.showCard ?? DEFAULTS.ui.showCard,
    pollMs: config.ui?.pollMs ?? DEFAULTS.ui.pollMs,
    warnThreshold: config.ui?.warnThreshold ?? DEFAULTS.ui.warnThreshold,
    dangerThreshold: config.ui?.dangerThreshold ?? DEFAULTS.ui.dangerThreshold,
  }
  const channels = {
    enabled: Array.isArray(config.channels?.enabled) && config.channels.enabled.length > 0
      ? config.channels.enabled
      : DEFAULTS.channels.enabled,
  }
  const network = {
    cacheMs: config.network?.cacheMs ?? DEFAULTS.network.cacheMs,
    timeoutMs: config.network?.timeoutMs ?? DEFAULTS.network.timeoutMs,
    platformTimeoutMs: config.network?.platformTimeoutMs ?? DEFAULTS.network.platformTimeoutMs,
  }
  const credentials = {
    file: config.credentials?.file ?? DEFAULTS.credentials.file,
  }
  return { ui, channels, network, credentials }
}

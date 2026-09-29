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
 * `network.cpaBaseUrl` is the one field with no default at all — see its
 * comment in DEFAULTS.
 *
 * @module dsh-balance-monitor/config
 */
import z from '@deepseek-ai/schemastery'

/**
 * Mark a schema node editable without remounting in dsh >= 0.1.7 settings
 * (SettingsForms / config-editor volatile form). Forward-compatible with older
 * schemastery runtimes via extra('volatile', true).
 */
export function asVolatile(schema) {
  return typeof schema.volatile === 'function'
    ? schema.volatile()
    : schema.extra('volatile', true)
}

/** Validate the plugin configuration shape. Unknown keys are tolerated. */
export const Config = z.object({
  ui: asVolatile(z.object({
    /** Whether the sidebar cards render at all. */
    showCard: asVolatile(z.boolean()),
    /** Sidebar card refresh interval (ms). */
    pollMs: asVolatile(z.number()),
    /** Used % at which the progress bar turns amber. */
    warnThreshold: asVolatile(z.number()),
    /** Used % at which the progress bar turns red. */
    dangerThreshold: asVolatile(z.number()),
  })),
  network: asVolatile(z.object({
    /** Host-side cache lifetime for Ark / Command Code quota RPCs (ms). */
    cacheMs: asVolatile(z.number()),
    /** Upstream timeout for all quota/usage fetches (Ark, Command Code, DeepSeek platform) (ms). */
    timeoutMs: asVolatile(z.number()),
    /** CLIProxyAPI (CPA) base URL for the cliproxy channel's Google AI Pro quota. */
    cpaBaseUrl: asVolatile(z.string()),
    /** Snapshot age (ms) past which the host asks CPA for a fresh probe. */
    cpaStaleMs: asVolatile(z.number()),
  })),
  credentials: asVolatile(z.object({
    /** Credentials document filename relative to the harness home. */
    file: asVolatile(z.string()),
  })),
})

export const DEFAULTS = {
  ui: {
    showCard: true,
    pollMs: 60000,
    warnThreshold: 30,
    dangerThreshold: 70,
  },
  network: {
    cacheMs: 40000, // 40s < 60s client poll
    timeoutMs: 20000,
    // Deliberately empty. This points at the user's *own* CLIProxyAPI
    // deployment, so there is no sane shared default: shipping one would
    // publish that operator's private hostname to every install, and every
    // other user's requests would be sent to a stranger's server. The
    // cliproxy channel therefore stays dormant (error code `unconfigured`)
    // until the user fills the field in from the settings panel.
    cpaBaseUrl: '',
    // The `antigravity-priority` plugin probes on a schedule only while its own
    // `auto_apply` runtime setting is on, and that setting defaults to false —
    // so a CPA deployment nobody reconfigures serves one ancient snapshot
    // forever. Past this age the host treats the snapshot as stale and asks
    // for a probe itself. 20 min sits comfortably above the plugin's 15 min
    // default interval, so it only fires when the plugin really stopped.
    cpaStaleMs: 1200000,
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
  const network = {
    cacheMs: config.network?.cacheMs ?? DEFAULTS.network.cacheMs,
    timeoutMs: config.network?.timeoutMs ?? DEFAULTS.network.timeoutMs,
    // Tolerate a pasted `https://host/` (trailing slash) and stray spaces.
    cpaBaseUrl: String(config.network?.cpaBaseUrl ?? DEFAULTS.network.cpaBaseUrl).trim().replace(/\/+$/, ''),
    cpaStaleMs: config.network?.cpaStaleMs ?? DEFAULTS.network.cpaStaleMs,
  }
  const credentials = {
    file: config.credentials?.file ?? DEFAULTS.credentials.file,
  }
  return { ui, network, credentials }
}

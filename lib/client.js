// dsh-balance-monitor — browser half.
//
// A minimal sidebar footer action (rendered above Settings) showing the
// DeepSeek account balance and spend windows: today / 7 days / 30 days
// (official platform data when a platform token is configured, balance
// estimate for today only otherwise).
// Data rides the /balance channel provided by the host half; the card
// polls every 60s and re-polls when the tab becomes visible again.
//
// Hand-written classic-script bundle: the module table answers require()
// for the platform entries (react, react/jsx-runtime); everything else is
// inlined here. No build step, no CSS files — inline styles only, using the
// design-system variables so the card follows the active theme.

window.__ModuleLoader__.load({
  id: 'dsh-balance-monitor',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const { jsx, jsxs } = require('react/jsx-runtime');
    const { useCallback, useEffect, useState } = require('react');

    const NS = 'balance';
    const zh = {
      'balance.label': '余额',
      'period.today': '今日',
      'period.7d': '7日',
      'period.30d': '30日',
      'unavailable': '余额不可用',
      'tip.official': '官方用量数据（platform.deepseek.com）',
      'tip.estimate': '今日为余额差值估算，7日/30日不可用',
      'channel.unsupported': '暂不支持此渠道',
      'ark.label': '火山方舟',
      'ark.period.5h': '5h',
      'ark.period.weekly': '周',
      'ark.period.monthly': '月',
      'ark.reset': '已重置',
    };
    const en = {
      'balance.label': 'Balance',
      'period.today': 'Today',
      'period.7d': '7d',
      'period.30d': '30d',
      'unavailable': 'Balance unavailable',
      'tip.official': 'Official usage data (platform.deepseek.com)',
      'tip.estimate': 'Today is a balance-delta estimate; 7d/30d unavailable',
      'channel.unsupported': 'Channel not supported',
      'ark.label': 'Volcano Ark',
      'ark.period.5h': '5h',
      'ark.period.weekly': 'Wk',
      'ark.period.monthly': 'Mo',
      'ark.reset': 'Reset',
    };

    const POLL_MS = 60000;
    /** How often to re-check the current session's provider (local RPC, no network). */
    const PROVIDER_POLL_MS = 1000;

    /**
     * Channel registry: provider id → { type, label }.
     * `type` selects the card component; providers not present here render
     * the "unsupported channel" placeholder.
     */
    const CHANNELS = {
      'deepseek-official': { type: 'balance' },
      'huoshan': { type: 'ark-plan' },
    };

    const symbolOf = (currency) => (currency === 'USD' ? '$' : '¥');

    const fmt = (n, currency) => `${symbolOf(currency)}${n.toFixed(2)}`;

    /**
     * Compact form for the collapsed 36px rail: stair-stepped precision,
     * always floored so the shown value never overstates the balance.
     * ≤5 glyphs ("¥" + 4) fits the rail at 11px; the exact value lives in
     * the tooltip.
     *   < 10        → ¥1.69 (2 decimals, exact)
     *   10–99       → ¥12.3 (1 decimal)
     *   100–9999    → ¥123 / ¥1000 (integer)
     *   ≥ 10000     → ¥12k (integer k)
     */
    const compact = (n, currency) => {
      const s = symbolOf(currency);
      if (n >= 10000) return `${s}${Math.floor(n / 1000)}k`;
      if (n >= 100) return `${s}${Math.floor(n)}`;
      if (n >= 10) return `${s}${Math.floor(n * 10) / 10}`;
      return `${s}${n.toFixed(2)}`;
    };

    const cardStyle = {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      width: '100%',
      minWidth: 0,
      padding: '8px 10px',
      borderRadius: 12,
      boxSizing: 'border-box',
    };

    const rowStyle = {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
      minWidth: 0,
    };

    const labelStyle = {
      fontSize: 12,
      lineHeight: '16px',
      color: 'var(--dsw-alias-label-tertiary)',
      whiteSpace: 'nowrap',
    };

    const valueStyle = (stale) => ({
      fontSize: 14,
      lineHeight: '18px',
      fontWeight: 600,
      color: 'var(--dsw-alias-label-primary)',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      opacity: stale ? 0.55 : 1,
    });

    // Bottom row: three equal spend-window cells (今日 / 7日 / 30日),
    // separated from the balance row by a hairline.
    const periodRowStyle = {
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'space-between',
      gap: 6,
      minWidth: 0,
      paddingTop: 3,
      borderTop: '1px solid var(--dsw-alias-border-l2)',
    };

    const periodCellStyle = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 0,
      minWidth: 0,
      flex: '1 1 0',
    };

    const periodLabelStyle = {
      fontSize: 10,
      lineHeight: '12px',
      color: 'var(--dsw-alias-label-tertiary)',
      whiteSpace: 'nowrap',
    };

    const periodValueStyle = (stale) => ({
      fontSize: 12,
      lineHeight: '15px',
      fontWeight: 600,
      color: 'var(--dsw-alias-label-primary)',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      opacity: stale ? 0.55 : 1,
    });

    const railStyle = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 36,
      height: 36,
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--dsw-alias-label-secondary)',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      userSelect: 'none',
    };

    const sourceOf = (snap) => (snap && snap.spentSource === 'official' ? 'official' : 'estimate');

    /** One spend-window cell: label on top, value below. */
    function PeriodCell({ label, value, currency, stale, title }) {
      return jsxs('div', {
        style: periodCellStyle,
        title,
        children: [
          jsx('span', { style: periodLabelStyle, children: label }),
          jsx('span', {
            style: periodValueStyle(stale),
            children: value != null && Number.isFinite(value) ? fmt(value, currency) : '—',
          }),
        ],
      });
    }

    function BalanceCard({ wide, t, refresh }) {
      const [snap, setSnap] = useState(null);

      const tick = useCallback(async () => {
        try {
          const result = await refresh();
          if (result && result.ok && result.value) setSnap(result.value);
          else setSnap(null);
        } catch {
          // keep the last known numbers
        }
      }, [refresh]);

      useEffect(() => {
        tick();
        const timer = window.setInterval(tick, POLL_MS);
        const onVisible = () => {
          if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [tick]);

      if (!wide) {
        return jsx(
          'div',
          {
            style: railStyle,
            title: snap ? `${t('balance.label')} ${fmt(snap.total, snap.currency)}` : t('unavailable'),
            children: snap ? compact(snap.total, snap.currency) : '—',
          },
        );
      }

      const stale = snap ? snap.stale === true : false;
      const source = sourceOf(snap);
      const sourceTip = source === 'official' ? t('tip.official') : t('tip.estimate');

      return jsxs('div', {
        style: cardStyle,
        title: snap ? sourceTip : undefined,
        children: [
          jsxs('div', {
            style: rowStyle,
            children: [
              jsx('span', { style: labelStyle, children: t('balance.label') }),
              jsx('strong', {
                style: valueStyle(stale),
                children: snap ? fmt(snap.total, snap.currency) : '—',
              }),
            ],
          }),
          jsxs('div', {
            style: periodRowStyle,
            children: [
              jsx(PeriodCell, {
                label: t('period.today'),
                value: snap ? snap.spent : null,
                currency: snap ? snap.currency : 'CNY',
                stale,
                title: sourceTip,
              }),
              jsx(PeriodCell, {
                label: t('period.7d'),
                value: snap ? snap.spent7d : null,
                currency: snap ? snap.currency : 'CNY',
                stale,
                title: sourceTip,
              }),
              jsx(PeriodCell, {
                label: t('period.30d'),
                value: snap ? snap.spent30d : null,
                currency: snap ? snap.currency : 'CNY',
                stale,
                title: sourceTip,
              }),
            ],
          }),
        ],
      });
    }

    /**
     * Unsupported-channel placeholder: same footprint as the balance card so
     * the footer stays stable, but shows the channel name and a notice.
     */
    function UnsupportedCard({ wide, t, name }) {
      if (!wide) {
        return jsx(
          'div',
          {
            style: railStyle,
            title: `${name} · ${t('channel.unsupported')}`,
            children: '—',
          },
        );
      }
      return jsxs('div', {
        style: cardStyle,
        title: `${name} · ${t('channel.unsupported')}`,
        children: [
          jsxs('div', {
            style: rowStyle,
            children: [
              jsx('span', {
                style: { ...labelStyle, overflow: 'hidden', textOverflow: 'ellipsis' },
                children: name,
              }),
              jsx('strong', { style: valueStyle(false), children: '—' }),
            ],
          }),
          jsx('div', {
            style: {
              fontSize: 11,
              lineHeight: '14px',
              color: 'var(--dsw-alias-label-tertiary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
            children: t('channel.unsupported'),
          }),
        ],
      });
    }

    // ---- Volcano Ark Agent Plan card --------------------------------------

    const ARK_POLL_MS = 60000;
    const ARK_LEVEL_ORDER = ['5h', 'weekly', 'monthly'];

    const arkColorOf = (percentUsed) => {
      if (percentUsed >= 70) return '#e5484d';
      if (percentUsed >= 30) return '#f5a524';
      return '#46a758';
    };

    /** Reset countdown: epoch-ms → `04h 52m` / `00h 05m` / `2d 09h 50m`.
     *  Hours and minutes are always zero-padded to 2 digits so the digits
     *  line up when right-aligned; the day prefix appears only when > 0. */
    const fmtReset = (ts) => {
      if (!ts) return '—';
      const diff = ts - Date.now();
      if (diff <= 0) return '已重置';
      const totalMin = Math.floor(diff / 60000);
      const d = Math.floor(totalMin / 1440);
      const h = Math.floor((totalMin % 1440) / 60);
      const m = totalMin % 60;
      const pad = (n) => String(n).padStart(2, '0');
      const parts = [];
      if (d > 0) parts.push(`${d}d`);
      parts.push(`${pad(h)}h`);
      parts.push(`${pad(m)}m`);
      return parts.join(' ');
    };

    function ArkPlanCard({ wide, t, refreshArk }) {
      const [state, setState] = useState(null);

      const tick = useCallback(async () => {
        try {
          const result = await refreshArk();
          if (result && result.ok && result.value) setState(result.value);
        } catch {
          // keep the last known numbers
        }
      }, [refreshArk]);

      useEffect(() => {
        tick();
        const timer = window.setInterval(tick, ARK_POLL_MS);
        const onVisible = () => {
          if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [tick]);

      const quota = state ? state.quota : [];
      const rows = ARK_LEVEL_ORDER
        .map((level) => quota.find((q) => q.level === level))
        .filter(Boolean);
      const stale = state ? state.stale === true : false;
      // Collapsed rail shows the 5h window (the near-term quota the user
      // cares about most); fall back to the most-used window if 5h is absent.
      const railRow = (quota.find((q) => q.level === '5h') ?? (rows.length > 0
        ? rows.reduce((a, b) => (a.percentUsed > b.percentUsed ? a : b))
        : null)) || null;

      if (!wide) {
        return jsx(
          'div',
          {
            style: railStyle,
            title: railRow
              ? `${t('ark.label')} · ${t(`ark.period.${railRow.level}`) || railRow.level} ${Math.round(railRow.percentUsed)}%`
              : t('ark.label'),
            children: railRow ? `${Math.round(railRow.percentUsed)}%` : '—',
          },
        );
      }

      return jsxs('div', {
        style: cardStyle,
        title: t('ark.label'),
        children: [
          jsxs('div', {
            style: rowStyle,
            children: [
              jsx('span', { style: labelStyle, children: t('ark.label') }),
            ],
          }),
          jsxs('div', {
            style: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
            children: rows.map((item) => {
              const label = t(`ark.period.${item.level}`) || item.level;
              const p = item.percentUsed;
              return jsxs('div', {
                key: item.level,
                style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
                children: [
                  jsx('span', {
                    style: { flex: 'none', width: 22, fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap' },
                    children: label,
                  }),
                  jsxs('div', {
                    style: { flex: 'none', width: 84, height: 4, borderRadius: 2, background: 'var(--dsw-alias-track-bg, rgba(128,128,128,0.25))', overflow: 'hidden' },
                    children: [
                      jsx('div', {
                        style: { height: '100%', width: p + '%', borderRadius: 2, background: arkColorOf(p), transition: 'width .3s', opacity: stale ? 0.55 : 1 },
                      }),
                    ],
                  }),
                  jsx('span', {
                    style: { flex: 'none', minWidth: 34, textAlign: 'right', fontSize: 11, lineHeight: '16px', fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-primary)', opacity: stale ? 0.55 : 1 },
                    children: Math.round(item.percentUsed) + '%',
                  }),
                  jsx('span', {
                    style: { flex: 'none', marginLeft: 'auto', fontSize: 10, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
                    children: fmtReset(item.resetAt),
                  }),
                ],
              });
            }),
          }),
        ],
      });
    }

    /**
     * Channel-aware shell: watches the current session's provider and renders
     * the balance card for registered channels, the unsupported placeholder
     * otherwise, and nothing while there is no current session (or the
     * provider is not yet known). Provider is tracked by subscribing to the
     * sessions list (session switches land instantly) plus a light 5s poll
     * (in-session model switches) plus the adapters-updated remote event.
     */
    function ChannelCard({ wide, t, refresh, refreshArk, sessions, connection, remote, queryProvider }) {
      const [state, setState] = useState(null); // { sessionId, provider, name } | null

      useEffect(() => {
        let alive = true;
        let sessionId = null;

        const check = async () => {
          const next = sessions.list.getSnapshot().current;
          if (next !== sessionId) sessionId = next;
          if (!sessionId) {
            if (alive) setState(null);
            return;
          }
          try {
            const value = await queryProvider(sessionId);
            if (!alive || !value) return;
            const provider = value.current && value.current.provider;
            const name = Array.isArray(value.groups)
              ? (value.groups.find((g) => g && g.id === provider) || {}).name || provider
              : provider;
            setState({ sessionId, provider, name });
          } catch {
            // keep the last known provider; the next poll retries
          }
        };

        check();
        const stopList = sessions.list.subscribe(check);
        const timer = window.setInterval(check, PROVIDER_POLL_MS);
        const stopRemote = remote ? remote.$on('llm/adapters-updated', check) : null;
        return () => {
          alive = false;
          stopList && stopList();
          window.clearInterval(timer);
          if (stopRemote) stopRemote();
        };
      }, []);

      if (!state || !state.provider) return null;
      if (CHANNELS[state.provider]) {
        const ch = CHANNELS[state.provider];
        if (ch.type === 'balance') return jsx(BalanceCard, { wide, t, refresh });
        if (ch.type === 'ark-plan') return jsx(ArkPlanCard, { wide, t, refreshArk });
      }
      return jsx(UnsupportedCard, { wide, t, name: state.name });
    }

    const inject = ['connection', 'slots', 'locale', 'sessions', 'remote'];

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        'balance-monitor: dictionaries',
      );

      const connection = ctx.get('connection');
      const sessions = ctx.get('sessions');
      const remote = ctx.get('remote');
      const refresh = () => connection.rpc.call('/balance', 'snapshot', {});
      const refreshArk = () => connection.rpc.call('/ark-quota', 'snapshot', {});
      const queryProvider = async (sessionId) => {
        const { result } = await connection.api.sessions.models({ sessionId });
        return result && result.ok ? result.value : null;
      };

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        {
          name: 'sidebar.footer.action',
          id: 'balance-monitor',
          locale: NS,
          inject: () => ({ refresh, refreshArk, sessions, connection, remote, queryProvider }),
        },
        ChannelCard,
      ));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});

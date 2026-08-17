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
    };
    const en = {
      'balance.label': 'Balance',
      'period.today': 'Today',
      'period.7d': '7d',
      'period.30d': '30d',
      'unavailable': 'Balance unavailable',
      'tip.official': 'Official usage data (platform.deepseek.com)',
      'tip.estimate': 'Today is a balance-delta estimate; 7d/30d unavailable',
    };

    const POLL_MS = 60000;

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

    const inject = ['connection', 'slots', 'locale'];

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        'balance-monitor: dictionaries',
      );

      const connection = ctx.get('connection');
      const refresh = () => connection.rpc.call('/balance', 'snapshot', {});

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        {
          name: 'sidebar.footer.action',
          id: 'balance-monitor',
          locale: NS,
          inject: () => ({ refresh }),
        },
        BalanceCard,
      ));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});

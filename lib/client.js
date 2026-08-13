// dsh-balance-monitor — browser half.
//
// A minimal sidebar footer action (rendered above Settings) showing the
// DeepSeek account balance, a thin remaining-ratio bar, and today's spend.
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
      'today.spent': '今日花费',
      'unavailable': '余额不可用',
    };
    const en = {
      'balance.label': 'Balance',
      'today.spent': 'Spent today',
      'unavailable': 'Balance unavailable',
    };

    const POLL_MS = 60000;

    const symbolOf = (currency) => (currency === 'USD' ? '$' : '¥');

    const fmt = (n, currency) => `${symbolOf(currency)}${n.toFixed(2)}`;

    /** Short form for the collapsed rail: no decimals, thousands compacted. */
    const compact = (n, currency) => {
      const s = symbolOf(currency);
      if (n >= 10000) return `${s}${(n / 1000).toFixed(1)}k`;
      return `${s}${Math.round(n)}`;
    };

    /** Remaining fraction of the day-start baseline, clamped to [0, 1]. */
    const ratioOf = (snap) => {
      if (!snap || !(snap.dayStart > 0)) return 0;
      return Math.min(1, Math.max(0, snap.total / snap.dayStart));
    };

    const fillColor = (ratio) =>
      ratio >= 0.2
        ? 'var(--dsw-static-deepseek-500)'
        : ratio >= 0.1
          ? 'var(--dsw-static-amber-500)'
          : 'var(--dsw-static-red-500)';

    const trackStyle = {
      width: '100%',
      height: 3,
      borderRadius: 999,
      background: 'var(--dsw-alias-border-l2)',
      overflow: 'hidden',
      opacity: 0.9,
    };

    const fillStyle = (ratio, stale) => ({
      height: '100%',
      borderRadius: 999,
      background: stale ? 'var(--dsw-alias-label-tertiary)' : fillColor(ratio),
      width: `${(ratio * 100).toFixed(1)}%`,
      transition: 'width 300ms ease',
      opacity: stale ? 0.55 : 1,
    });

    const cardStyle = {
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
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

    const spentStyle = {
      fontSize: 11,
      lineHeight: '14px',
      color: 'var(--dsw-alias-label-tertiary)',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    };

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

    function BalanceCard({ wide, t, refresh }) {
      const [snap, setSnap] = useState(null);

      const tick = useCallback(async () => {
        try {
          const result = await refresh();
          if (result && result.ok && result.value) setSnap(result.value);
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

      const ratio = ratioOf(snap);
      const stale = snap ? snap.stale === true : false;

      return jsxs('div', {
        style: cardStyle,
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
          jsx('div', {
            style: trackStyle,
            children: jsx('div', { style: fillStyle(ratio, stale) }),
          }),
          jsx('div', {
            style: spentStyle,
            children: snap ? `${t('today.spent')} ${fmt(snap.spent, snap.currency)}` : t('unavailable'),
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

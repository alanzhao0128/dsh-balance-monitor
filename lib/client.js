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
      'tip.tokenExpired': '官方用量 token 已过期，请到设置页更新 DEEPSEEK_PLATFORM_TOKEN',
      'channel.unsupported': '暂不支持此渠道',
      'ark.label': '火山方舟',
      'ark.period.5h': '5h',
      'ark.period.weekly': '周',
      'ark.period.monthly': '月',
      'ark.reset': '已重置',
      'cmd.label': 'Command Code',
      // settings page
      'settings.nav': '余额监控',
      'settings.title': '余额监控',
      'settings.intro': '配置侧边栏余额卡片的显示与刷新行为。改动保存后即时生效（个别参数重启后生效）。',
      'settings.group.display': '显示',
      'settings.group.channels': '渠道',
      'settings.group.refresh': '刷新',
      'settings.group.network': '网络',
      'settings.group.credentials': '凭证',
      'settings.showCard': '显示侧边栏卡片',
      'settings.showCardHint': '关闭后所有渠道卡片都不显示',
      'settings.warnThreshold': '黄色阈值（%）',
      'settings.warnThresholdHint': '用量达到该百分比进度条变黄',
      'settings.dangerThreshold': '红色阈值（%）',
      'settings.dangerThresholdHint': '用量达到该百分比进度条变红',
      'settings.channel.deepseek-official': 'DeepSeek 官方',
      'settings.channel.huoshan': '火山方舟',
      'settings.channel.commandcode': 'Command Code',
      'settings.channelHint': '勾选的渠道在侧边栏固定显示卡片（同时显示，不跟随会话切换）；未勾选的渠道隐藏',
      'settings.pollSec': '卡片刷新间隔（秒）',
      'settings.pollSecHint': '默认 60 秒，与 DeepSeek 官方节奏一致',
      'settings.cacheSec': '服务端缓存（秒）',
      'settings.cacheSecHint': '默认 40 秒，建议保持低于卡片刷新间隔',
      'settings.timeoutSec': '上游超时（秒）',
      'settings.timeoutSecHint': '火山方舟 / Command Code 请求超时',
      'settings.platformTimeoutSec': '官方用量超时（秒）',
      'settings.platformTimeoutSecHint': 'DeepSeek 平台用量请求超时',
      'settings.credentialFile': '凭证文件',
      'settings.credentialFileHint': '凭证文档文件名（相对 DSH 主目录），默认 .credentials.yaml',
      'settings.platformToken': 'DEEPSEEK_PLATFORM_TOKEN（官方用量网页会话 token）',
      'settings.platformTokenHint1': '它是什么：DeepSeek 官网（platform.deepseek.com）网页登录态的会话令牌。API Key 只能查余额，查「今日/7日/30日花费」必须用这个网页 token 调官方用量接口。',
      'settings.platformTokenHint2': '怎么取：浏览器登录 platform.deepseek.com → 按 F12 打开 DevTools → Console 标签 → 粘贴执行 JSON.parse(localStorage.getItem(\'userToken\')).value → 复制输出的一长串字符。',
      'settings.platformTokenHint3': '用来干什么：把输出粘贴到下面并保存，插件就通过官方凭证服务写入 ~/.dsh/.credentials.yaml，卡片显示真实的官方用量（而非余额差值估算）。注意：它是网页会话，会过期（官方返回 40002/40003），过期后卡片会提示，在此重新粘贴新 token 即可。',
      'settings.tokenConfigured': '已配置',
      'settings.tokenMissing': '未配置',
      'settings.tokenWritable': '（可写）',
      'settings.tokenReadonly': '（只读）',
      'settings.save': '保存',
      'settings.saving': '保存中…',
      'settings.discard': '放弃修改',
      'settings.saved': '已保存',
      'settings.failed': '保存失败',
      'settings.readonly': '设置文档不可写（只读环境）。',
    };
    const en = {
      'balance.label': 'Balance',
      'period.today': 'Today',
      'period.7d': '7d',
      'period.30d': '30d',
      'unavailable': 'Balance unavailable',
      'tip.official': 'Official usage data (platform.deepseek.com)',
      'tip.estimate': 'Today is a balance-delta estimate; 7d/30d unavailable',
      'tip.tokenExpired': 'Official usage token expired — update DEEPSEEK_PLATFORM_TOKEN in the settings page',
      'channel.unsupported': 'Channel not supported',
      'ark.label': 'Volcano Ark',
      'ark.period.5h': '5h',
      'ark.period.weekly': 'Wk',
      'ark.period.monthly': 'Mo',
      'ark.reset': 'Reset',
      'cmd.label': 'Command Code',
      // settings page
      'settings.nav': 'Balance Monitor',
      'settings.title': 'Balance Monitor',
      'settings.intro': 'Configure the sidebar balance card display and refresh behaviour. Changes apply immediately after saving (a few after restart).',
      'settings.group.display': 'Display',
      'settings.group.channels': 'Channels',
      'settings.group.refresh': 'Refresh',
      'settings.group.network': 'Network',
      'settings.group.credentials': 'Credentials',
      'settings.showCard': 'Show sidebar cards',
      'settings.showCardHint': 'Turning this off hides all channel cards',
      'settings.warnThreshold': 'Amber threshold (%)',
      'settings.warnThresholdHint': 'Bar turns amber at this used %',
      'settings.dangerThreshold': 'Red threshold (%)',
      'settings.dangerThresholdHint': 'Bar turns red at this used %',
      'settings.channel.deepseek-official': 'DeepSeek official',
      'settings.channel.huoshan': 'Volcano Ark',
      'settings.channel.commandcode': 'Command Code',
      'settings.channelHint': 'Checked channels render fixed cards in the sidebar (all at once, not following the session); unchecked ones are hidden',
      'settings.pollSec': 'Card refresh interval (s)',
      'settings.pollSecHint': 'Default 60 s, matching DeepSeek official cadence',
      'settings.cacheSec': 'Host cache (s)',
      'settings.cacheSecHint': 'Default 40 s; keep below the card refresh interval',
      'settings.timeoutSec': 'Upstream timeout (s)',
      'settings.timeoutSecHint': 'Volcano Ark / Command Code request timeout',
      'settings.platformTimeoutSec': 'Official usage timeout (s)',
      'settings.platformTimeoutSecHint': 'DeepSeek platform usage request timeout',
      'settings.credentialFile': 'Credentials file',
      'settings.credentialFileHint': 'Credentials document filename (relative to DSH home); default .credentials.yaml',
      'settings.platformToken': 'DEEPSEEK_PLATFORM_TOKEN (official usage web-session token)',
      'settings.platformTokenHint1': 'What it is: the session token of the DeepSeek website (platform.deepseek.com). The API key only queries the balance; the today/7d/30d spend requires this web token against the official usage API.',
      'settings.platformTokenHint2': 'How to get it: sign in at platform.deepseek.com → press F12 to open DevTools → Console tab → paste and run JSON.parse(localStorage.getItem(\'userToken\')).value → copy the long string it prints.',
      'settings.platformTokenHint3': 'What it does: paste it below and save; the plugin writes it into ~/.dsh/.credentials.yaml through the official credentials service, and the card shows real official usage (instead of a balance-delta estimate). Note: it is a web session and expires (official code 40002/40003); when it does, the card warns and you re-paste a fresh token here.',
      'settings.tokenConfigured': 'Configured',
      'settings.tokenMissing': 'Not configured',
      'settings.tokenWritable': '(writable)',
      'settings.tokenReadonly': '(read-only)',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.discard': 'Discard',
      'settings.saved': 'Saved',
      'settings.failed': 'Save failed',
      'settings.readonly': 'Settings document is not writable (read-only environment).',
    };

    const SETTINGS_NS = 'dsh-balance-monitor';

    /**
     * Settings namespace defaults — must mirror lib/config.js DEFAULTS.
     * The settings service resolves the namespace with schemastery (which
     * fills nothing for absent keys), so the panel shows these when the
     * stored document has no value — same defaults the host applies.
     */
    const DEFAULTS = {
      'ui.showCard': true,
      'ui.pollMs': 60000,
      'ui.warnThreshold': 30,
      'ui.dangerThreshold': 70,
      'channels.enabled': ['deepseek-official', 'huoshan', 'commandcode'],
      'network.cacheMs': 40000,
      'network.timeoutMs': 20000,
      'network.platformTimeoutMs': 15000,
      'credentials.file': '.credentials.yaml',
    };

    /** Read one dotted path from a settings snapshot value. */
    const readPath = (value, path) => {
      let node = value;
      for (const key of path) {
        if (node === null || node === undefined || typeof node !== 'object') return undefined;
        node = node[key];
      }
      return node;
    };

    /** A settings-scope-backed value reader: snapshot → value with defaults. */
    const makeScopeReader = (scope, DEFAULTS) => {
      const get = (path) => {
        if (!scope) return DEFAULTS[path.join('.')];
        const snap = scope.getSnapshot();
        const value = snap && snap.status === 'ready' ? snap.value : undefined;
        const stored = readPath(value, path);
        return stored !== undefined ? stored : DEFAULTS[path.join('.')];
      };
      return get;
    };


    /**
     * Channel registry: provider id → { type, label }.
     * `type` selects the card component; providers not present here render
     * the "unsupported channel" placeholder.
     */
    const CHANNELS = {
      'deepseek-official': { type: 'balance' },
      'huoshan': { type: 'ark-plan' },
      'commandcode': { type: 'cmdcode-plan' },
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

    function BalanceCard({ wide, t, refresh, pollMs }) {
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
        const timer = window.setInterval(tick, pollMs);
        const onVisible = () => {
          if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [tick, pollMs]);

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
      const tokenExpired = snap ? snap.platformTokenExpired === true : false;

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
          tokenExpired ? jsx('div', {
            style: {
              fontSize: 10.5,
              lineHeight: '13px',
              color: 'var(--dsw-alias-state-error-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
            title: t('tip.tokenExpired'),
            children: t('tip.tokenExpired'),
          }) : null,
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

    const ARK_LEVEL_ORDER = ['5h', 'weekly', 'monthly'];

    const arkColorOf = (percentUsed, warn, danger) => {
      if (percentUsed >= danger) return '#e5484d';
      if (percentUsed >= warn) return '#f5a524';
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

    function ArkPlanCard({ wide, t, refreshArk, pollMs, warn, danger }) {
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
        const timer = window.setInterval(tick, pollMs);
        const onVisible = () => {
          if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [tick, pollMs]);

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
                        style: { height: '100%', width: p + '%', borderRadius: 2, background: arkColorOf(p, warn, danger), transition: 'width .3s', opacity: stale ? 0.55 : 1 },
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

    // ---- Command Code card -------------------------------------------------

    const CMD_LEVEL_ORDER = ['5h', 'weekly', 'monthly'];
    /** planId → short display name; unknown ids fall back to the raw id. */
    const CMD_PLAN_NAMES = {
      'individual-goat': 'GOAT',
      'individual-pro': 'Pro',
      'individual-max': 'Max',
      'individual-go': 'Go',
      'team-goat': 'GOAT Team',
      'team-pro': 'Pro Team',
      'team-max': 'Max Team',
      'team-go': 'Go Team',
      'provider': 'Provider',
    };

    function CmdCodeCard({ wide, t, refreshCmdCode, pollMs, warn, danger }) {
      const [state, setState] = useState(null);

      const tick = useCallback(async () => {
        try {
          const result = await refreshCmdCode();
          if (result && result.ok && result.value) setState(result.value);
        } catch {
          // keep the last known numbers
        }
      }, [refreshCmdCode]);

      useEffect(() => {
        tick();
        const timer = window.setInterval(tick, pollMs);
        const onVisible = () => {
          if (document.visibilityState === 'visible') tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          window.clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [tick, pollMs]);

      const quota = state ? state.quota : [];
      const rows = CMD_LEVEL_ORDER
        .map((level) => quota.find((q) => q.level === level))
        .filter(Boolean);
      const stale = state ? state.stale === true : false;
      const planName = state && state.plan
        ? (CMD_PLAN_NAMES[state.plan] || state.plan)
        : null;
      // Collapsed rail shows the 5h window; fall back to the most-used window.
      const railRow = (quota.find((q) => q.level === '5h') ?? (rows.length > 0
        ? rows.reduce((a, b) => (a.percentUsed > b.percentUsed ? a : b))
        : null)) || null;

      if (!wide) {
        return jsx(
          'div',
          {
            style: railStyle,
            title: railRow
              ? `${t('cmd.label')} · ${t(`ark.period.${railRow.level}`) || railRow.level} ${Math.round(railRow.percentUsed)}%`
              : t('cmd.label'),
            children: railRow ? `${Math.round(railRow.percentUsed)}%` : '—',
          },
        );
      }

      return jsxs('div', {
        style: cardStyle,
        title: t('cmd.label'),
        children: [
          jsxs('div', {
            style: rowStyle,
            children: [
              jsx('span', { style: labelStyle, children: planName ? `${t('cmd.label')} · ${planName}` : t('cmd.label') }),
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
                        style: { height: '100%', width: p + '%', borderRadius: 2, background: arkColorOf(p, warn, danger), transition: 'width .3s', opacity: stale ? 0.55 : 1 },
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

    /** Re-render whenever the settings scope value changes (live config). */
    function useScopeVersion(scope) {
      const [, force] = useState(0);
      useEffect(() => {
        if (!scope) return undefined;
        return scope.subscribe(() => force((n) => n + 1));
      }, [scope]);
    }

    /** One field spec of the settings form. */
    const FIELDS = [
      // ---- 显示 ----
      { path: ['ui', 'showCard'], type: 'toggle', group: 'display', labelKey: 'settings.showCard', hintKey: 'settings.showCardHint' },
      { path: ['ui', 'warnThreshold'], type: 'number', group: 'display', labelKey: 'settings.warnThreshold', hintKey: 'settings.warnThresholdHint' },
      { path: ['ui', 'dangerThreshold'], type: 'number', group: 'display', labelKey: 'settings.dangerThreshold', hintKey: 'settings.dangerThresholdHint' },
      // ---- 渠道 ----
      { path: ['channels', 'enabled'], type: 'channel-toggle', group: 'channels', hintKey: 'settings.channelHint' },
      // ---- 刷新 ----
      { path: ['ui', 'pollMs'], type: 'secMs', group: 'refresh', labelKey: 'settings.pollSec', hintKey: 'settings.pollSecHint' },
      // ---- 网络 ----
      { path: ['network', 'cacheMs'], type: 'secMs', group: 'network', labelKey: 'settings.cacheSec', hintKey: 'settings.cacheSecHint' },
      { path: ['network', 'timeoutMs'], type: 'secMs', group: 'network', labelKey: 'settings.timeoutSec', hintKey: 'settings.timeoutSecHint' },
      { path: ['network', 'platformTimeoutMs'], type: 'secMs', group: 'network', labelKey: 'settings.platformTimeoutSec', hintKey: 'settings.platformTimeoutSecHint' },
      // ---- 凭证 ----
      { path: ['credentials', 'file'], type: 'text', group: 'credentials', labelKey: 'settings.credentialFile', hintKey: 'settings.credentialFileHint' },
    ];

    const GROUPS = [
      { id: 'display', labelKey: 'settings.group.display' },
      { id: 'channels', labelKey: 'settings.group.channels' },
      { id: 'refresh', labelKey: 'settings.group.refresh' },
      { id: 'network', labelKey: 'settings.group.network' },
      { id: 'credentials', labelKey: 'settings.group.credentials' },
    ];

    const pathKey = (path) => path.join('.');

    /**
     * Settings page (settings.section slot): edits the dsh-balance-monitor
     * namespace through ctx.settingsScope — staged drafts + Save/Discard,
     * exactly like the official plugin cards and memory-lite.
     */
    function SettingsPage({ t, connection, scope }) {
      // `t` is injected by the slot's locale mechanism (locale: NS), same as
      // the sidebar cards; the dictionary fallback keeps rendering sane if a
      // host ever mounts the slot without locale wiring.
      const dict = zh;
      const tr = (key) => (t ? t(key) : dict[key]);
      const [draft, setDraft] = useState({});
      const [saving, setSaving] = useState(false);
      const [saved, setSaved] = useState(false);
      const [failed, setFailed] = useState(false);
      // Token box: input state + credential describe (configured? writable?).
      const [tokenDraft, setTokenDraft] = useState('');
      const [tokenInfo, setTokenInfo] = useState(null);
      const [tokenSaving, setTokenSaving] = useState(false);
      const [tokenSaved, setTokenSaved] = useState(false);
      const [tokenFailed, setTokenFailed] = useState(false);
      const [, force] = useState(0);

      useEffect(() => {
        if (!scope) return undefined;
        return scope.subscribe(() => force((n) => n + 1));
      }, [scope]);

      // Describe DEEPSEEK_PLATFORM_TOKEN once on mount (configured? writable?).
      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const { result } = await connection.api.credentials.describe({ refs: ['DEEPSEEK_PLATFORM_TOKEN'] });
            if (alive && result && result.ok && result.value) {
              setTokenInfo(result.value.credentials['DEEPSEEK_PLATFORM_TOKEN'] || null);
            }
          } catch {
            if (alive) setTokenInfo(null);
          }
        })();
        return () => { alive = false; };
      }, [connection]);

      const snapshot = scope ? scope.getSnapshot() : null;
      const value = snapshot && snapshot.status === 'ready' ? snapshot.value : undefined;
      const writable = snapshot ? snapshot.writable : false;

      const setField = (key, val) => {
        setDraft((d) => ({ ...d, [key]: val }));
        setSaved(false);
        setFailed(false);
      };

      const fieldValue = (spec) => {
        const key = pathKey(spec.path);
        if (draft[key] !== undefined) return draft[key];
        let stored = readPath(value, spec.path);
        if (stored === undefined) stored = DEFAULTS[key];
        // Seconds-unit fields display in seconds (the document stores ms).
        if (spec.type === 'secMs' && typeof stored === 'number') return stored / 1000;
        return stored;
      };

      const save = async () => {
        if (!scope || Object.keys(draft).length === 0) return;
        setSaving(true);
        setFailed(false);
        try {
          const ops = Object.entries(draft).map(([key, val]) => {
            const path = key.split('.');
            const spec = FIELDS.find((f) => pathKey(f.path) === key);
            if (spec && (spec.type === 'number' || spec.type === 'secMs')) {
              if (val === '' || val === null || val === undefined) {
                return { op: 'unset', path };
              }
              const n = Number(val);
              if (!Number.isFinite(n)) return null;
              // Seconds-unit fields store milliseconds in the document.
              return { op: 'set', path, value: spec.type === 'secMs' ? Math.round(n * 1000) : n };
            }
            if (spec && spec.type === 'text' && (val === '' || val === null || val === undefined)) {
              return { op: 'unset', path };
            }
            return { op: 'set', path, value: val };
          }).filter(Boolean);
          if (ops.length === 0) { setSaving(false); return; }
          const revision = scope.getSnapshot().revision;
          const response = await connection.api.settings.mutate({
            ns: SETTINGS_NS,
            ops,
            ...(revision === undefined ? {} : { expectedRevision: revision }),
          });
          if (!response.result.ok) setFailed(true);
          else { setDraft({}); setSaved(true); }
        } catch {
          setFailed(true);
        } finally {
          setSaving(false);
        }
      };

      const saveToken = async () => {
        if (!tokenDraft) return;
        setTokenSaving(true);
        setTokenFailed(false);
        setTokenSaved(false);
        try {
          const { result } = await connection.api.credentials.set({
            ref: 'DEEPSEEK_PLATFORM_TOKEN',
            value: tokenDraft,
          });
          if (!result.ok) setTokenFailed(true);
          else {
            setTokenDraft('');
            setTokenSaved(true);
            setTokenInfo((info) => ({ ...(info || {}), configured: true }));
          }
        } catch {
          setTokenFailed(true);
        } finally {
          setTokenSaving(false);
        }
      };

      const discard = () => {
        setDraft({});
        setSaved(false);
        setFailed(false);
      };

      // ---- render ----
      const renderGroup = (group) => {
        const fields = FIELDS.filter((f) => f.group === group.id);
        if (fields.length === 0) return null;
        const children = fields.map((spec) => {
          // Channel toggles render as one checkbox per provider id.
          if (spec.type === 'channel-toggle') {
            const raw = fieldValue(spec);
            // Empty/absent → default to all channels (mirrors host default).
            const enabled = Array.isArray(raw) && raw.length > 0 ? raw : Object.keys(CHANNELS);
            return jsx('div', {
              key: pathKey(spec.path),
              style: { marginBottom: 10 },
              children: [
                jsx('div', { style: { fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 6 }, children: tr(spec.hintKey) }),
                jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children: Object.keys(CHANNELS).map((pid) => {
                  const on = enabled.includes(pid);
                  const label = tr('settings.channel.' + pid) || pid;
                  return jsxs('label', {
                    key: pid,
                    style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, color: 'var(--dsw-alias-label-primary)' },
                    children: [
                      jsx('input', {
                        type: 'checkbox',
                        checked: on,
                        onChange: (e) => {
                          const next = e.target.checked
                            ? [...enabled, pid]
                            : enabled.filter((x) => x !== pid);
                          setField(pathKey(spec.path), next);
                        },
                        style: { width: 15, height: 15, accentColor: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer' },
                      }),
                      jsx('span', { children: label }),
                    ],
                  });
                }) }),
              ],
            });
          }
          return jsx(FieldRow, {
            key: pathKey(spec.path),
            spec,
            t: tr,
            value: fieldValue(spec),
            onChange: setField,
          });
        });
        return jsx('div', { key: group.id, style: { marginBottom: 20 }, children: [
          jsx('div', { style: { fontSize: 13, fontWeight: 600, lineHeight: '20px', color: 'var(--dsw-alias-label-primary)', margin: '0 0 10px' }, children: tr(group.labelKey) }),
          ...children,
        ]});
      };

      // Credential status line for the token box.
      const tokenStatus = tokenInfo
        ? (tokenInfo.configured ? tr('settings.tokenConfigured') : tr('settings.tokenMissing'))
          + (tokenInfo.writable ? '' : ' ' + tr('settings.tokenReadonly'))
        : tr('settings.tokenMissing');

      // The token box sits in the credentials group, with a 3-part explainer.
      const tokenBox = jsx('div', { key: 'platform-token', style: { marginBottom: 12 }, children: [
        jsx('div', { style: { fontSize: 12.5, fontWeight: 600, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }, children: tr('settings.platformToken') }),
        jsx('div', { style: { fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 4 }, children: tr('settings.platformTokenHint1') }),
        jsx('div', { style: { fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 4 }, children: tr('settings.platformTokenHint2') }),
        jsx('div', { style: { fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)', marginBottom: 6 }, children: tr('settings.platformTokenHint3') }),
        jsx('div', { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [
          jsx('input', {
            type: 'password',
            value: tokenDraft,
            placeholder: tokenStatus,
            onChange: (e) => { setTokenDraft(e.target.value); setTokenSaved(false); setTokenFailed(false); },
            style: { flex: 1, minWidth: 0, padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.35)', background: 'transparent', color: 'inherit', fontSize: 12.5, fontFamily: 'ui-monospace, Menlo, monospace' },
          }),
          jsx('button', {
            type: 'button',
            onClick: () => { void saveToken(); },
            disabled: !tokenDraft || tokenSaving || !writable,
            style: { padding: '5px 14px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.35)', background: 'transparent', color: 'inherit', cursor: tokenDraft && !tokenSaving && writable ? 'pointer' : 'default', fontSize: 12.5, whiteSpace: 'nowrap' },
            children: tokenSaving ? tr('settings.saving') : tr('settings.save'),
          }),
        ]}),
        jsx('div', { style: { fontSize: 11, marginTop: 4 }, children: [
          tokenSaved ? jsx('span', { style: { color: 'var(--dsw-alias-state-success-primary)' }, children: tr('settings.saved') + ' ✓' }) : null,
          tokenFailed ? jsx('span', { style: { color: 'var(--dsw-alias-state-error-primary)' }, children: tr('settings.failed') }) : null,
        ]}),
      ]});

      const footer = jsx('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }, children: [
        jsx('button', {
          type: 'button',
          onClick: () => { void save(); },
          disabled: Object.keys(draft).length === 0 || saving || !writable,
          style: {
            height: 30, padding: '0 16px', borderRadius: 8,
            border: '1px solid var(--dsw-alias-state-business-primary)',
            background: 'var(--dsw-alias-state-business-primary)',
            color: 'var(--dsw-alias-label-primary-inverted)',
            fontSize: 13, fontWeight: 500,
            cursor: Object.keys(draft).length > 0 && !saving && writable ? 'pointer' : 'default',
          },
          children: saving ? tr('settings.saving') : tr('settings.save'),
        }),
        jsx('button', {
          type: 'button',
          onClick: discard,
          disabled: Object.keys(draft).length === 0 || saving || !writable,
          style: {
            height: 30, padding: '0 16px', borderRadius: 8,
            border: '1px solid var(--dsw-alias-border-l2)',
            background: 'transparent',
            color: 'var(--dsw-alias-label-primary)',
            fontSize: 13,
            cursor: Object.keys(draft).length > 0 && !saving && writable ? 'pointer' : 'default',
          },
          children: tr('settings.discard'),
        }),
        saved ? jsx('span', { style: { fontSize: 12, color: 'var(--dsw-alias-state-success-primary)' }, children: tr('settings.saved') }) : null,
        failed ? jsx('span', { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }, children: tr('settings.failed') }) : null,
      ]});

      if (!writable) {
        return jsx('div', { style: { fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }, children: tr('settings.readonly') });
      }

      return jsx('div', { children: [
        jsx('div', { style: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', margin: '0 0 14px' }, children: tr('settings.intro') }),
        ...GROUPS.map(renderGroup).filter(Boolean),
        tokenBox,
        footer,
      ]});
    }

    /** One labelled field row (label + control + hint). */
    function FieldRow({ spec, t, value, onChange }) {
      const label = t(spec.labelKey);
      const hint = spec.hintKey ? t(spec.hintKey) : null;
      const input = spec.type === 'toggle'
        ? jsx('input', {
            type: 'checkbox',
            checked: value === true,
            onChange: (e) => onChange(pathKey(spec.path), e.target.checked),
            style: { width: 16, height: 16, accentColor: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer' },
          })
        : spec.type === 'number' || spec.type === 'secMs'
          ? jsx('input', {
              type: 'number',
              value: value === undefined || value === null ? '' : value,
              onChange: (e) => onChange(pathKey(spec.path), e.target.value),
              style: { width: 120, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.35)', background: 'transparent', color: 'inherit', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' },
            })
          : jsx('input', {
              type: 'text',
              value: value === undefined || value === null ? '' : value,
              onChange: (e) => onChange(pathKey(spec.path), e.target.value),
              style: { width: 200, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.35)', background: 'transparent', color: 'inherit', fontSize: 12.5 },
            });
      return jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }, children: [
        jsx('div', { style: { flex: '1 1 220px', minWidth: 0 }, children: [
          jsx('div', { style: { fontSize: 12.5, lineHeight: '18px', color: 'var(--dsw-alias-label-primary)' }, children: label }),
          hint ? jsx('div', { style: { fontSize: 11, lineHeight: '15px', color: 'var(--dsw-alias-label-tertiary)' }, children: hint }) : null,
        ]}),
        input,
      ]});
    }

    /**
     * Fixed multi-channel cards: renders one card per provider id in
     * `channels.enabled` (settings panel → 渠道), all at once, independent
     * of the current session's provider. Nothing renders while `showCard`
     * is off.
     */
    function ChannelCard({ wide, t, refresh, refreshArk, refreshCmdCode, scope, cfg }) {
      useScopeVersion(scope);
      const showCard = cfg(['ui', 'showCard']);
      const pollMs = cfg(['ui', 'pollMs']);
      const warn = cfg(['ui', 'warnThreshold']);
      const danger = cfg(['ui', 'dangerThreshold']);
      const enabled = cfg(['channels', 'enabled']);
      // Defense in depth: schemastery fills absent arrays with [] — treat an
      // empty list as "use the default channels" so the cards never vanish.
      const pids = Array.isArray(enabled) && enabled.length > 0
        ? enabled.filter((pid) => CHANNELS[pid])
        : Object.keys(CHANNELS);

      if (!showCard) return null;
      if (pids.length === 0) return null;

      const cardOf = (pid) => {
        const ch = CHANNELS[pid];
        if (ch.type === 'balance') return jsx(BalanceCard, { wide, t, refresh, pollMs });
        if (ch.type === 'ark-plan') return jsx(ArkPlanCard, { wide, t, refreshArk, pollMs, warn, danger });
        if (ch.type === 'cmdcode-plan') return jsx(CmdCodeCard, { wide, t, refreshCmdCode, pollMs, warn, danger });
        return null;
      };

      if (!wide) {
        // Collapsed rail: show the first enabled card's rail.
        return cardOf(pids[0]);
      }
      return jsxs('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', minWidth: 0 },
        children: pids.map((pid) => jsx('div', { key: pid, style: { display: 'flex', flexDirection: 'column', gap: 0, width: '100%', minWidth: 0 }, children: cardOf(pid) })),
      });
    }

    const inject = ['connection', 'slots', 'locale', 'settingsScope'];

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        'balance-monitor: dictionaries',
      );

      const connection = ctx.get('connection');
      let scope = null;
      try { scope = ctx.get('settingsScope').bind({ namespace: SETTINGS_NS }); } catch { /* absent */ }
      const cfg = makeScopeReader(scope, DEFAULTS);
      const refresh = () => connection.rpc.call('/balance', 'snapshot', {});
      const refreshArk = () => connection.rpc.call('/ark-quota', 'snapshot', {});
      const refreshCmdCode = () => connection.rpc.call('/cmdcode-quota', 'snapshot', {});

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        {
          name: 'sidebar.footer.action',
          id: 'balance-monitor',
          locale: NS,
          inject: () => ({ refresh, refreshArk, refreshCmdCode, scope, cfg }),
        },
        ChannelCard,
      ));

      ctx.slots.inject('settings.section', () => ctx.slots.register(
        {
          name: 'settings.section',
          id: 'balance-monitor',
          order: 90,
          label: () => (ctx.locale.getLocale().active === 'zh' ? '余额监控' : 'Balance Monitor'),
          locale: NS,
          inject: () => ({ connection, scope }),
        },
        SettingsPage,
      ));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});

// Alert engine. Given a newly-detected trade plus the trader's current profile
// and the user's notification settings, decide which alerts to raise. Includes
// unusual-activity detection (position size vs. the trader's own baseline).
//
// Alert kinds: new_trade, large_trade, very_large_trade, high_score_trader,
// unusual_size, new_market. Each returned alert is persisted and (optionally)
// delivered via Telegram by the caller.
import * as repo from '../db/repo.js';

// baseline = the trader's typical trade size from the 'all' window metrics.
export function evaluateTrade({ trade, profile, settings, walletTradeHistory }) {
  const alerts = [];
  const usd = trade.usd_value;
  const score = profile?.score?.score ?? null;
  const confidence = profile?.score?.confidence ?? 'INSUFFICIENT';
  const winRate = profile?.windows?.all?.basic?.winRate ?? null;
  const roi = profile?.windows?.all?.profitability?.roi ?? null;

  const base = {
    walletId: trade.wallet_id,
    tradeId: trade.id,
    payloadBase: {
      wallet: trade.wallet_address,
      traderLabel: profile?.wallet?.label || null,
      market: trade.market_title,
      marketId: trade.condition_id,
      side: trade.side,
      outcome: trade.outcome,
      price: trade.price,
      usd,
      timestamp: trade.timestamp,
      score,
      confidence,
      winRate,
      roi,
    },
  };

  // 1. New trade (respect min trade size filter)
  if (settings.alert_new_trades && (usd == null || usd >= settings.min_trade_usd)) {
    alerts.push(mk('new_trade', 'info', `New ${trade.side} · ${short(trade.market_title)}`, base));
  }

  // 2. Large / very large
  if (settings.alert_large_trades && usd != null) {
    if (usd >= settings.very_large_usd) {
      alerts.push(mk('very_large_trade', 'high', `🔴 Very large ${trade.side} $${fmtUsd(usd)}`, base));
    } else if (usd >= settings.min_trade_usd) {
      alerts.push(mk('large_trade', 'medium', `🟠 Large ${trade.side} $${fmtUsd(usd)}`, base));
    }
  }

  // 3. High-confidence, high-score trader
  if (settings.alert_high_score && score != null && score >= (settings.min_trader_score || 80) && confidence !== 'INSUFFICIENT') {
    alerts.push(mk('high_score_trader', 'high', `⭐ High-score trader (${score}/100) acted`, base));
  }

  // 4. Unusual position size vs. baseline
  if (settings.alert_unusual && usd != null) {
    const avg = profile?.windows?.all?.behavior?.avgPositionSize ?? null;
    if (avg && avg > 0 && usd >= avg * 5 && usd >= 1000) {
      const mult = Math.round((usd / avg) * 10) / 10;
      const a = mk('unusual_size', 'high', `⚠️ Unusual size: ${mult}× the trader's average`, base);
      a.payload.baselineAvg = Math.round(avg);
      a.payload.multiple = mult;
      alerts.push(a);
    }
  }

  // 5. New market for this trader (first time trading this condition)
  if (settings.alert_new_trades && trade.condition_id && walletTradeHistory) {
    const priorInMarket = walletTradeHistory.filter(
      (t) => t.condition_id === trade.condition_id && t.id !== trade.id
    ).length;
    if (priorInMarket === 0) {
      alerts.push(mk('new_market', 'info', `🆕 First trade in ${short(trade.market_title)}`, base));
    }
  }

  return alerts;
}

function mk(kind, severity, title, base) {
  return {
    walletId: base.walletId,
    tradeId: base.tradeId,
    kind,
    severity,
    title,
    payload: { ...base.payloadBase, kind, severity, title },
  };
}

// Persist alerts and return them with DB ids.
export function persistAlerts(alerts) {
  return alerts.map((a) => ({ ...a, id: repo.insertAlert(a) }));
}

// Render a Telegram/console message for an alert.
export function renderAlertMessage(a) {
  const p = a.payload;
  const lines = [
    '🚨 POLYMARKET ALERT',
    '',
    `Trader: ${p.traderLabel || p.wallet}`,
    `Score: ${p.score == null ? 'UNKNOWN' : p.score + '/100'} (${p.confidence})`,
    '',
    `Market: ${p.market || 'UNKNOWN'}`,
    `Action: ${p.side}`,
    `Outcome: ${p.outcome || 'UNKNOWN'}`,
    `Price: ${p.price == null ? 'UNKNOWN' : '$' + p.price}`,
    `Position Size: ${p.usd == null ? 'UNKNOWN' : '$' + fmtUsd(p.usd)}`,
    `Time: ${p.timestamp ? new Date(p.timestamp * 1000).toISOString() : 'UNKNOWN'}`,
    '',
    `Historical Win Rate: ${p.winRate == null ? 'UNKNOWN' : p.winRate + '%'}`,
    `Historical ROI: ${p.roi == null ? 'UNKNOWN' : p.roi + '%'}`,
  ];
  if (p.multiple) lines.push('', `⚠️ ${p.multiple}× the trader's average of $${fmtUsd(p.baselineAvg)}`);
  lines.push('', '(Statistical summary of past activity — not a prediction.)');
  return lines.join('\n');
}

const short = (s) => (s ? (s.length > 48 ? s.slice(0, 45) + '…' : s) : 'UNKNOWN market');
const fmtUsd = (v) => Math.round(v).toLocaleString();

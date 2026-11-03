// Trader Score (0–100) with sample-size / confidence adjustment and a
// human-readable explanation. The score is a weighted blend of components that
// each map a raw metric to a 0–100 sub-score, then it is pulled toward a
// neutral baseline (50) by a confidence factor derived from sample size — so a
// trader with 3 lucky wins cannot score 95.
//
// Components & default weights (documented; tune in one place):
//   profitability            25%   (realized P&L, scaled by log volume)
//   riskAdjusted             20%   (return / volatility, i.e. Sharpe-like)
//   consistency              15%   (low return volatility + steady equity)
//   winRate                  15%
//   drawdown                 10%   (smaller max drawdown vs. profit = better)
//   sampleConfidence         10%   (more closed trades = better)
//   recentPerformance         5%   (recent window vs. long-term)
//
// This is a STATISTICAL summary of historical behaviour, never a prediction.

export const WEIGHTS = {
  profitability: 0.25,
  riskAdjusted: 0.2,
  consistency: 0.15,
  winRate: 0.15,
  drawdown: 0.1,
  sampleConfidence: 0.1,
  recentPerformance: 0.05,
};

const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

// Map an unbounded value to 0..100 via a logistic curve around `mid`.
function logistic(x, mid, scale) {
  return 100 / (1 + Math.exp(-(x - mid) / scale));
}

// Confidence from number of closed round-trips.
export function confidenceFromSample(closed) {
  if (closed >= 100) return { level: 'HIGH', factor: 1.0 };
  if (closed >= 30) return { level: 'MEDIUM', factor: 0.75 };
  if (closed >= 8) return { level: 'LOW', factor: 0.5 };
  if (closed >= 1) return { level: 'LOW', factor: 0.3 };
  return { level: 'INSUFFICIENT', factor: 0 };
}

// metricsAll: metrics for the 'all' window. metricsRecent: e.g. 30d window.
export function computeScore(metricsAll, metricsRecent) {
  const b = metricsAll.basic;
  const p = metricsAll.profitability;
  const r = metricsAll.risk;
  const closed = b.closedRoundTrips || 0;
  const { level, factor } = confidenceFromSample(closed);

  if (level === 'INSUFFICIENT') {
    return {
      score: null,
      confidence: 'INSUFFICIENT',
      components: {},
      reasons: [{ sign: '-', text: 'Not enough closed trades to score reliably (need at least 1 completed round-trip).' }],
      weights: WEIGHTS,
    };
  }

  const components = {};

  // profitability: realized P&L scaled by trade count (avoids tiny-sample bias)
  const pnl = p.realizedPnl ?? 0;
  const avgPnlPerTrade = closed ? pnl / closed : 0;
  components.profitability = clamp(logistic(avgPnlPerTrade, 0, 50));

  // risk-adjusted: avg return / volatility (Sharpe-like on % returns)
  const vol = r.volatilityPct;
  const avgRet = p.avgReturnPct ?? 0;
  const sharpe = vol && vol > 0 ? avgRet / vol : avgRet > 0 ? 1 : 0;
  components.riskAdjusted = clamp(logistic(sharpe, 0, 0.6));

  // consistency: inverse of return volatility (lower vol -> higher score)
  components.consistency = vol == null ? 50 : clamp(100 - logistic(vol, 40, 25));

  // win rate direct
  components.winRate = b.winRate == null ? 50 : clamp(b.winRate);

  // drawdown: compare max drawdown magnitude to gross profit
  const dd = Math.abs(r.maxDrawdown ?? 0);
  const gp = p.grossProfit ?? 0;
  const ddRatio = gp > 0 ? dd / gp : dd > 0 ? 2 : 0;
  components.drawdown = clamp(100 - logistic(ddRatio, 0.6, 0.4));

  // sample confidence sub-score (also feeds the blend, in addition to the
  // global shrink factor)
  components.sampleConfidence = clamp(logistic(Math.log10(closed + 1), Math.log10(30), 0.4));

  // recent vs long-term
  const recentRet = metricsRecent?.profitability?.avgReturnPct;
  const longRet = p.avgReturnPct;
  if (recentRet == null || longRet == null) {
    components.recentPerformance = 50;
  } else {
    const delta = recentRet - longRet;
    components.recentPerformance = clamp(50 + logistic(delta, 0, 10) - 50 + 25 * Math.sign(delta));
    components.recentPerformance = clamp(components.recentPerformance);
  }

  // weighted blend
  let raw = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) raw += (components[key] ?? 50) * w;

  // shrink toward neutral 50 by confidence factor
  const adjusted = 50 + (raw - 50) * factor;
  const score = Math.round(clamp(adjusted));

  const reasons = buildReasons(components, metricsAll, metricsRecent, level);
  return {
    score,
    confidence: level,
    confidenceFactor: factor,
    rawScore: Math.round(raw),
    components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, Math.round(v)])),
    reasons,
    weights: WEIGHTS,
  };
}

function buildReasons(c, m, recent, level) {
  const reasons = [];
  const p = m.profitability;
  const r = m.risk;
  const b = m.basic;

  if (c.profitability >= 65) reasons.push({ sign: '+', text: `Positive realized P&L (${fmt(p.realizedPnl)}) across ${b.closedRoundTrips} closed trades.` });
  else if (c.profitability <= 40) reasons.push({ sign: '-', text: `Weak or negative realized P&L (${fmt(p.realizedPnl)}).` });

  if (c.riskAdjusted >= 65) reasons.push({ sign: '+', text: 'Strong risk-adjusted returns (return relative to volatility).' });
  else if (c.riskAdjusted <= 40) reasons.push({ sign: '-', text: 'Returns are low relative to volatility.' });

  if (c.consistency >= 65) reasons.push({ sign: '+', text: 'Consistent per-trade returns (low volatility).' });
  else if (c.consistency <= 40) reasons.push({ sign: '-', text: 'Inconsistent returns (high volatility).' });

  if (b.winRate != null) {
    if (b.winRate >= 60) reasons.push({ sign: '+', text: `High win rate (${b.winRate}%).` });
    else if (b.winRate < 45) reasons.push({ sign: '-', text: `Below-even win rate (${b.winRate}%).` });
  }

  if (c.drawdown >= 65) reasons.push({ sign: '+', text: 'Low drawdown relative to profits.' });
  else if (c.drawdown <= 40) reasons.push({ sign: '-', text: `Drawdown is large relative to profits (max ${fmt(r.maxDrawdown)}).` });

  if (level === 'HIGH') reasons.push({ sign: '+', text: `Large sample size (${b.closedRoundTrips} closed trades) — high confidence.` });
  else reasons.push({ sign: '-', text: `Limited sample (${b.closedRoundTrips} closed trades) — score shrunk toward neutral (${level} confidence).` });

  const recentRet = recent?.profitability?.avgReturnPct;
  const longRet = p.avgReturnPct;
  if (recentRet != null && longRet != null) {
    if (recentRet < longRet - 1) reasons.push({ sign: '-', text: 'Recent performance weaker than long-term average.' });
    else if (recentRet > longRet + 1) reasons.push({ sign: '+', text: 'Recent performance stronger than long-term average.' });
  }
  return reasons;
}

const fmt = (v) => (v == null ? 'UNKNOWN' : (v >= 0 ? '+$' : '-$') + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 }));

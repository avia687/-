// Analytics engine — PURE functions (no DB, no network) so they are fully unit
// testable. Input is an array of normalized trades (each: {side, price, shares,
// usdValue, timestamp, marketId, asset, outcome, category?}).
//
// Realized P&L is reconstructed from BUY/SELL pairs using FIFO lot matching per
// token (asset). Polymarket's /trades feed does not carry per-trade P&L, so we
// derive it from the economic fields; when required fields are missing we mark
// the result incomplete rather than fabricate a number.
//
// Windowed analysis (24h/7d/30d/90d/all) simply filters by timestamp.

export const WINDOWS = {
  '24h': 24 * 3600,
  '7d': 7 * 24 * 3600,
  '30d': 30 * 24 * 3600,
  '90d': 90 * 24 * 3600,
  all: null,
};

// -------------------------------- helpers --------------------------------
const nums = (arr) => arr.filter((x) => typeof x === 'number' && Number.isFinite(x));
function median(arr) {
  const a = nums(arr).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function mean(arr) {
  const a = nums(arr);
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}
function stdev(arr) {
  const a = nums(arr);
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function maxConsecutive(bools) {
  let best = 0;
  let cur = 0;
  for (const b of bools) {
    cur = b ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}
const round2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

// ---------------------- FIFO round-trip reconstruction -------------------
// Returns { roundTrips, openLots, unmatchedSells, incomplete }.
export function computeRoundTrips(trades) {
  const byAsset = new Map(); // asset -> FIFO queue of {shares, price, ts}
  const roundTrips = [];
  let unmatchedSells = 0;
  let incomplete = false;

  const ordered = trades
    .slice()
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0) || 0);

  for (const t of ordered) {
    const key = t.asset || t.marketId || 'unknown';
    if (t.price == null || t.shares == null) {
      incomplete = true;
      continue; // cannot match without economic fields
    }
    if (!byAsset.has(key)) byAsset.set(key, []);
    const lots = byAsset.get(key);

    if (t.side === 'BUY') {
      lots.push({ shares: t.shares, price: t.price, ts: t.timestamp, marketId: t.marketId, category: t.category });
    } else if (t.side === 'SELL') {
      let remaining = t.shares;
      while (remaining > 0 && lots.length) {
        const lot = lots[0];
        const matched = Math.min(remaining, lot.shares);
        const cost = matched * lot.price;
        const proceeds = matched * t.price;
        const pnl = proceeds - cost;
        roundTrips.push({
          asset: key,
          marketId: t.marketId ?? lot.marketId ?? null,
          category: t.category ?? lot.category ?? null,
          shares: matched,
          buyPrice: lot.price,
          sellPrice: t.price,
          cost,
          proceeds,
          pnl,
          returnPct: cost > 0 ? (pnl / cost) * 100 : null,
          buyTs: lot.ts,
          sellTs: t.timestamp,
          holdSeconds: lot.ts != null && t.timestamp != null ? t.timestamp - lot.ts : null,
        });
        lot.shares -= matched;
        remaining -= matched;
        if (lot.shares <= 1e-9) lots.shift();
      }
      if (remaining > 1e-9) unmatchedSells++; // sold more than we saw bought
    }
  }

  const openLots = [];
  for (const [asset, lots] of byAsset) for (const lot of lots) openLots.push({ asset, ...lot });
  return { roundTrips, openLots, unmatchedSells, incomplete };
}

// ------------------------------- metrics ---------------------------------
// trades: normalized trades for the window.
// opts.unrealizedPnl: number|null (from positions snapshot) for the ALL window.
export function computeMetrics(trades, opts = {}) {
  const n = trades.length;
  const usdValues = trades.map((t) => t.usdValue).filter((x) => x != null);
  const usdComplete = usdValues.length === n;

  const { roundTrips, openLots, unmatchedSells, incomplete } = computeRoundTrips(trades);
  const closed = roundTrips.length;
  const pnls = roundTrips.map((r) => r.pnl);
  const returns = roundTrips.map((r) => r.returnPct).filter((x) => x != null);
  const wins = roundTrips.filter((r) => r.pnl > 0);
  const losses = roundTrips.filter((r) => r.pnl < 0);

  const grossProfit = wins.reduce((s, r) => s + r.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r.pnl, 0));
  const realizedPnl = pnls.reduce((s, x) => s + x, 0);
  const investedMatched = roundTrips.reduce((s, r) => s + r.cost, 0);

  // equity curve of cumulative realized P&L over close time
  const equityCurve = [];
  {
    const sorted = roundTrips.slice().sort((a, b) => (a.sellTs ?? 0) - (b.sellTs ?? 0));
    let cum = 0;
    for (const r of sorted) {
      cum += r.pnl;
      equityCurve.push({ timestamp: r.sellTs ?? null, cumulativePnl: round2(cum) });
    }
  }
  const maxDrawdown = drawdown(equityCurve.map((p) => p.cumulativePnl));

  // streaks in chronological order of closes
  const chrono = roundTrips.slice().sort((a, b) => (a.sellTs ?? 0) - (b.sellTs ?? 0));
  const winningStreak = maxConsecutive(chrono.map((r) => r.pnl > 0));
  const losingStreak = maxConsecutive(chrono.map((r) => r.pnl < 0));

  // concentration: Herfindahl over volume by market
  const volByMarket = new Map();
  let totalVol = 0;
  for (const t of trades) {
    if (t.usdValue == null) continue;
    const k = t.marketId || 'unknown';
    volByMarket.set(k, (volByMarket.get(k) || 0) + t.usdValue);
    totalVol += t.usdValue;
  }
  let hhi = null;
  let topMarketShare = null;
  if (totalVol > 0) {
    let sumSq = 0;
    let top = 0;
    for (const v of volByMarket.values()) {
      const share = v / totalVol;
      sumSq += share * share;
      if (v > top) top = v;
    }
    hhi = round2(sumSq);
    topMarketShare = round2((top / totalVol) * 100);
  }

  // behaviour
  const tsList = nums(trades.map((t) => t.timestamp)).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < tsList.length; i++) gaps.push(tsList[i] - tsList[i - 1]);
  const spanSeconds = tsList.length >= 2 ? tsList[tsList.length - 1] - tsList[0] : null;
  const holdSeconds = nums(roundTrips.map((r) => r.holdSeconds));

  const unrealizedPnl = opts.unrealizedPnl ?? null;
  const totalPnl = unrealizedPnl == null ? realizedPnl : realizedPnl + unrealizedPnl;

  return {
    basic: {
      totalTrades: n,
      closedRoundTrips: closed,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: closed ? round2((wins.length / closed) * 100) : null,
      totalVolume: usdValues.length ? round2(usdValues.reduce((s, x) => s + x, 0)) : null,
      volumeComplete: usdComplete,
      avgTradeSize: round2(mean(usdValues)),
      medianTradeSize: round2(median(usdValues)),
      largestTrade: usdValues.length ? round2(Math.max(...usdValues)) : null,
      smallestTrade: usdValues.length ? round2(Math.min(...usdValues)) : null,
    },
    profitability: {
      realizedPnl: closed ? round2(realizedPnl) : null,
      unrealizedPnl: unrealizedPnl == null ? null : round2(unrealizedPnl),
      totalPnl: closed || unrealizedPnl != null ? round2(totalPnl) : null,
      roi: investedMatched > 0 ? round2((realizedPnl / investedMatched) * 100) : null,
      avgReturnPct: round2(mean(returns)),
      medianReturnPct: round2(median(returns)),
      profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : grossProfit > 0 ? Infinity : null,
      grossProfit: round2(grossProfit),
      grossLoss: round2(grossLoss),
      investedCapitalMatched: round2(investedMatched),
    },
    risk: {
      maxDrawdown: round2(maxDrawdown),
      volatilityPct: round2(stdev(returns)),
      winningStreak,
      losingStreak,
      largestGain: pnls.length ? round2(Math.max(...pnls, 0)) : null,
      largestLoss: pnls.length ? round2(Math.min(...pnls, 0)) : null,
      positionConcentrationHHI: hhi,
      topMarketSharePct: topMarketShare,
    },
    behavior: {
      openPositions: openLots.length,
      avgSecondsBetweenTrades: gaps.length ? Math.round(mean(gaps)) : null,
      avgHoldingSeconds: holdSeconds.length ? Math.round(mean(holdSeconds)) : null,
      avgPositionSize: round2(mean(usdValues)),
      largestPosition: usdValues.length ? round2(Math.max(...usdValues)) : null,
      tradesPerDay: spanSeconds && spanSeconds > 0 ? round2(n / (spanSeconds / 86400)) : null,
      marketConcentrationHHI: hhi,
      distinctMarkets: volByMarket.size,
    },
    equityCurve,
    dataQuality: {
      usdValueComplete: usdComplete,
      priceSharesIncomplete: incomplete,
      unmatchedSells,
      note: buildQualityNote({ usdComplete, incomplete, unmatchedSells, closed }),
    },
  };
}

function drawdown(cumSeries) {
  if (!cumSeries.length) return null;
  let peak = cumSeries[0];
  let maxDd = 0;
  for (const v of cumSeries) {
    if (v > peak) peak = v;
    const dd = v - peak; // negative or zero
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd; // absolute currency drawdown (<= 0)
}

function buildQualityNote({ usdComplete, incomplete, unmatchedSells, closed }) {
  const notes = [];
  if (!usdComplete) notes.push('Some trades are missing USD size; volume/averages are partial.');
  if (incomplete) notes.push('Some trades lacked price/size and were excluded from P&L.');
  if (unmatchedSells) notes.push(`${unmatchedSells} sell(s) had no matching buy in history (P&L excluded).`);
  if (!closed) notes.push('No closed round-trips yet; realized P&L unavailable.');
  return notes.join(' ') || 'Data complete for computed metrics.';
}

// Compute all windows at once. `trades` = all normalized trades (any order).
export function computeAllWindows(trades, { unrealizedPnl = null } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const out = {};
  for (const [label, seconds] of Object.entries(WINDOWS)) {
    const subset = seconds == null ? trades : trades.filter((t) => t.timestamp != null && t.timestamp >= nowSec - seconds);
    // unrealized only meaningful for the ALL window (current open positions)
    out[label] = computeMetrics(subset, { unrealizedPnl: label === 'all' ? unrealizedPnl : null });
  }
  return out;
}

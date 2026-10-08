// Market-category performance breakdown. Groups closed round-trips by the
// category stored on the market (enriched from Gamma API tags) and reports win
// rate + ROI per category. Categories are only shown when we actually have the
// market metadata — never guessed.
import { computeRoundTrips } from './analytics.js';

// trades: normalized trades already annotated with `category` (from markets
// table). Trades whose market category is unknown are grouped under 'Unknown'.
export function categoryBreakdown(trades) {
  const { roundTrips } = computeRoundTrips(trades);
  const groups = new Map();
  for (const rt of roundTrips) {
    const cat = rt.category || 'Unknown';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(rt);
  }
  const out = [];
  for (const [category, rts] of groups) {
    const wins = rts.filter((r) => r.pnl > 0).length;
    const pnl = rts.reduce((s, r) => s + r.pnl, 0);
    const cost = rts.reduce((s, r) => s + r.cost, 0);
    out.push({
      category,
      closedTrades: rts.length,
      winRate: rts.length ? Math.round((wins / rts.length) * 10000) / 100 : null,
      realizedPnl: Math.round(pnl * 100) / 100,
      roi: cost > 0 ? Math.round((pnl / cost) * 10000) / 100 : null,
    });
  }
  return out.sort((a, b) => (b.realizedPnl ?? 0) - (a.realizedPnl ?? 0));
}

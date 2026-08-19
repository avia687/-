// Assembles a full trader profile from stored data: loads trades + positions,
// annotates trades with market category, runs the analytics engine across all
// windows, computes the score/style/category breakdown, and caches the results.
// This is the single source of truth used by both the REST API and the worker.
import * as repo from '../db/repo.js';
import { computeAllWindows } from './analytics.js';
import { computeScore } from './score.js';
import { detectStyles } from './style.js';
import { categoryBreakdown } from './categories.js';

// Convert a stored trade row into the normalized shape the analytics engine
// expects, attaching the market category from the markets table.
function toAnalyticsTrade(row, categoryByMarket) {
  return {
    side: row.side,
    price: row.price,
    shares: row.shares,
    usdValue: row.usd_value,
    timestamp: row.timestamp,
    marketId: row.condition_id,
    asset: row.asset,
    outcome: row.outcome,
    category: row.condition_id ? categoryByMarket.get(row.condition_id) || null : null,
  };
}

export function buildProfile(walletId, { persist = true } = {}) {
  const wallet = repo.getWalletById(walletId);
  if (!wallet) return null;

  const rows = repo.getAllTradesAsc(walletId);
  const positions = repo.getPositions(walletId);
  const unrealizedPnl = sumUnrealized(positions);

  // category lookup
  const categoryByMarket = new Map();
  for (const row of rows) {
    if (row.condition_id && !categoryByMarket.has(row.condition_id)) {
      const m = repo.getMarket(row.condition_id);
      categoryByMarket.set(row.condition_id, m?.category || null);
    }
  }

  const trades = rows.map((r) => toAnalyticsTrade(r, categoryByMarket));
  const windows = computeAllWindows(trades, { unrealizedPnl });
  const score = computeScore(windows.all, windows['30d']);
  const styles = detectStyles(windows.all);
  const categories = categoryBreakdown(trades);

  if (persist) {
    for (const [w, metrics] of Object.entries(windows)) repo.saveMetrics(walletId, w, metrics);
    repo.saveScore(walletId, { score: score.score, confidence: score.confidence, breakdown: score });
  }

  return {
    wallet: publicWallet(wallet),
    positions,
    unrealizedPnl,
    windows,
    score,
    styles,
    categories,
  };
}

function sumUnrealized(positions) {
  const vals = positions.map((p) => p.cash_pnl).filter((x) => x != null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, x) => s + x, 0) * 100) / 100;
}

export function publicWallet(w) {
  return {
    id: w.id,
    address: w.address,
    label: w.label,
    status: w.status,
    dataSource: w.data_source,
    firstActivityAt: w.first_activity_at,
    lastActivityAt: w.last_activity_at,
    lastSyncedAt: w.last_synced_at,
    tradeCount: repo.countTrades(w.id),
    createdAt: w.created_at,
  };
}

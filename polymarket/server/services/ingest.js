// Ingestion orchestration: pull raw activity from the selected provider,
// normalize + dedupe, persist trades/positions, enrich markets, and update the
// wallet's sync cursor. Used for both the initial historical import and each
// live monitoring cycle. Idempotent — safe to re-run; duplicates are ignored.
import { getProvider } from '../providers/index.js';
import { normalizeTrade, dedupeTrades, normalizePosition } from './normalize.js';
import { logger } from '../logger.js';
import * as repo from '../db/repo.js';

// Import (or refresh) a wallet's history. `mode` is 'historical' | 'live'.
// Returns { seen, inserted, newTrades } where newTrades are the normalized
// trades that were newly inserted this run (used to drive alerts).
export async function syncWallet(wallet, { mode = 'live' } = {}) {
  const provider = getProvider(wallet.data_source);
  const runId = repo.startSyncRun(wallet.id, mode);
  try {
    const sinceTs = mode === 'live' ? wallet.last_cursor ?? null : null;
    const rawTrades = await provider.fetchTrades(wallet.address, {
      pageSize: 100,
      sinceTs,
    });

    const normalized = dedupeTrades(rawTrades.map((r) => normalizeTrade(r, wallet.address)));
    const seen = normalized.length;

    // Determine which are genuinely new (not already stored) so we can alert
    // only on those. We insert first (INSERT OR IGNORE), then diff by count is
    // unreliable, so we check membership explicitly for the recent window.
    const knownKeys = new Set(
      repo
        .getTrades(wallet.id, { limit: Math.max(seen * 2, 200) })
        .map((t) => t.dedupe_key)
    );
    const inserted = repo.insertTrades(wallet.id, normalized);
    const newTrades = normalized.filter((t) => !knownKeys.has(t.dedupeKey));

    // Enrich markets referenced by new trades (best-effort, non-fatal).
    await enrichMarkets(provider, newTrades);

    // Positions snapshot (best-effort).
    try {
      const rawPositions = await provider.fetchPositions(wallet.address);
      const positions = rawPositions.map(normalizePosition);
      repo.replacePositions(wallet.id, positions);
    } catch (err) {
      logger.warn('positions sync failed', { wallet: wallet.address, error: err.message });
    }

    // Update cursor & activity timestamps.
    const maxTs = repo.maxTradeTimestamp(wallet.id);
    const minTsRow = repo.getAllTradesAsc(wallet.id)[0];
    repo.updateWalletSync(wallet.id, {
      lastSyncedAt: Math.floor(Date.now() / 1000),
      lastCursor: maxTs,
      lastActivityAt: maxTs,
      firstActivityAt: minTsRow?.timestamp ?? null,
      status: 'active',
    });

    repo.finishSyncRun(runId, { status: 'ok', tradesSeen: seen, tradesNew: newTrades.length });
    logger.info('wallet synced', {
      wallet: wallet.address, mode, seen, inserted, newTrades: newTrades.length,
    });
    return { seen, inserted, newTrades };
  } catch (err) {
    repo.setWalletStatus(wallet.id, 'error');
    repo.finishSyncRun(runId, { status: 'error', error: err.message });
    repo.logError('error', 'ingest', err.message, { wallet: wallet.address, mode });
    logger.error('wallet sync failed', { wallet: wallet.address, error: err.message });
    throw err;
  }
}

async function enrichMarkets(provider, trades) {
  const seen = new Set();
  for (const t of trades) {
    if (!t.marketId || seen.has(t.marketId)) continue;
    seen.add(t.marketId);
    const existing = repo.getMarket(t.marketId);
    if (existing && existing.category) continue; // already enriched
    try {
      const meta = await provider.fetchMarket(t.marketId);
      if (meta) repo.upsertMarket(meta);
      else repo.upsertMarket({ conditionId: t.marketId, title: t.market });
    } catch (err) {
      logger.warn('market enrich failed', { marketId: t.marketId, error: err.message });
    }
  }
}

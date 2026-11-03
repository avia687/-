// Live monitoring. For each active wallet: sync (which detects new trades),
// rebuild the profile, evaluate alerts on each new trade, persist + deliver.
// Designed to be resumable (uses wallet.last_cursor) and resilient (per-wallet
// try/catch so one failure doesn't stop the loop).
import * as repo from '../db/repo.js';
import { logger } from '../logger.js';
import { syncWallet } from './ingest.js';
import { buildProfile } from './profile.js';
import { evaluateTrade, persistAlerts, renderAlertMessage } from './alerts.js';
import { sendTelegram, isTelegramConfigured } from './telegram.js';

// Run one monitoring cycle for a single wallet. Returns a summary.
export async function monitorWalletOnce(wallet) {
  const { newTrades } = await syncWallet(wallet, { mode: 'live' });
  if (!newTrades.length) {
    return { wallet: wallet.address, newTrades: 0, alerts: 0 };
  }
  logger.info('NEW TRADE DETECTED', { wallet: wallet.address, count: newTrades.length });

  // Rebuild profile so alerts carry up-to-date score/win-rate/baseline.
  const profile = buildProfile(wallet.id, { persist: true });
  const settings = repo.getSettings();
  const history = repo.getTrades(wallet.id, { limit: 1000 });

  let alertCount = 0;
  // Map normalized new trades back to their stored rows (by dedupe key).
  const rowByKey = new Map(history.map((r) => [r.dedupe_key, r]));
  for (const nt of newTrades) {
    const row = rowByKey.get(nt.dedupeKey);
    if (!row) continue;
    const alerts = evaluateTrade({ trade: row, profile, settings, walletTradeHistory: history });
    if (!alerts.length) continue;
    const saved = persistAlerts(alerts);
    alertCount += saved.length;
    if (isTelegramConfigured()) {
      for (const a of saved) {
        const res = await sendTelegram(renderAlertMessage(a));
        if (res.ok) repo.markAlertDelivered(a.id);
      }
    }
  }
  return { wallet: wallet.address, newTrades: newTrades.length, alerts: alertCount };
}

// Run one cycle across all active wallets.
export async function monitorCycle() {
  const wallets = repo.listActiveWallets();
  const results = [];
  for (const wallet of wallets) {
    try {
      results.push(await monitorWalletOnce(wallet));
    } catch (err) {
      logger.error('monitor cycle wallet error', { wallet: wallet.address, error: err.message });
      results.push({ wallet: wallet.address, error: err.message });
    }
  }
  return results;
}

// Final Acceptance Test — end-to-end simulation (offline, fixture data source):
//   Wallet -> historical trades -> metrics -> trader score -> NEW trade injected
//   -> live detection -> analytics update -> alert -> dashboard state.
// Prints a step-by-step report and exits non-zero if any step fails.
import { getDb } from '../db/index.js';
import * as repo from '../db/repo.js';
import { addWallet } from '../services/wallets.js';
import { buildProfile } from '../services/profile.js';
import { monitorWalletOnce } from '../services/monitor.js';
import { injectLiveTrade, clearOverlay } from '../providers/fixture.js';

const ADDRESS = '0x9999999999999999999999999999999999999999';

function ok(cond, label, detail) {
  const mark = cond ? '✅' : '❌';
  console.log(`${mark} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
  return cond;
}

async function main() {
  process.env.DATA_SOURCE = process.env.DATA_SOURCE || 'fixture';
  getDb();

  // clean slate
  const existing = repo.getWalletByAddress(ADDRESS);
  if (existing) repo.deleteWallet(existing.id);
  clearOverlay(ADDRESS);

  console.log('\n=== STEP 1: Add wallet + import historical trades ===');
  const added = await addWallet({ address: ADDRESS, label: 'Simulation Trader', dataSource: 'fixture' });
  const walletId = added.wallet.id;
  ok(added.imported > 0, 'Historical trades imported', `${added.imported} trades`);

  console.log('\n=== STEP 2: Metrics ===');
  const profile = buildProfile(walletId, { persist: true });
  const all = profile.windows.all;
  ok(all.basic.totalTrades > 0, 'Total trades computed', String(all.basic.totalTrades));
  ok(all.basic.closedRoundTrips > 0, 'Closed round-trips reconstructed', String(all.basic.closedRoundTrips));
  ok('realizedPnl' in all.profitability, 'Realized P&L computed', String(all.profitability.realizedPnl));
  ok('maxDrawdown' in all.risk, 'Max drawdown computed', String(all.risk.maxDrawdown));

  console.log('\n=== STEP 3: Trader Score ===');
  ok(profile.score.score != null, 'Trader score computed', `${profile.score.score}/100 (${profile.score.confidence})`);
  ok(profile.score.reasons.length > 0, 'Score explanation generated', `${profile.score.reasons.length} reasons`);
  ok(profile.styles.length > 0, 'Trader style detected', profile.styles.map((s) => s.label).join(', '));

  console.log('\n=== STEP 4: Inject a NEW (unusually large) trade ===');
  const injected = injectLiveTrade(ADDRESS, { side: 'BUY', price: 0.43, size: 8500, marketIndex: 1 });
  ok(!!injected.transactionHash, 'New trade injected into live feed', `$${injected.usdcSize}`);

  console.log('\n=== STEP 5: Live detection + analytics update + alert ===');
  const wallet = repo.getWalletById(walletId);
  const before = repo.countTrades(walletId);
  const result = await monitorWalletOnce(wallet);
  const after = repo.countTrades(walletId);
  ok(result.newTrades >= 1, 'New trade detected by monitor', `${result.newTrades} new`);
  ok(after === before + result.newTrades, 'Trade persisted (dedupe-safe)', `${before} -> ${after}`);
  ok(result.alerts >= 1, 'Alert(s) generated', `${result.alerts} alerts`);

  console.log('\n=== STEP 6: Verify alert content + dashboard state ===');
  const alerts = repo.listAlerts({ walletId, limit: 10 });
  const unusual = alerts.find((a) => a.kind === 'unusual_size');
  ok(!!unusual, 'Unusual-size alert raised for 8500 vs baseline', unusual ? `${unusual.payload.multiple}x avg` : 'missing');
  const refreshed = buildProfile(walletId, { persist: true });
  ok(refreshed.windows.all.basic.totalTrades > all.basic.totalTrades, 'Dashboard metrics updated after new trade',
    `${all.basic.totalTrades} -> ${refreshed.windows.all.basic.totalTrades}`);

  console.log('\n=== STEP 7: Idempotency (re-run monitor, no duplicate) ===');
  const rerun = await monitorWalletOnce(repo.getWalletById(walletId));
  ok(rerun.newTrades === 0, 'Re-sync detects no duplicate trades', `${rerun.newTrades} new`);

  // cleanup overlay so repeated runs start fresh
  clearOverlay(ADDRESS);

  console.log(`\n${process.exitCode ? '❌ SIMULATION FAILED' : '✅ SIMULATION PASSED (all steps)'}\n`);
}

main().catch((err) => { console.error('Simulation error:', err); process.exit(1); });

// Standalone monitoring worker. Polls all active wallets on an interval with
// smart pacing: a base interval plus jitter, backing off after errors. Can run
// as a separate process (`npm run worker`) or be started in-process by the API.
import { config } from './config.js';
import { logger } from './logger.js';
import { getDb } from './db/index.js';
import { monitorCycle } from './services/monitor.js';

let running = false;
let stopRequested = false;
let consecutiveErrors = 0;

export async function runLoop() {
  getDb();
  if (!config.monitor.enabled) {
    logger.warn('monitor disabled via MONITOR_ENABLED=false');
    return;
  }
  running = true;
  logger.info('monitor worker started', { pollSeconds: config.monitor.pollSeconds });

  while (!stopRequested) {
    const startedAt = Date.now();
    try {
      const results = await monitorCycle();
      const totalNew = results.reduce((s, r) => s + (r.newTrades || 0), 0);
      const totalAlerts = results.reduce((s, r) => s + (r.alerts || 0), 0);
      logger.info('monitor cycle complete', { wallets: results.length, newTrades: totalNew, alerts: totalAlerts });
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      logger.error('monitor cycle failed', { error: err.message, consecutiveErrors });
    }

    // smart pacing: base interval + jitter, exponential backoff on errors
    const base = config.monitor.pollSeconds * 1000;
    const backoff = consecutiveErrors ? Math.min(2 ** consecutiveErrors * 1000, 60000) : 0;
    const jitter = Math.floor(Math.random() * 1000);
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(1000, base + backoff + jitter - elapsed);
    await sleep(wait);
  }
  running = false;
  logger.info('monitor worker stopped');
}

export function stopLoop() {
  stopRequested = true;
}

export function isRunning() {
  return running;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// If executed directly, run the loop.
if (import.meta.url === `file://${process.argv[1]}`) {
  runLoop().catch((err) => {
    logger.error('worker crashed', { error: err.message });
    process.exit(1);
  });
  const shutdown = () => { stopLoop(); setTimeout(() => process.exit(0), 500); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

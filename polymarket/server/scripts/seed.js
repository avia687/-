// Seed a few demo wallets (fixture data source) so the dashboard has content.
// Run: DATA_SOURCE=fixture npm run seed
import { getDb } from '../db/index.js';
import { addWallet } from '../services/wallets.js';
import { logger } from '../logger.js';

const DEMO_WALLETS = [
  { address: '0x1111111111111111111111111111111111111111', label: 'Demo Whale' },
  { address: '0x2222222222222222222222222222222222222222', label: 'Demo Grinder' },
  { address: '0x3333333333333333333333333333333333333333', label: 'Demo Contrarian' },
];

async function main() {
  getDb();
  for (const w of DEMO_WALLETS) {
    try {
      const res = await addWallet({ address: w.address, label: w.label, dataSource: 'fixture' });
      logger.info('seeded wallet', { address: w.address, imported: res.imported });
    } catch (err) {
      logger.warn('seed skip', { address: w.address, error: err.message });
    }
  }
  logger.info('seed complete');
}

main().catch((err) => { console.error(err); process.exit(1); });

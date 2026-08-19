// Wallet lifecycle service: validate, probe for activity, persist, and run the
// initial historical import + profile build.
import { config } from '../config.js';
import { logger } from '../logger.js';
import * as repo from '../db/repo.js';
import { validateWalletAddress } from './validate.js';
import { getProvider } from '../providers/index.js';
import { syncWallet } from './ingest.js';
import { buildProfile, publicWallet } from './profile.js';

export class WalletError extends Error {
  constructor(message, code = 'bad_request') {
    super(message);
    this.code = code;
  }
}

// Add a wallet: validate address, ensure it isn't already tracked, probe the
// data source for activity, insert, then import history + build profile.
export async function addWallet({ address, label, dataSource } = {}) {
  const v = validateWalletAddress(address);
  if (!v.valid) throw new WalletError(`Invalid wallet address: ${v.reason}`, 'invalid_address');
  const normalized = v.normalized;

  const existing = repo.getWalletByAddress(normalized);
  if (existing) throw new WalletError('Wallet already tracked', 'duplicate');

  const source = (dataSource || config.dataSource).toLowerCase();
  const provider = getProvider(source);

  // Probe for activity (non-fatal if the source is unreachable — we still add
  // the wallet but flag it, so the user isn't blocked by a transient outage).
  let probe = { hasActivity: null, sample: null };
  try {
    probe = await provider.probe(normalized);
  } catch (err) {
    logger.warn('probe failed on add', { address: normalized, error: err.message });
  }

  const wallet = repo.insertWallet({ address: normalized, label, dataSource: source });
  logger.info('wallet added', { address: normalized, source, hasActivity: probe.hasActivity });

  // Initial historical import (best-effort; errors are recorded on the wallet).
  let imported = 0;
  try {
    const res = await syncWallet(wallet, { mode: 'historical' });
    imported = res.inserted;
    buildProfile(wallet.id, { persist: true });
  } catch (err) {
    logger.error('initial import failed', { address: normalized, error: err.message });
  }

  return {
    wallet: publicWallet(repo.getWalletById(wallet.id)),
    probe,
    imported,
  };
}

export function listWallets() {
  return repo.listWallets().map(publicWallet);
}

export function removeWallet(id) {
  const w = repo.getWalletById(id);
  if (!w) throw new WalletError('Wallet not found', 'not_found');
  repo.deleteWallet(id);
  return { deleted: true, id };
}

// Force a re-sync + profile rebuild for a wallet.
export async function refreshWallet(id, { mode = 'live' } = {}) {
  const w = repo.getWalletById(id);
  if (!w) throw new WalletError('Wallet not found', 'not_found');
  await syncWallet(w, { mode });
  return buildProfile(id, { persist: true });
}

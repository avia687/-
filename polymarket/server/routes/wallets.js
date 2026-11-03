// Wallet + analytics REST endpoints.
import express from 'express';
import * as repo from '../db/repo.js';
import { addWallet, listWallets, removeWallet, refreshWallet, WalletError } from '../services/wallets.js';
import { buildProfile } from '../services/profile.js';
import { getMarket } from '../db/repo.js';

export const router = express.Router();

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
  const status = err instanceof WalletError
    ? (err.code === 'not_found' ? 404 : err.code === 'duplicate' ? 409 : 400)
    : 500;
  res.status(status).json({ error: err.message, code: err.code || 'internal' });
});

// GET /api/wallets — list tracked wallets with score summary
router.get('/', wrap((req, res) => {
  const wallets = listWallets().map((w) => {
    const score = repo.getScore(w.id);
    const all = repo.getMetrics(w.id, 'all');
    return {
      ...w,
      score: score?.score ?? null,
      confidence: score?.confidence ?? null,
      winRate: all?.basic?.winRate ?? null,
      roi: all?.profitability?.roi ?? null,
      totalPnl: all?.profitability?.totalPnl ?? null,
    };
  });
  res.json({ wallets });
}));

// POST /api/wallets { address, label?, dataSource? }
router.post('/', wrap(async (req, res) => {
  const { address, label, dataSource } = req.body || {};
  const result = await addWallet({ address, label, dataSource });
  res.status(201).json(result);
}));

// DELETE /api/wallets/:id
router.delete('/:id', wrap((req, res) => {
  res.json(removeWallet(Number(req.params.id)));
}));

// POST /api/wallets/:id/refresh
router.post('/:id/refresh', wrap(async (req, res) => {
  const profile = await refreshWallet(Number(req.params.id), { mode: req.body?.mode || 'live' });
  res.json({ profile });
}));

// GET /api/wallets/:id — full profile
router.get('/:id', wrap((req, res) => {
  const profile = buildProfile(Number(req.params.id), { persist: false });
  if (!profile) return res.status(404).json({ error: 'Wallet not found', code: 'not_found' });
  res.json({ profile });
}));

// GET /api/wallets/:id/trades?limit=&since=
router.get('/:id/trades', wrap((req, res) => {
  const id = Number(req.params.id);
  const limit = Math.min(Number(req.query.limit) || 200, 2000);
  const trades = repo.getTrades(id, { limit }).map(enrichTrade);
  res.json({ trades });
}));

// GET /api/wallets/:id/metrics?window=all
router.get('/:id/metrics', wrap((req, res) => {
  const id = Number(req.params.id);
  const window = req.query.window || 'all';
  const metrics = repo.getMetrics(id, window) || buildProfile(id, { persist: true })?.windows?.[window];
  if (!metrics) return res.status(404).json({ error: 'No metrics', code: 'not_found' });
  res.json({ window, metrics });
}));

// GET /api/wallets/:id/score
router.get('/:id/score', wrap((req, res) => {
  const id = Number(req.params.id);
  let score = repo.getScore(id);
  if (!score) score = buildProfile(id, { persist: true })?.score;
  if (!score) return res.status(404).json({ error: 'No score', code: 'not_found' });
  res.json({ score });
}));

// GET /api/wallets/:id/activity — recent alerts + recent trades merged feed
router.get('/:id/activity', wrap((req, res) => {
  const id = Number(req.params.id);
  const trades = repo.getTrades(id, { limit: 30 }).map(enrichTrade);
  const alerts = repo.listAlerts({ walletId: id, limit: 30 });
  res.json({ trades, alerts });
}));

// GET /api/wallets/:id/trades/:tradeId — trade detail
router.get('/:id/trades/:tradeId', wrap((req, res) => {
  const t = repo.getTradeById(Number(req.params.tradeId));
  if (!t) return res.status(404).json({ error: 'Trade not found', code: 'not_found' });
  res.json({ trade: enrichTrade(t) });
}));

function enrichTrade(t) {
  const market = t.condition_id ? getMarket(t.condition_id) : null;
  return {
    id: t.id,
    walletId: t.wallet_id,
    wallet: t.wallet_address,
    market: t.market_title,
    marketId: t.condition_id,
    category: market?.category ?? null,
    outcome: t.outcome,
    side: t.side,
    price: t.price,
    shares: t.shares,
    usdValue: t.usd_value,
    timestamp: t.timestamp,
    transactionHash: t.transaction_hash,
    status: t.status,
  };
}

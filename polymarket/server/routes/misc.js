// Alerts, notification settings, telegram, comparison, and health endpoints.
import express from 'express';
import * as repo from '../db/repo.js';
import { sendTelegram, isTelegramConfigured } from '../services/telegram.js';
import { renderAlertMessage } from '../services/alerts.js';

export const router = express.Router();

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) =>
  res.status(500).json({ error: err.message }));

// --- alerts ---
router.get('/alerts', wrap((req, res) => {
  const walletId = req.query.walletId ? Number(req.query.walletId) : null;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json({ alerts: repo.listAlerts({ walletId, limit }) });
}));

// POST /api/alerts/test — send a sample alert through Telegram (or dry-run)
router.post('/alerts/test', wrap(async (req, res) => {
  const sample = {
    payload: {
      wallet: '0x0000000000000000000000000000000000000000',
      traderLabel: 'Test Trader',
      market: 'Will this alert pipeline work?',
      side: 'BUY', outcome: 'YES', price: 0.43, usd: 3250,
      timestamp: Math.floor(Date.now() / 1000),
      score: 91, confidence: 'HIGH', winRate: 74, roi: 28,
    },
  };
  const text = renderAlertMessage(sample);
  if (!isTelegramConfigured()) return res.json({ delivered: false, reason: 'telegram_not_configured', preview: text });
  const result = await sendTelegram(text);
  res.json({ delivered: result.ok, result, preview: text });
}));

// --- notification settings ---
router.get('/notifications/settings', wrap((req, res) => {
  const s = repo.getSettings();
  // never expose the raw bot token
  res.json({ settings: { ...s, telegram_bot_token: s.telegram_bot_token ? '***set***' : '' } });
}));

router.put('/notifications/settings', wrap((req, res) => {
  const allowed = [
    'alert_new_trades', 'alert_large_trades', 'alert_position_changes', 'alert_high_score',
    'alert_unusual', 'min_trade_usd', 'very_large_usd', 'min_trader_score',
  ];
  const patch = {};
  for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
  const s = repo.updateSettings(patch);
  res.json({ settings: { ...s, telegram_bot_token: s.telegram_bot_token ? '***set***' : '' } });
}));

// POST /api/notifications/telegram { botToken, chatId }
router.post('/notifications/telegram', wrap(async (req, res) => {
  const { botToken, chatId } = req.body || {};
  if (!botToken || !chatId) return res.status(400).json({ error: 'botToken and chatId are required' });
  repo.updateSettings({ telegram_bot_token: botToken, telegram_chat_id: chatId });
  // verify by sending a confirmation
  const result = await sendTelegram('✅ Polymarket Trader Tracker connected to this chat.', { botToken, chatId });
  res.json({ connected: result.ok, result });
}));

// --- comparison ---
// GET /api/compare?ids=1,2,3
router.get('/compare', wrap((req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter(Boolean);
  const rows = ids.map((id) => {
    const w = repo.getWalletById(id);
    if (!w) return null;
    const score = repo.getScore(id);
    const all = repo.getMetrics(id, 'all');
    const recent = repo.getMetrics(id, '30d');
    return {
      id,
      address: w.address,
      label: w.label,
      score: score?.score ?? null,
      confidence: score?.confidence ?? null,
      winRate: all?.basic?.winRate ?? null,
      roi: all?.profitability?.roi ?? null,
      totalPnl: all?.profitability?.totalPnl ?? null,
      trades: all?.basic?.totalTrades ?? repo.countTrades(id),
      maxDrawdown: all?.risk?.maxDrawdown ?? null,
      recentRoi: recent?.profitability?.roi ?? null,
    };
  }).filter(Boolean);
  res.json({ traders: rows });
}));

// --- health ---
router.get('/health', wrap((req, res) => {
  res.json({
    ok: true,
    dataSource: process.env.DATA_SOURCE || 'polymarket',
    telegram: isTelegramConfigured(),
    wallets: repo.listWallets().length,
    time: new Date().toISOString(),
  });
}));

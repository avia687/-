import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrade, renderAlertMessage } from '../server/services/alerts.js';

const baseSettings = {
  alert_new_trades: 1, alert_large_trades: 1, alert_position_changes: 1,
  alert_high_score: 1, alert_unusual: 1,
  min_trade_usd: 500, very_large_usd: 5000, min_trader_score: 80,
};

const profile = {
  wallet: { label: 'Whale' },
  score: { score: 91, confidence: 'HIGH' },
  windows: { all: { basic: { winRate: 70 }, profitability: { roi: 25 }, behavior: { avgPositionSize: 340 } } },
};

const mkTrade = (over = {}) => ({
  id: 1, wallet_id: 1, wallet_address: '0x' + '1'.repeat(40),
  market_title: 'Test market', condition_id: '0xm', side: 'BUY', outcome: 'YES',
  price: 0.43, usd_value: 1000, timestamp: 1700000000, ...over,
});

test('a normal-sized trade above the min raises new + large alerts', () => {
  const alerts = evaluateTrade({ trade: mkTrade({ usd_value: 1000 }), profile, settings: baseSettings, walletTradeHistory: [] });
  const kinds = alerts.map((a) => a.kind);
  assert.ok(kinds.includes('new_trade'));
  assert.ok(kinds.includes('large_trade'));
});

test('a very large trade raises very_large_trade', () => {
  const alerts = evaluateTrade({ trade: mkTrade({ usd_value: 8000 }), profile, settings: baseSettings, walletTradeHistory: [] });
  assert.ok(alerts.some((a) => a.kind === 'very_large_trade'));
});

test('unusual-size alert fires at >=5x baseline', () => {
  // baseline avg 340; 8500 is 25x
  const alerts = evaluateTrade({ trade: mkTrade({ usd_value: 8500 }), profile, settings: baseSettings, walletTradeHistory: [] });
  const unusual = alerts.find((a) => a.kind === 'unusual_size');
  assert.ok(unusual);
  assert.ok(unusual.payload.multiple >= 5);
});

test('high-score alert fires for score >= threshold', () => {
  const alerts = evaluateTrade({ trade: mkTrade(), profile, settings: baseSettings, walletTradeHistory: [] });
  assert.ok(alerts.some((a) => a.kind === 'high_score_trader'));
});

test('below-min trades are filtered out', () => {
  const alerts = evaluateTrade({ trade: mkTrade({ usd_value: 100 }), profile, settings: baseSettings, walletTradeHistory: [] });
  assert.ok(!alerts.some((a) => a.kind === 'large_trade'));
  // new_trade also filtered because usd < min_trade_usd
  assert.ok(!alerts.some((a) => a.kind === 'new_trade'));
});

test('new_market alert fires only on first trade in a market', () => {
  const history = [mkTrade({ id: 2, condition_id: '0xother' })];
  const alerts = evaluateTrade({ trade: mkTrade({ id: 1, condition_id: '0xm' }), profile, settings: baseSettings, walletTradeHistory: history });
  assert.ok(alerts.some((a) => a.kind === 'new_market'));
});

test('alert message renders UNKNOWN for missing fields, never fabricated', () => {
  const msg = renderAlertMessage({ payload: { wallet: '0xabc', side: 'BUY', price: null, usd: null, score: null, confidence: 'INSUFFICIENT', winRate: null, roi: null } });
  assert.match(msg, /Price: UNKNOWN/);
  assert.match(msg, /Position Size: UNKNOWN/);
  assert.match(msg, /not a prediction/);
});

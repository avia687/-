import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRoundTrips, computeMetrics, computeAllWindows } from '../server/services/analytics.js';

// Helper to build a trade quickly.
const T = (side, price, shares, ts, asset = 'A', marketId = 'M') => ({
  side, price, shares, usdValue: price * shares, timestamp: ts, asset, marketId,
});

test('FIFO round-trip matching computes realized P&L correctly', () => {
  // buy 100 @ 0.40, sell 100 @ 0.60 -> pnl = (0.60-0.40)*100 = 20
  const { roundTrips } = computeRoundTrips([T('BUY', 0.4, 100, 1), T('SELL', 0.6, 100, 2)]);
  assert.equal(roundTrips.length, 1);
  assert.equal(roundTrips[0].pnl, 20);
  assert.equal(roundTrips[0].returnPct, 50);
  assert.equal(roundTrips[0].holdSeconds, 1);
});

test('partial FIFO matching across multiple lots', () => {
  const { roundTrips } = computeRoundTrips([
    T('BUY', 0.4, 100, 1),
    T('BUY', 0.5, 100, 2),
    T('SELL', 0.7, 150, 3),
  ]);
  // 100 from lot@0.4 -> (0.7-0.4)*100=30 ; 50 from lot@0.5 -> (0.7-0.5)*50=10
  const total = roundTrips.reduce((s, r) => s + r.pnl, 0);
  assert.equal(Math.round(total * 100) / 100, 40);
});

test('unmatched sells are counted, not fabricated into P&L', () => {
  const { roundTrips, unmatchedSells } = computeRoundTrips([T('SELL', 0.5, 100, 1)]);
  assert.equal(roundTrips.length, 0);
  assert.equal(unmatchedSells, 1);
});

test('win rate, profit factor, drawdown over a small book', () => {
  const trades = [
    T('BUY', 0.5, 100, 1), T('SELL', 0.7, 100, 2),   // +20 win
    T('BUY', 0.5, 100, 3), T('SELL', 0.4, 100, 4),   // -10 loss
    T('BUY', 0.5, 100, 5), T('SELL', 0.6, 100, 6),   // +10 win
  ];
  const m = computeMetrics(trades);
  assert.equal(m.basic.closedRoundTrips, 3);
  assert.equal(m.basic.winningTrades, 2);
  assert.equal(m.basic.losingTrades, 1);
  assert.equal(m.basic.winRate, round2((2 / 3) * 100));
  assert.equal(m.profitability.realizedPnl, 20);
  assert.equal(m.profitability.profitFactor, 3); // gross profit 30 / gross loss 10
  // equity path: +20, +10, +20 -> peak 20 then dip to 10 -> drawdown -10
  assert.equal(m.risk.maxDrawdown, -10);
});

test('ROI uses matched invested capital', () => {
  const m = computeMetrics([T('BUY', 0.5, 100, 1), T('SELL', 0.75, 100, 2)]);
  // pnl 25 on cost 50 -> 50%
  assert.equal(m.profitability.roi, 50);
});

test('incomplete price/size excluded and flagged', () => {
  const trades = [
    { side: 'BUY', price: null, shares: 100, usdValue: null, timestamp: 1, asset: 'A' },
    T('BUY', 0.5, 100, 2), T('SELL', 0.6, 100, 3),
  ];
  const m = computeMetrics(trades);
  assert.equal(m.dataQuality.priceSharesIncomplete, true);
  assert.equal(m.basic.closedRoundTrips, 1);
});

test('windowed analysis filters by timestamp', () => {
  const now = Math.floor(Date.now() / 1000);
  const trades = [
    T('BUY', 0.5, 100, now - 100 * 86400), T('SELL', 0.6, 100, now - 99 * 86400), // old
    T('BUY', 0.5, 100, now - 2 * 3600), T('SELL', 0.6, 100, now - 1 * 3600),       // recent
  ];
  const w = computeAllWindows(trades);
  assert.equal(w['24h'].basic.totalTrades, 2);
  assert.equal(w.all.basic.totalTrades, 4);
});

function round2(x) { return Math.round(x * 100) / 100; }

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../server/services/analytics.js';
import { computeScore, confidenceFromSample } from '../server/services/score.js';

const T = (side, price, shares, ts) => ({ side, price, shares, usdValue: price * shares, timestamp: ts, asset: 'A', marketId: 'M' });

// Build N winning round-trips.
function winningBook(n, edge = 0.1) {
  const trades = [];
  let ts = 1;
  for (let i = 0; i < n; i++) {
    trades.push(T('BUY', 0.5, 100, ts++));
    trades.push(T('SELL', 0.5 + edge, 100, ts++));
  }
  return trades;
}

test('confidence tiers scale with sample size', () => {
  assert.equal(confidenceFromSample(0).level, 'INSUFFICIENT');
  assert.equal(confidenceFromSample(3).level, 'LOW');
  assert.equal(confidenceFromSample(30).level, 'MEDIUM');
  assert.equal(confidenceFromSample(120).level, 'HIGH');
});

test('a 3-win trader does NOT get a near-perfect score (sample-size shrink)', () => {
  const m = computeMetrics(winningBook(3));
  const s = computeScore(m, m);
  assert.ok(s.score < 80, `expected shrunk score, got ${s.score}`);
  assert.equal(s.confidence, 'LOW');
});

test('a 120-win consistent trader scores high with HIGH confidence', () => {
  const m = computeMetrics(winningBook(120));
  const s = computeScore(m, m);
  assert.equal(s.confidence, 'HIGH');
  assert.ok(s.score > 70, `expected strong score, got ${s.score}`);
});

test('insufficient data yields null score, not a fabricated number', () => {
  const m = computeMetrics([T('BUY', 0.5, 100, 1)]); // no closed trades
  const s = computeScore(m, m);
  assert.equal(s.score, null);
  assert.equal(s.confidence, 'INSUFFICIENT');
});

test('score comes with explanation reasons', () => {
  const m = computeMetrics(winningBook(40));
  const s = computeScore(m, m);
  assert.ok(Array.isArray(s.reasons) && s.reasons.length > 0);
  assert.ok(s.reasons.every((r) => r.sign === '+' || r.sign === '-'));
});

test('weights sum to 1.0', () => {
  const m = computeMetrics(winningBook(40));
  const s = computeScore(m, m);
  const total = Object.values(s.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

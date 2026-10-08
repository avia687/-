import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrade, dedupeTrades, buildDedupeKey, normalizePosition } from '../server/services/normalize.js';

const rawTrade = {
  proxyWallet: '0xABC0000000000000000000000000000000000000',
  timestamp: 1700000000,
  conditionId: '0xmarket1',
  size: 100,
  usdcSize: 43,
  transactionHash: '0xdeadbeef',
  price: 0.43,
  asset: '0xtokenYES',
  side: 'BUY',
  outcome: 'YES',
  title: 'Some market',
};

test('normalizes a raw Data API trade into canonical shape', () => {
  const t = normalizeTrade(rawTrade, rawTrade.proxyWallet);
  assert.equal(t.wallet, '0xabc0000000000000000000000000000000000000');
  assert.equal(t.side, 'BUY');
  assert.equal(t.price, 0.43);
  assert.equal(t.shares, 100);
  assert.equal(t.usdValue, 43);
  assert.equal(t.marketId, '0xmarket1');
  assert.equal(t.tokenId, '0xtokenYES');
  assert.equal(t.timestamp, 1700000000);
});

test('derives usdValue from price*shares when usdcSize missing', () => {
  const t = normalizeTrade({ ...rawTrade, usdcSize: undefined }, rawTrade.proxyWallet);
  assert.equal(t.usdValue, 0.43 * 100);
});

test('missing economic fields become null, never fabricated', () => {
  const t = normalizeTrade({ proxyWallet: '0x' + '1'.repeat(40), side: 'SELL' }, '0x' + '1'.repeat(40));
  assert.equal(t.price, null);
  assert.equal(t.shares, null);
  assert.equal(t.usdValue, null);
  assert.equal(t.timestamp, null);
});

test('converts millisecond timestamps to seconds', () => {
  const t = normalizeTrade({ ...rawTrade, timestamp: 1700000000000 }, rawTrade.proxyWallet);
  assert.equal(t.timestamp, 1700000000);
});

test('unknown side maps to UNKNOWN', () => {
  const t = normalizeTrade({ ...rawTrade, side: 'weird' }, rawTrade.proxyWallet);
  assert.equal(t.side, 'UNKNOWN');
});

test('dedupe removes duplicate logical trades', () => {
  const a = normalizeTrade(rawTrade, rawTrade.proxyWallet);
  const b = normalizeTrade({ ...rawTrade }, rawTrade.proxyWallet);
  const c = normalizeTrade({ ...rawTrade, transactionHash: '0xother' }, rawTrade.proxyWallet);
  const out = dedupeTrades([a, b, c]);
  assert.equal(out.length, 2);
});

test('dedupe key prefers tx hash + token + side', () => {
  const key = buildDedupeKey({ transactionHash: '0xhash', tokenId: '0xtok', side: 'BUY' });
  assert.equal(key, 'tx:0xhash:0xtok:BUY');
});

test('normalizePosition keeps nullable P&L honest', () => {
  const p = normalizePosition({ asset: '0xt', size: 10, cashPnl: undefined, realizedPnl: 5 });
  assert.equal(p.cashPnl, null);
  assert.equal(p.realizedPnl, 5);
});

// API integration test — boots the Express app against a temp DB in fixture
// mode and exercises the wallet lifecycle end-to-end over HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_SOURCE = 'fixture';
process.env.MONITOR_ENABLED = 'false';
process.env.DATABASE_FILE = path.join(os.tmpdir(), `pmt-api-${Date.now()}.db`);

const { createApp } = await import('../server/index.js');

let server;
let base;

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  server?.close();
  try { fs.rmSync(process.env.DATABASE_FILE, { force: true }); } catch {}
});

const j = async (method, p, body) => {
  const res = await fetch(base + p, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('health endpoint reports fixture data source', async () => {
  const { status, body } = await j('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.dataSource, 'fixture');
});

test('rejects an invalid wallet address', async () => {
  const { status, body } = await j('POST', '/api/wallets', { address: '0x123' });
  assert.equal(status, 400);
  assert.equal(body.code, 'invalid_address');
});

let walletId;
test('adds a wallet and imports history', async () => {
  const addr = '0x' + '7'.repeat(40);
  const { status, body } = await j('POST', '/api/wallets', { address: addr, label: 'API Test' });
  assert.equal(status, 201);
  assert.ok(body.imported > 0);
  walletId = body.wallet.id;
});

test('duplicate wallet is rejected with 409', async () => {
  const addr = '0x' + '7'.repeat(40);
  const { status } = await j('POST', '/api/wallets', { address: addr });
  assert.equal(status, 409);
});

test('returns a full profile with score + metrics', async () => {
  const { status, body } = await j('GET', `/api/wallets/${walletId}`);
  assert.equal(status, 200);
  assert.ok(body.profile.windows.all.basic.totalTrades > 0);
  assert.ok('score' in body.profile);
  assert.ok(Array.isArray(body.profile.styles));
});

test('lists trades and a single trade detail', async () => {
  const list = await j('GET', `/api/wallets/${walletId}/trades?limit=5`);
  assert.equal(list.status, 200);
  assert.ok(list.body.trades.length > 0);
  const tradeId = list.body.trades[0].id;
  const detail = await j('GET', `/api/wallets/${walletId}/trades/${tradeId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.trade.id, tradeId);
});

test('score endpoint returns confidence', async () => {
  const { status, body } = await j('GET', `/api/wallets/${walletId}/score`);
  assert.equal(status, 200);
  assert.ok(['LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT'].includes(body.score.confidence));
});

test('updates notification settings without exposing the bot token', async () => {
  const { status, body } = await j('PUT', '/api/notifications/settings', { min_trade_usd: 750 });
  assert.equal(status, 200);
  assert.equal(body.settings.min_trade_usd, 750);
  assert.notEqual(body.settings.telegram_bot_token, undefined);
});

test('alert test endpoint returns a preview when telegram not configured', async () => {
  const { status, body } = await j('POST', '/api/alerts/test');
  assert.equal(status, 200);
  assert.equal(body.delivered, false);
  assert.match(body.preview, /POLYMARKET ALERT/);
});

test('deletes the wallet', async () => {
  const { status, body } = await j('DELETE', `/api/wallets/${walletId}`);
  assert.equal(status, 200);
  assert.equal(body.deleted, true);
});

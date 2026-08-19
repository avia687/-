// Fixture data provider — deterministic, SYNTHETIC data used for offline
// development, CI, and demos. It intentionally mirrors the exact record shape
// of the live Polymarket Data API so the rest of the system is identical in
// both modes. This data is NOT real trader activity and is clearly generated;
// it must never be presented to a user as real on-chain data.
//
// A seeded PRNG derives a plausible trade history from the wallet address, so
// any address produces a stable, realistic-looking dataset. A runtime overlay
// file (data/fixture-live/<address>.json) lets the monitoring simulation inject
// genuinely-new trades that live sync will then detect.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export const name = 'fixture';

const OVERLAY_DIR = path.join(config.root, 'data', 'fixture-live');

// --- seeded PRNG (mulberry32) over a hash of the address ---------------------
function seedFromAddress(addr) {
  let h = 2166136261;
  for (const ch of addr.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MARKETS = [
  { conditionId: '0xmarket_election2028', title: 'Will Party A win the 2028 election?', outcome: 'YES', cat: 'Politics' },
  { conditionId: '0xmarket_btc150k', title: 'Bitcoin above $150k by year end?', outcome: 'YES', cat: 'Crypto' },
  { conditionId: '0xmarket_superbowl', title: 'Will the home team win the Super Bowl?', outcome: 'NO', cat: 'Sports' },
  { conditionId: '0xmarket_fedcut', title: 'Fed rate cut at next meeting?', outcome: 'YES', cat: 'Finance' },
  { conditionId: '0xmarket_ai_agi', title: 'AGI declared by a major lab this year?', outcome: 'NO', cat: 'Technology' },
  { conditionId: '0xmarket_worldcup', title: 'Will the favourite reach the World Cup final?', outcome: 'YES', cat: 'Sports' },
  { conditionId: '0xmarket_eth5k', title: 'Ethereum above $5k this quarter?', outcome: 'YES', cat: 'Crypto' },
];

// Generate a deterministic pseudo-history: a sequence of entry/exit pairs so
// realized P&L is derivable. Records use the live Data API field names.
function generateTrades(address) {
  const rnd = mulberry32(seedFromAddress(address));
  const nowSec = Math.floor(Date.now() / 1000);
  const numPositions = 20 + Math.floor(rnd() * 40); // 20..60 round-trips
  const trades = [];
  let cursor = nowSec - 120 * 24 * 3600; // start ~120 days ago

  for (let i = 0; i < numPositions; i++) {
    const m = MARKETS[Math.floor(rnd() * MARKETS.length)];
    const entryPrice = 0.2 + rnd() * 0.6; // 0.2..0.8
    const size = Math.round((50 + rnd() * 950)); // 50..1000 shares
    const gapH = 1 + Math.floor(rnd() * 72);
    cursor += gapH * 3600;
    const txA = '0x' + (seedFromAddress(address + i + 'a')).toString(16).padStart(8, '0').repeat(8).slice(0, 64);
    trades.push(mkRaw(address, m, 'BUY', entryPrice, size, cursor, txA));

    // 80% of positions are later closed; edge biased by address seed so some
    // wallets are winners and some losers.
    if (rnd() < 0.82) {
      const skill = (seedFromAddress(address) % 100) / 100; // 0..1 skill proxy
      const drift = (rnd() - 0.5) * 0.3 + (skill - 0.45) * 0.25;
      let exitPrice = Math.min(0.99, Math.max(0.01, entryPrice + drift));
      const holdH = 2 + Math.floor(rnd() * 240);
      cursor += holdH * 3600;
      const txB = '0x' + (seedFromAddress(address + i + 'b')).toString(16).padStart(8, '0').repeat(8).slice(0, 64);
      trades.push(mkRaw(address, m, 'SELL', exitPrice, size, cursor, txB));
    }
  }
  // Anchor the series so the most recent generated trade sits ~2 days in the
  // past (cumulative random gaps would otherwise drift into the future, which
  // would push the sync cursor ahead of "now" and hide freshly-injected trades).
  if (trades.length) {
    const maxTs = Math.max(...trades.map((t) => t.timestamp));
    const shift = nowSec - 2 * 24 * 3600 - maxTs;
    if (shift !== 0) for (const t of trades) t.timestamp += shift;
  }
  return trades;
}

function mkRaw(address, m, side, price, size, ts, txHash) {
  const rounded = Math.round(price * 100) / 100;
  return {
    proxyWallet: address.toLowerCase(),
    timestamp: ts,
    conditionId: m.conditionId,
    type: 'TRADE',
    size,
    usdcSize: Math.round(rounded * size * 100) / 100,
    transactionHash: txHash,
    price: rounded,
    asset: m.conditionId + ':' + m.outcome,
    side,
    outcome: m.outcome,
    title: m.title,
    _category: m.cat, // fixture-only hint used by fixture fetchMarket
  };
}

function readOverlay(address) {
  const file = path.join(OVERLAY_DIR, address.toLowerCase() + '.json');
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

// Public API mirrors providers/polymarket.js -------------------------------
export async function fetchTrades(address, { sinceTs = null } = {}) {
  const base = generateTrades(address);
  const overlay = readOverlay(address);
  let all = [...base, ...overlay].sort((a, b) => b.timestamp - a.timestamp); // newest first
  if (sinceTs != null) all = all.filter((t) => t.timestamp > sinceTs - 1);
  return all;
}

export async function fetchPositions(address) {
  // Derive a couple of open positions from the last few BUYs without a SELL.
  const trades = await fetchTrades(address);
  const byMarket = new Map();
  for (const t of [...trades].reverse()) {
    const key = t.asset;
    const cur = byMarket.get(key) || { net: 0, last: t };
    cur.net += t.side === 'BUY' ? t.size : -t.size;
    cur.last = t;
    byMarket.set(key, cur);
  }
  const positions = [];
  for (const [asset, { net, last }] of byMarket) {
    if (net <= 0) continue;
    const cur = Math.min(0.99, Math.max(0.01, last.price + (Math.random() - 0.5) * 0.05));
    positions.push({
      proxyWallet: address.toLowerCase(),
      asset,
      conditionId: last.conditionId,
      size: net,
      avgPrice: last.price,
      curPrice: Math.round(cur * 100) / 100,
      initialValue: Math.round(last.price * net * 100) / 100,
      currentValue: Math.round(cur * net * 100) / 100,
      cashPnl: Math.round((cur - last.price) * net * 100) / 100,
      percentPnl: Math.round(((cur - last.price) / last.price) * 10000) / 100,
      realizedPnl: 0,
      redeemable: false,
      title: last.title,
      outcome: last.outcome,
    });
  }
  return positions;
}

export async function fetchValue(address) {
  const positions = await fetchPositions(address);
  return positions.reduce((s, p) => s + (p.currentValue || 0), 0);
}

export async function fetchMarket(conditionId) {
  const m = MARKETS.find((x) => x.conditionId === conditionId);
  if (!m) return null;
  return { conditionId, title: m.title, slug: null, tags: [m.cat], category: m.cat, endDate: null, closed: false };
}

export async function probe(address) {
  const trades = await fetchTrades(address);
  return { hasActivity: trades.length > 0, sample: trades[0] || null };
}

// Test/simulation helper: append a synthetic "new" trade to the overlay so that
// a subsequent live sync detects it. Returns the injected raw record.
export function injectLiveTrade(address, partial = {}) {
  fs.mkdirSync(OVERLAY_DIR, { recursive: true });
  const m = MARKETS[partial.marketIndex ?? 1];
  const raw = mkRaw(
    address,
    m,
    partial.side || 'BUY',
    partial.price ?? 0.43,
    partial.size ?? 8500,
    partial.timestamp ?? Math.floor(Date.now() / 1000),
    partial.transactionHash || '0x' + Date.now().toString(16).padStart(64, 'f').slice(0, 64)
  );
  const file = path.join(OVERLAY_DIR, address.toLowerCase() + '.json');
  const existing = readOverlay(address);
  existing.push(raw);
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  return raw;
}

export function clearOverlay(address) {
  const file = path.join(OVERLAY_DIR, address.toLowerCase() + '.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

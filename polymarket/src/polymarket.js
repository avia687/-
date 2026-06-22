// Polymarket public API client.
//
// All endpoints used here are public, read-only and require no authentication.
// Base URLs are overridable via env vars so the app keeps working if Polymarket
// moves things around.
//
// Docs / endpoints referenced:
//   - Leaderboard : https://lb-api.polymarket.com/leaderboard
//   - Positions   : https://data-api.polymarket.com/positions
//   - Value       : https://data-api.polymarket.com/value
//   - Activity    : https://data-api.polymarket.com/activity
//
// Node 18+ ships a global `fetch`, so there are no runtime dependencies here.

const LB_API = process.env.PM_LB_API || "https://lb-api.polymarket.com";
const DATA_API = process.env.PM_DATA_API || "https://data-api.polymarket.com";
const PROFILE_URL = process.env.PM_PROFILE_URL || "https://polymarket.com/profile";

const REQUEST_TIMEOUT_MS = Number(process.env.PM_TIMEOUT_MS || 15000);

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "polymarket-scanner/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Polymarket sometimes returns a bare array, sometimes { data: [...] }.
function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.positions)) return payload.positions;
  return [];
}

function pick(obj, keys, fallback = undefined) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
}

function num(v, fallback = 0) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

// Fetch one leaderboard ("profit" or "vol") and index it by wallet.
async function fetchLeaderboard(window, orderBy, limit) {
  const url = `${LB_API}/leaderboard?window=${encodeURIComponent(
    window
  )}&limit=${limit}&orderBy=${orderBy}`;
  const rows = asArray(await fetchJson(url));
  const map = new Map();
  rows.forEach((row, i) => {
    const wallet = String(
      pick(row, ["proxyWallet", "wallet", "address", "user"], "")
    ).toLowerCase();
    if (!wallet) return;
    map.set(wallet, {
      wallet,
      name: pick(row, ["name", "displayName"], ""),
      pseudonym: pick(row, ["pseudonym", "username"], ""),
      avatar: pick(row, ["profileImage", "image", "avatar"], ""),
      amount: num(pick(row, ["amount", "value", "profit", "pnl", "vol"], 0)),
      rank: i + 1,
    });
  });
  return map;
}

// Merge the profit and volume leaderboards into a single trader list.
export async function getTraders({ window = "all", limit = 50 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [profitMap, volMap] = await Promise.all([
    fetchLeaderboard(window, "profit", capped),
    fetchLeaderboard(window, "vol", capped).catch(() => new Map()),
  ]);

  const traders = [];
  for (const [wallet, p] of profitMap) {
    const v = volMap.get(wallet);
    const profit = p.amount;
    const volume = v ? v.amount : 0;
    traders.push(
      buildTrader({
        wallet,
        name: p.name || (v && v.name) || "",
        pseudonym: p.pseudonym || (v && v.pseudonym) || "",
        avatar: p.avatar || (v && v.avatar) || "",
        profit,
        volume,
      })
    );
  }

  // Volume-only whales who aren't in the profit list still matter.
  for (const [wallet, v] of volMap) {
    if (profitMap.has(wallet)) continue;
    traders.push(
      buildTrader({
        wallet,
        name: v.name,
        pseudonym: v.pseudonym,
        avatar: v.avatar,
        profit: 0,
        volume: v.amount,
      })
    );
  }

  return traders;
}

// Derive ROI / score and a stable display object for a trader.
export function buildTrader({ wallet, name, pseudonym, avatar, profit, volume }) {
  const roi = volume > 0 ? (profit / volume) * 100 : 0;
  return {
    wallet,
    name: name || pseudonym || shortWallet(wallet),
    pseudonym: pseudonym || "",
    avatar: avatar || "",
    profileUrl: `${PROFILE_URL}/${wallet}`,
    profit: round(profit),
    volume: round(volume),
    roi: round(roi, 2),
    score: 0, // filled in by the scanner
  };
}

// ---------------------------------------------------------------------------
// Per-trader detail
// ---------------------------------------------------------------------------

export async function getTraderDetail(wallet) {
  const w = String(wallet).toLowerCase();
  const [positions, value, activity] = await Promise.all([
    fetchJson(`${DATA_API}/positions?user=${w}&sizeThreshold=1&sortBy=CURRENT`)
      .then(asArray)
      .catch(() => []),
    fetchJson(`${DATA_API}/value?user=${w}`)
      .then((d) => num(pick(asArray(d)[0] || {}, ["value"], 0)))
      .catch(() => 0),
    fetchJson(`${DATA_API}/activity?user=${w}&limit=40`)
      .then(asArray)
      .catch(() => []),
  ]);

  const normPositions = positions.map(normalizePosition).filter(Boolean);
  const wins = normPositions.filter((p) => p.pnl > 0).length;
  const winRate = normPositions.length
    ? round((wins / normPositions.length) * 100, 1)
    : 0;
  const unrealized = round(
    normPositions.reduce((s, p) => s + p.pnl, 0)
  );

  return {
    wallet: w,
    profileUrl: `${PROFILE_URL}/${w}`,
    totalValue: round(value),
    unrealizedPnl: unrealized,
    winRate,
    openPositions: normPositions.length,
    positions: normPositions.slice(0, 25),
    activity: activity.map(normalizeActivity).filter(Boolean).slice(0, 25),
  };
}

function normalizePosition(p) {
  if (!p) return null;
  const size = num(pick(p, ["size", "shares"], 0));
  const cur = num(pick(p, ["curPrice", "currentPrice", "price"], 0));
  const avg = num(pick(p, ["avgPrice", "averagePrice"], 0));
  const value = num(pick(p, ["currentValue", "value"], size * cur));
  const pnl = num(pick(p, ["cashPnl", "pnl", "unrealizedPnl"], (cur - avg) * size));
  return {
    market: pick(p, ["title", "market", "question", "eventTitle"], "Unknown market"),
    outcome: pick(p, ["outcome"], ""),
    size: round(size),
    avgPrice: round(avg, 3),
    curPrice: round(cur, 3),
    value: round(value),
    pnl: round(pnl),
    pnlPct: round(num(pick(p, ["percentPnl"], avg ? ((cur - avg) / avg) * 100 : 0)), 1),
  };
}

function normalizeActivity(a) {
  if (!a) return null;
  const ts = num(pick(a, ["timestamp", "time"], 0));
  return {
    type: pick(a, ["type", "side"], "TRADE"),
    side: pick(a, ["side"], ""),
    market: pick(a, ["title", "market", "question"], "Unknown market"),
    outcome: pick(a, ["outcome"], ""),
    size: round(num(pick(a, ["size", "shares"], 0))),
    price: round(num(pick(a, ["price"], 0)), 3),
    usdValue: round(num(pick(a, ["usdcSize", "usdValue", "value"], 0))),
    timestamp: ts > 1e12 ? ts : ts * 1000, // normalise to ms
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function shortWallet(w) {
  if (!w || w.length < 10) return w || "";
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(num(n) * f) / f;
}

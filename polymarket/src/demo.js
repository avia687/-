// Deterministic demo data.
//
// Used as a fallback whenever the live Polymarket API can't be reached (e.g.
// during local development behind a firewall) so the site is fully usable and
// "ready" out of the box. The data is generated from a fixed seed so it stays
// stable between requests — following a trader, opening their profile, etc. all
// keep working.

import { buildTrader, shortWallet } from "./polymarket.js";

// Tiny deterministic PRNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const NAMES = [
  "WhaleHunter", "DegenKing", "OracleEyes", "PolyProphet", "RiskOn", "EdgeFinder",
  "MarketMaven", "ChainSage", "AlphaSeeker", "TheBaron", "VolatilityVic", "QuietMoney",
  "BetBetter", "GammaGod", "FadeTheNews", "SharpShooter", "ContraView", "MoonMath",
  "SignalScout", "LiquidityLarry", "TailRisk", "ConvexCarl", "BlackSwanBae", "MeanRevert",
  "ParityPete", "ImpliedIzzy", "ResolveRex", "YesNoYoda", "BinaryBae", "SizeMatters",
  "ColdBlooded", "PatientPanda", "GreedIsGood", "NumbersNed", "ProbablyRight", "TheGrinder",
  "SwingState", "ElectionEd", "CryptoCassie", "SportsSavant", "MacroMolly", "TheCloser",
  "FuturePast", "BayesianBob", "KellyCriterion", "HedgeHog", "ZeroSumZoe", "PositiveEV",
  "TheScanner", "DiamondHands",
];

const MARKETS = [
  "Will Bitcoin hit $150k in 2026?",
  "US Presidential Election 2028 winner",
  "Will the Fed cut rates in Q3 2026?",
  "Champions League 2026 winner",
  "Will ETH flip BTC by 2027?",
  "Government shutdown before July 2026?",
  "Will GPT-6 release in 2026?",
  "NBA Finals 2026 champion",
  "Will oil close above $90 this quarter?",
  "Next country to adopt Bitcoin as legal tender",
  "Will SpaceX reach Mars orbit by 2027?",
  "Super Bowl LXI winner",
  "Will US inflation be under 3% in December?",
  "AI company to reach $5T market cap first",
  "Will there be a recession in 2026?",
];

function randomWallet(rand) {
  const hex = "0123456789abcdef";
  let w = "0x";
  for (let i = 0; i < 40; i++) w += hex[Math.floor(rand() * 16)];
  return w;
}

let CACHE = null;

// Build the full demo universe once.
function buildUniverse() {
  if (CACHE) return CACHE;
  const rand = rng(1337);
  const traders = NAMES.map((name, i) => {
    const wallet = randomWallet(rand);
    // Top of the list is much more profitable than the tail.
    const tier = 1 - i / NAMES.length;
    const profit = Math.round((rand() * 0.6 + tier * 1.4) * 850000 - 40000);
    const volume = Math.round((rand() * 0.5 + tier + 0.2) * 4200000 + 50000);
    const t = buildTrader({
      wallet,
      name,
      pseudonym: name.toLowerCase(),
      avatar: "",
      profit,
      volume,
    });
    return t;
  });
  CACHE = traders;
  return traders;
}

export function getDemoTraders() {
  // Return shallow copies so the scanner can mutate rank/score safely.
  return buildUniverse().map((t) => ({ ...t }));
}

export function getDemoTraderDetail(wallet) {
  const w = String(wallet).toLowerCase();
  const base = buildUniverse().find((t) => t.wallet === w);
  const rand = rng(hashString(w));

  const nPositions = 4 + Math.floor(rand() * 6);
  const used = new Set();
  const positions = [];
  for (let i = 0; i < nPositions; i++) {
    let mi = Math.floor(rand() * MARKETS.length);
    while (used.has(mi) && used.size < MARKETS.length) mi = Math.floor(rand() * MARKETS.length);
    used.add(mi);
    const outcome = rand() > 0.5 ? "Yes" : "No";
    const avg = Math.round((0.15 + rand() * 0.6) * 1000) / 1000;
    const cur = Math.max(0.01, Math.min(0.99, avg + (rand() - 0.42) * 0.35));
    const size = Math.round((rand() * 9000 + 500));
    const value = Math.round(size * cur);
    const pnl = Math.round((cur - avg) * size);
    positions.push({
      market: MARKETS[mi],
      outcome,
      size,
      avgPrice: avg,
      curPrice: Math.round(cur * 1000) / 1000,
      value,
      pnl,
      pnlPct: Math.round(((cur - avg) / avg) * 1000) / 10,
    });
  }
  positions.sort((a, b) => b.value - a.value);

  const nActivity = 8 + Math.floor(rand() * 10);
  const activity = [];
  let when = Date.now();
  for (let i = 0; i < nActivity; i++) {
    when -= Math.floor(rand() * 36 * 3600 * 1000);
    const mi = Math.floor(rand() * MARKETS.length);
    const price = Math.round((0.1 + rand() * 0.8) * 1000) / 1000;
    const size = Math.round(rand() * 8000 + 200);
    activity.push({
      type: rand() > 0.5 ? "BUY" : "SELL",
      side: rand() > 0.5 ? "BUY" : "SELL",
      market: MARKETS[mi],
      outcome: rand() > 0.5 ? "Yes" : "No",
      size,
      price,
      usdValue: Math.round(size * price),
      timestamp: when,
    });
  }

  const wins = positions.filter((p) => p.pnl > 0).length;
  const winRate = positions.length ? Math.round((wins / positions.length) * 1000) / 10 : 0;
  const unrealized = positions.reduce((s, p) => s + p.pnl, 0);

  return {
    wallet: w,
    name: base ? base.name : shortWallet(w),
    profileUrl: `https://polymarket.com/profile/${w}`,
    totalValue: positions.reduce((s, p) => s + p.value, 0),
    unrealizedPnl: unrealized,
    winRate,
    openPositions: positions.length,
    positions,
    activity,
  };
}

// Normalization layer: converts raw records from any data source into a single
// canonical Trade shape, and builds a stable dedupe key.
//
// Canonical Trade:
//   { wallet, market, marketId, outcome, tokenId, side, price, shares,
//     usdValue, timestamp, transactionHash, status, dedupeKey, raw }
//
// Missing fields are set to null (never fabricated). usdValue is derived from
// the source's usdcSize when present, otherwise from price*shares when BOTH are
// present, otherwise null.

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const toTs = (v) => {
  const n = toNum(v);
  if (n === null) return null;
  // Heuristic: treat >10^12 as milliseconds, else seconds.
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
};

const normSide = (v) => {
  if (!v) return 'UNKNOWN';
  const s = String(v).toUpperCase();
  if (s === 'BUY' || s === 'B') return 'BUY';
  if (s === 'SELL' || s === 'S') return 'SELL';
  return 'UNKNOWN';
};

// Normalize a single raw Polymarket Data API /trades record.
export function normalizeTrade(raw, walletAddress) {
  const wallet = (raw.proxyWallet || raw.wallet || walletAddress || '').toLowerCase() || null;
  const price = toNum(raw.price);
  const shares = toNum(raw.size ?? raw.shares);
  let usdValue = toNum(raw.usdcSize ?? raw.usdValue ?? raw.usd_value);
  if (usdValue === null && price !== null && shares !== null) usdValue = price * shares;

  const timestamp = toTs(raw.timestamp ?? raw.match_time ?? raw.matchTime);
  const marketId = raw.conditionId ?? raw.condition_id ?? raw.market ?? null;
  const tokenId = raw.asset ?? raw.asset_id ?? raw.tokenId ?? null;
  const txHash = raw.transactionHash ?? raw.transaction_hash ?? raw.txHash ?? null;
  const outcome = raw.outcome ?? null;
  const side = normSide(raw.side);

  const trade = {
    wallet,
    market: raw.title ?? raw.market_title ?? null,
    marketId: marketId || null,
    outcome,
    tokenId: tokenId || null,
    side,
    price,
    shares,
    usdValue,
    timestamp,
    transactionHash: txHash,
    status: raw.status ?? 'confirmed',
    raw,
  };
  trade.dedupeKey = buildDedupeKey(trade);
  return trade;
}

// A stable identifier for a logical trade. Prefer the strongest unique signal
// available (tx hash + token + side), and fall back to a composite of the
// economic fields so that even without a tx hash we don't double-count.
export function buildDedupeKey(t) {
  if (t.transactionHash && t.tokenId) {
    return `tx:${t.transactionHash}:${t.tokenId}:${t.side}`;
  }
  if (t.transactionHash) return `tx:${t.transactionHash}:${t.side}:${t.price ?? 'na'}`;
  return [
    'c',
    t.wallet ?? 'na',
    t.marketId ?? 'na',
    t.tokenId ?? 'na',
    t.side,
    t.price ?? 'na',
    t.shares ?? 'na',
    t.timestamp ?? 'na',
  ].join(':');
}

// Deduplicate an in-memory array of normalized trades by dedupeKey.
export function dedupeTrades(trades) {
  const seen = new Set();
  const out = [];
  for (const t of trades) {
    if (seen.has(t.dedupeKey)) continue;
    seen.add(t.dedupeKey);
    out.push(t);
  }
  return out;
}

// Normalize a raw Data API /positions record.
export function normalizePosition(raw) {
  return {
    conditionId: raw.conditionId ?? raw.condition_id ?? null,
    asset: raw.asset ?? null,
    title: raw.title ?? null,
    outcome: raw.outcome ?? null,
    size: toNum(raw.size),
    avgPrice: toNum(raw.avgPrice),
    curPrice: toNum(raw.curPrice),
    initialValue: toNum(raw.initialValue),
    currentValue: toNum(raw.currentValue),
    cashPnl: toNum(raw.cashPnl),
    percentPnl: toNum(raw.percentPnl),
    realizedPnl: toNum(raw.realizedPnl),
    redeemable: raw.redeemable == null ? null : Boolean(raw.redeemable),
  };
}

export const _internal = { toNum, toTs, normSide };

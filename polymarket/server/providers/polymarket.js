// Live Polymarket data provider. Uses the public, read-only Data API and Gamma
// API. Endpoints & fields verified against Polymarket's official & community
// documentation (docs.polymarket.com api-reference; data-api gists):
//
//   Data API  https://data-api.polymarket.com
//     GET /trades?user=<addr>&limit=&offset=
//         -> [{ proxyWallet, timestamp, conditionId, type, size, usdcSize,
//               transactionHash, price, asset, side, outcome, title }]
//     GET /positions?user=<addr>&limit=&offset=
//         -> [{ proxyWallet, asset, conditionId, size, avgPrice, initialValue,
//               currentValue, cashPnl, percentPnl, realizedPnl, curPrice,
//               redeemable, title, outcome, endDate }]
//     GET /value?user=<addr>  -> [{ user, value }]
//
//   Gamma API https://gamma-api.polymarket.com
//     GET /markets?condition_ids=<id>  -> market metadata incl. tags/category
//
// No endpoint or field here is invented; unknown fields simply come back
// undefined and are normalized to null downstream.
import { config } from '../config.js';
import { getJson } from './http.js';
import { logger } from '../logger.js';

export const name = 'polymarket';

// Fetch ALL trades for a wallet using offset pagination, newest first.
// `sinceTs` lets live sync stop early once it reaches known history.
export async function fetchTrades(address, { pageSize = 100, maxPages = 100, sinceTs = null } = {}) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const batch = await getJson(`${config.polymarket.dataApi}/trades`, {
      query: { user: address, limit: pageSize, offset: page * pageSize },
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    // Data API returns newest-first; if the oldest in this page is already
    // older than our cursor we can stop paging for live syncs.
    if (sinceTs != null) {
      const oldest = Math.min(...batch.map((t) => Number(t.timestamp) || Infinity));
      if (oldest <= sinceTs) break;
    }
    if (batch.length < pageSize) break; // last page
  }
  logger.debug('fetched trades', { address, count: out.length });
  return out;
}

export async function fetchPositions(address, { pageSize = 100, maxPages = 20 } = {}) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const batch = await getJson(`${config.polymarket.dataApi}/positions`, {
      query: { user: address, limit: pageSize, offset: page * pageSize },
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}

export async function fetchValue(address) {
  try {
    const res = await getJson(`${config.polymarket.dataApi}/value`, { query: { user: address } });
    if (Array.isArray(res) && res[0]) return Number(res[0].value);
    if (res && typeof res.value !== 'undefined') return Number(res.value);
    return null;
  } catch (err) {
    logger.warn('value fetch failed', { address, error: err.message });
    return null;
  }
}

// Best-effort market enrichment for a conditionId. Returns { title, slug,
// category, tags, endDate, closed } or null. Category is mapped from Gamma tags.
export async function fetchMarket(conditionId) {
  try {
    const res = await getJson(`${config.polymarket.gammaApi}/markets`, {
      query: { condition_ids: conditionId, limit: 1 },
    });
    const m = Array.isArray(res) ? res[0] : res;
    if (!m) return null;
    const tags = extractTags(m);
    return {
      conditionId,
      title: m.question || m.title || null,
      slug: m.slug || null,
      tags,
      category: mapCategory(tags, m),
      endDate: m.end_date_iso ? Math.floor(Date.parse(m.end_date_iso) / 1000) : null,
      closed: typeof m.closed === 'boolean' ? m.closed : null,
    };
  } catch (err) {
    logger.warn('market fetch failed', { conditionId, error: err.message });
    return null;
  }
}

function extractTags(m) {
  const tags = [];
  if (Array.isArray(m.tags)) {
    for (const t of m.tags) tags.push(typeof t === 'string' ? t : t?.label || t?.slug);
  }
  if (m.category) tags.push(m.category);
  return tags.filter(Boolean);
}

// Map raw Polymarket tags to our coarse categories. This is a heuristic over
// public tag labels — not an invented data field.
const CATEGORY_RULES = [
  ['Politics', /politic|election|president|senate|congress|govern|trump|biden|geopolit/i],
  ['Sports', /sport|nfl|nba|mlb|nhl|soccer|football|tennis|ufc|cricket|olympic|league/i],
  ['Crypto', /crypto|bitcoin|btc|ethereum|eth|solana|token|defi|coin/i],
  ['Finance', /fed|rate|inflation|stock|market cap|econom|gdp|earnings/i],
  ['Technology', /\btech\b|\bai\b|openai|nvidia|apple|google|software/i],
  ['World Events', /war|world|climate|weather|nation|country|global/i],
];

export function mapCategory(tags, market) {
  const hay = [...(tags || []), market?.question, market?.title, market?.slug]
    .filter(Boolean)
    .join(' ');
  for (const [cat, re] of CATEGORY_RULES) if (re.test(hay)) return cat;
  return tags && tags.length ? 'Other' : null;
}

// Probe: does this wallet look like it has any Polymarket activity?
export async function probe(address) {
  const trades = await fetchTrades(address, { pageSize: 1, maxPages: 1 });
  return { hasActivity: trades.length > 0, sample: trades[0] || null };
}

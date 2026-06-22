// Scanner: turns a raw trader list into a ranked, filtered "profitable traders"
// feed. This is the brain that decides who is worth following.

// Normalise a value to 0..1 across the current batch (min-max).
function normalize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return (v) => (span > 0 ? (v - min) / span : 0);
}

// Compute a composite "trader score" (0..100) from profit, ROI and volume.
// Profit is weighted most heavily, ROI rewards efficiency, volume rewards
// activity/liquidity (a tiny profit on huge volume is less impressive).
export function scoreTraders(traders) {
  if (!traders.length) return traders;

  const profitN = normalize(traders.map((t) => t.profit));
  const roiN = normalize(traders.map((t) => t.roi));
  const volN = normalize(traders.map((t) => Math.log10(Math.max(t.volume, 1))));

  for (const t of traders) {
    const score =
      profitN(t.profit) * 55 + roiN(t.roi) * 25 + volN(Math.log10(Math.max(t.volume, 1))) * 20;
    t.score = Math.round(score * 10) / 10;
  }
  return traders;
}

// Apply user filters + sorting to a scored trader list.
export function scanTraders(traders, opts = {}) {
  const {
    sort = "score",
    minProfit = 0,
    minVolume = 0,
    minRoi = -Infinity,
    q = "",
    limit = 50,
  } = opts;

  const needle = String(q).trim().toLowerCase();

  let out = traders.filter((t) => {
    if (t.profit < minProfit) return false;
    if (t.volume < minVolume) return false;
    if (t.roi < minRoi) return false;
    if (needle) {
      const hay = `${t.name} ${t.pseudonym} ${t.wallet}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const sorters = {
    score: (a, b) => b.score - a.score,
    profit: (a, b) => b.profit - a.profit,
    volume: (a, b) => b.volume - a.volume,
    roi: (a, b) => b.roi - a.roi,
  };
  out.sort(sorters[sort] || sorters.score);

  out = out.slice(0, Math.min(Math.max(Number(limit) || 50, 1), 100));
  out.forEach((t, i) => (t.rank = i + 1));
  return out;
}

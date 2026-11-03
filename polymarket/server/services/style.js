// Trader style detection — data-driven labels derived from real behaviour
// metrics. Each label carries the evidence that triggered it, so nothing is
// asserted without a number behind it. A trader can match several labels.
export function detectStyles(metricsAll) {
  const beh = metricsAll.behavior;
  const risk = metricsAll.risk;
  const basic = metricsAll.basic;
  const styles = [];

  const add = (label, evidence) => styles.push({ label, evidence });

  const avgHoldH = beh.avgHoldingSeconds != null ? beh.avgHoldingSeconds / 3600 : null;
  const tradesPerDay = beh.tradesPerDay;
  const avgSize = beh.avgPositionSize;
  const hhi = beh.marketConcentrationHHI;
  const distinct = beh.distinctMarkets;

  // holding-period based
  if (avgHoldH != null) {
    if (avgHoldH < 6) add('Scalper', `avg holding period ${avgHoldH.toFixed(1)}h`);
    else if (avgHoldH < 48) add('Short-Term Trader', `avg holding period ${(avgHoldH / 24).toFixed(1)}d`);
    else if (avgHoldH < 24 * 14) add('Swing Trader', `avg holding period ${(avgHoldH / 24).toFixed(1)}d`);
    else add('Long-Term Trader', `avg holding period ${(avgHoldH / 24).toFixed(0)}d`);
  }

  // frequency based
  if (tradesPerDay != null) {
    if (tradesPerDay >= 10) add('High Frequency Trader', `${tradesPerDay.toFixed(1)} trades/day`);
    else if (tradesPerDay <= 0.5) add('Low Frequency Trader', `${tradesPerDay.toFixed(2)} trades/day`);
  }

  // position size based
  if (avgSize != null) {
    if (avgSize >= 2000) add('Large Position Trader', `avg position $${Math.round(avgSize).toLocaleString()}`);
    else if (avgSize <= 200) add('Small Position Trader', `avg position $${Math.round(avgSize).toLocaleString()}`);
  }

  // conviction: few markets but large sizes
  if (hhi != null && hhi >= 0.4) add('Concentrated Trader', `market concentration HHI ${hhi}`);
  if (distinct != null && distinct >= 15 && (hhi == null || hhi < 0.2)) add('Diversified Trader', `${distinct} distinct markets`);

  // high conviction: large sizes + concentrated + decent win rate
  if (avgSize != null && avgSize >= 1500 && hhi != null && hhi >= 0.3) {
    add('High Conviction Trader', `large, concentrated positions (avg $${Math.round(avgSize).toLocaleString()}, HHI ${hhi})`);
  }

  if (!styles.length) add('Undetermined', 'insufficient behavioural signal to classify');
  return styles;
}

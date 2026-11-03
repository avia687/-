// Provider factory. Selects the live Polymarket client or the offline fixture
// provider based on config.dataSource. Both expose the same interface:
//   fetchTrades(address, opts) -> raw trade records (live Data API shape)
//   fetchPositions(address, opts) -> raw position records
//   fetchValue(address) -> number | null
//   fetchMarket(conditionId) -> market meta | null
//   probe(address) -> { hasActivity, sample }
import * as polymarket from './polymarket.js';
import * as fixture from './fixture.js';
import { config } from '../config.js';

const providers = { polymarket, fixture };

export function getProvider(source) {
  const key = (source || config.dataSource || 'polymarket').toLowerCase();
  const provider = providers[key];
  if (!provider) throw new Error(`unknown data source: ${key}`);
  return provider;
}

export { fixture, polymarket };

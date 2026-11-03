// Central configuration. Reads from environment with safe defaults.
// A tiny .env loader (no dependency): loads KEY=VALUE lines from a .env file
// if present, without overriding variables already set in the environment.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const bool = (v, dflt) => (v === undefined ? dflt : /^(1|true|yes|on)$/i.test(v));
const int = (v, dflt) => (v === undefined || v === '' ? dflt : Number.parseInt(v, 10));

export const config = {
  root: ROOT,
  port: int(process.env.PORT, 4000),
  databaseFile: process.env.DATABASE_FILE || path.join(ROOT, 'data', 'polymarket.db'),
  dataSource: (process.env.DATA_SOURCE || 'polymarket').toLowerCase(),
  polymarket: {
    dataApi: (process.env.POLYMARKET_DATA_API || 'https://data-api.polymarket.com').replace(/\/$/, ''),
    gammaApi: (process.env.POLYMARKET_GAMMA_API || 'https://gamma-api.polymarket.com').replace(/\/$/, ''),
  },
  monitor: {
    enabled: bool(process.env.MONITOR_ENABLED, true),
    pollSeconds: int(process.env.MONITOR_POLL_SECONDS, 45),
    pageSize: int(process.env.MONITOR_PAGE_SIZE, 100),
  },
  http: {
    timeoutMs: int(process.env.HTTP_TIMEOUT_MS, 20000),
    maxRetries: int(process.env.HTTP_MAX_RETRIES, 4),
    minIntervalMs: int(process.env.HTTP_MIN_INTERVAL_MS, 250),
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
};

export default config;

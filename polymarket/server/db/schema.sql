-- Polymarket Trader Tracker schema (SQLite dialect via node:sqlite).
-- The design is portable to PostgreSQL: types are kept simple (TEXT/INTEGER/REAL),
-- timestamps are stored as epoch seconds (INTEGER), monetary/price values as REAL.
-- Every metric that can be missing is nullable and defaults to NULL (never a
-- fabricated 0), so the analytics layer can honestly report UNKNOWN.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- A single local user owns the tracked wallets and settings. Multi-user auth is
-- out of scope for this build; the table exists so the schema is future-proof.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT UNIQUE,
  created_at    INTEGER NOT NULL
);

-- Wallets under monitoring. `address` is the public proxy wallet address.
CREATE TABLE IF NOT EXISTS wallets (
  id                 INTEGER PRIMARY KEY,
  address            TEXT NOT NULL UNIQUE,       -- lowercased 0x EVM address
  label              TEXT,                       -- optional human name
  status             TEXT NOT NULL DEFAULT 'active', -- active | paused | error
  data_source        TEXT NOT NULL,              -- polymarket | fixture
  first_activity_at  INTEGER,                    -- epoch seconds, NULL if unknown
  last_activity_at   INTEGER,                    -- epoch seconds of most recent trade
  last_synced_at     INTEGER,                    -- when we last completed a sync
  last_cursor        INTEGER,                    -- resume marker (max trade ts seen)
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallets_status ON wallets(status);

-- Market metadata (enriched from Gamma API when available).
CREATE TABLE IF NOT EXISTS markets (
  condition_id  TEXT PRIMARY KEY,
  title         TEXT,
  slug          TEXT,
  category      TEXT,                    -- normalized: Politics/Sports/Crypto/...
  tags          TEXT,                    -- JSON array of raw tag labels
  end_date      INTEGER,                 -- epoch seconds, nullable
  closed        INTEGER,                 -- 0/1/NULL
  updated_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);

-- Normalized trades. Deduplicated by `dedupe_key` (see services/normalize.js).
CREATE TABLE IF NOT EXISTS trades (
  id                INTEGER PRIMARY KEY,
  wallet_id         INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  dedupe_key        TEXT NOT NULL,           -- unique per logical trade
  wallet_address    TEXT NOT NULL,
  condition_id      TEXT,                    -- market id (nullable)
  market_title      TEXT,
  asset             TEXT,                    -- token id (nullable)
  outcome           TEXT,                    -- YES/NO/label (nullable)
  side              TEXT,                    -- BUY | SELL | UNKNOWN
  price             REAL,                    -- 0..1, nullable
  shares            REAL,                    -- token count, nullable
  usd_value         REAL,                    -- notional USD, nullable
  timestamp         INTEGER,                 -- epoch seconds, nullable
  transaction_hash  TEXT,
  status            TEXT DEFAULT 'confirmed',
  raw               TEXT,                    -- original JSON for auditability
  created_at        INTEGER NOT NULL,
  UNIQUE(wallet_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_trades_wallet_ts ON trades(wallet_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_condition ON trades(condition_id);

-- Current open positions snapshot (from Data API /positions). Nullable P&L.
CREATE TABLE IF NOT EXISTS positions (
  id                INTEGER PRIMARY KEY,
  wallet_id         INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  condition_id      TEXT,
  asset             TEXT,
  market_title      TEXT,
  outcome           TEXT,
  size              REAL,
  avg_price         REAL,
  cur_price         REAL,
  initial_value     REAL,
  current_value     REAL,
  cash_pnl          REAL,                    -- unrealized, nullable
  percent_pnl       REAL,                    -- nullable
  realized_pnl      REAL,                    -- nullable
  redeemable        INTEGER,
  snapshot_at       INTEGER NOT NULL,
  UNIQUE(wallet_id, asset)
);
CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_id);

-- Cached computed metrics per wallet + window (24h/7d/30d/90d/all).
CREATE TABLE IF NOT EXISTS trader_metrics (
  id            INTEGER PRIMARY KEY,
  wallet_id     INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  window        TEXT NOT NULL,               -- 24h | 7d | 30d | 90d | all
  metrics_json  TEXT NOT NULL,               -- serialized analytics result
  computed_at   INTEGER NOT NULL,
  UNIQUE(wallet_id, window)
);

-- Cached trader score + breakdown.
CREATE TABLE IF NOT EXISTS trader_scores (
  id             INTEGER PRIMARY KEY,
  wallet_id      INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE UNIQUE,
  score          REAL,                       -- 0..100, nullable if insufficient data
  confidence     TEXT,                       -- LOW | MEDIUM | HIGH | INSUFFICIENT
  breakdown_json TEXT NOT NULL,              -- component scores + reasons
  computed_at    INTEGER NOT NULL
);

-- Fired alerts (audit + feed).
CREATE TABLE IF NOT EXISTS alerts (
  id            INTEGER PRIMARY KEY,
  wallet_id     INTEGER REFERENCES wallets(id) ON DELETE CASCADE,
  trade_id      INTEGER REFERENCES trades(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL,               -- new_trade | large_trade | unusual_size | high_score ...
  severity      TEXT NOT NULL DEFAULT 'info',
  title         TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  delivered     INTEGER NOT NULL DEFAULT 0,  -- 0/1 telegram delivery
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_wallet_ts ON alerts(wallet_id, created_at);

-- Notification settings (single row, id=1).
CREATE TABLE IF NOT EXISTS notification_settings (
  id                     INTEGER PRIMARY KEY CHECK (id = 1),
  alert_new_trades       INTEGER NOT NULL DEFAULT 1,
  alert_large_trades     INTEGER NOT NULL DEFAULT 1,
  alert_position_changes INTEGER NOT NULL DEFAULT 1,
  alert_high_score       INTEGER NOT NULL DEFAULT 1,
  alert_unusual          INTEGER NOT NULL DEFAULT 1,
  min_trade_usd          REAL NOT NULL DEFAULT 500,
  very_large_usd         REAL NOT NULL DEFAULT 5000,
  min_trader_score       REAL NOT NULL DEFAULT 0,
  telegram_bot_token     TEXT,
  telegram_chat_id       TEXT,
  updated_at             INTEGER NOT NULL
);

-- Provenance / data quality tracking.
CREATE TABLE IF NOT EXISTS data_sources (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,               -- e.g. polymarket-data-api
  endpoint      TEXT,
  last_ok_at    INTEGER,
  last_error_at INTEGER,
  note          TEXT
);

-- Sync run bookkeeping (for resume + observability).
CREATE TABLE IF NOT EXISTS sync_runs (
  id            INTEGER PRIMARY KEY,
  wallet_id     INTEGER REFERENCES wallets(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,               -- historical | live
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  status        TEXT NOT NULL,               -- running | ok | error
  trades_seen   INTEGER DEFAULT 0,
  trades_new    INTEGER DEFAULT 0,
  error         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_wallet ON sync_runs(wallet_id, started_at);

-- Error log.
CREATE TABLE IF NOT EXISTS error_logs (
  id          INTEGER PRIMARY KEY,
  level       TEXT NOT NULL,
  scope       TEXT,
  message     TEXT NOT NULL,
  context     TEXT,
  created_at  INTEGER NOT NULL
);

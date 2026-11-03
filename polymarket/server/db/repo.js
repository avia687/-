// Data-access layer. All SQL lives here so the rest of the app speaks in plain
// objects. Functions are grouped by table.
import { getDb, tx } from './index.js';

const now = () => Math.floor(Date.now() / 1000);

// ----------------------------- error logs --------------------------------
export function logError(level, scope, message, context) {
  try {
    getDb()
      .prepare(
        `INSERT INTO error_logs (level, scope, message, context, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(level, scope || null, String(message), context ? JSON.stringify(context) : null, now());
  } catch {
    // Never let logging crash the caller.
  }
}

// ------------------------------- wallets ---------------------------------
export function insertWallet({ address, label, dataSource }) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO wallets (address, label, status, data_source, created_at)
       VALUES (?, ?, 'active', ?, ?)`
    )
    .run(address, label || null, dataSource, now());
  return getWalletById(Number(info.lastInsertRowid));
}

export function getWalletById(id) {
  return getDb().prepare('SELECT * FROM wallets WHERE id = ?').get(id) || null;
}

export function getWalletByAddress(address) {
  return getDb().prepare('SELECT * FROM wallets WHERE address = ?').get(address) || null;
}

export function listWallets() {
  return getDb().prepare('SELECT * FROM wallets ORDER BY created_at DESC').all();
}

export function listActiveWallets() {
  return getDb().prepare("SELECT * FROM wallets WHERE status = 'active' ORDER BY id").all();
}

export function deleteWallet(id) {
  return getDb().prepare('DELETE FROM wallets WHERE id = ?').run(id).changes > 0;
}

export function updateWalletSync(id, { lastSyncedAt, lastCursor, lastActivityAt, firstActivityAt, status }) {
  const w = getWalletById(id);
  if (!w) return null;
  getDb()
    .prepare(
      `UPDATE wallets SET
         last_synced_at = COALESCE(?, last_synced_at),
         last_cursor = COALESCE(?, last_cursor),
         last_activity_at = COALESCE(?, last_activity_at),
         first_activity_at = COALESCE(first_activity_at, ?),
         status = COALESCE(?, status)
       WHERE id = ?`
    )
    .run(
      lastSyncedAt ?? null,
      lastCursor ?? null,
      lastActivityAt ?? null,
      firstActivityAt ?? null,
      status ?? null,
      id
    );
  return getWalletById(id);
}

export function setWalletStatus(id, status) {
  getDb().prepare('UPDATE wallets SET status = ? WHERE id = ?').run(status, id);
}

// ------------------------------- trades ----------------------------------
// Insert a batch of normalized trades, ignoring duplicates. Returns count of
// newly inserted rows.
export function insertTrades(walletId, trades) {
  if (!trades.length) return 0;
  return tx((db) => {
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO trades
        (wallet_id, dedupe_key, wallet_address, condition_id, market_title, asset,
         outcome, side, price, shares, usd_value, timestamp, transaction_hash, status, raw, created_at)
       VALUES (@wallet_id, @dedupe_key, @wallet_address, @condition_id, @market_title, @asset,
         @outcome, @side, @price, @shares, @usd_value, @timestamp, @transaction_hash, @status, @raw, @created_at)`
    );
    let inserted = 0;
    const ts = now();
    for (const t of trades) {
      const info = stmt.run({
        wallet_id: walletId,
        dedupe_key: t.dedupeKey,
        wallet_address: t.wallet,
        condition_id: t.marketId ?? null,
        market_title: t.market ?? null,
        asset: t.tokenId ?? null,
        outcome: t.outcome ?? null,
        side: t.side ?? 'UNKNOWN',
        price: t.price ?? null,
        shares: t.shares ?? null,
        usd_value: t.usdValue ?? null,
        timestamp: t.timestamp ?? null,
        transaction_hash: t.transactionHash ?? null,
        status: t.status ?? 'confirmed',
        raw: t.raw ? JSON.stringify(t.raw) : null,
        created_at: ts,
      });
      inserted += info.changes;
    }
    return inserted;
  });
}

export function getTrades(walletId, { limit = 500, sinceTs = null } = {}) {
  const db = getDb();
  if (sinceTs != null) {
    return db
      .prepare(
        `SELECT * FROM trades WHERE wallet_id = ? AND timestamp >= ?
         ORDER BY timestamp DESC, id DESC LIMIT ?`
      )
      .all(walletId, sinceTs, limit);
  }
  return db
    .prepare(`SELECT * FROM trades WHERE wallet_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?`)
    .all(walletId, limit);
}

export function getAllTradesAsc(walletId) {
  return getDb()
    .prepare(`SELECT * FROM trades WHERE wallet_id = ? ORDER BY timestamp ASC, id ASC`)
    .all(walletId);
}

export function getTradeById(id) {
  return getDb().prepare('SELECT * FROM trades WHERE id = ?').get(id) || null;
}

export function countTrades(walletId) {
  return getDb().prepare('SELECT COUNT(*) AS n FROM trades WHERE wallet_id = ?').get(walletId).n;
}

export function maxTradeTimestamp(walletId) {
  const row = getDb()
    .prepare('SELECT MAX(timestamp) AS m FROM trades WHERE wallet_id = ?')
    .get(walletId);
  return row?.m ?? null;
}

// ------------------------------ positions --------------------------------
export function replacePositions(walletId, positions) {
  return tx((db) => {
    db.prepare('DELETE FROM positions WHERE wallet_id = ?').run(walletId);
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO positions
        (wallet_id, condition_id, asset, market_title, outcome, size, avg_price, cur_price,
         initial_value, current_value, cash_pnl, percent_pnl, realized_pnl, redeemable, snapshot_at)
       VALUES (@wallet_id, @condition_id, @asset, @market_title, @outcome, @size, @avg_price, @cur_price,
         @initial_value, @current_value, @cash_pnl, @percent_pnl, @realized_pnl, @redeemable, @snapshot_at)`
    );
    const ts = now();
    for (const p of positions) {
      stmt.run({
        wallet_id: walletId,
        condition_id: p.conditionId ?? null,
        asset: p.asset ?? null,
        market_title: p.title ?? null,
        outcome: p.outcome ?? null,
        size: p.size ?? null,
        avg_price: p.avgPrice ?? null,
        cur_price: p.curPrice ?? null,
        initial_value: p.initialValue ?? null,
        current_value: p.currentValue ?? null,
        cash_pnl: p.cashPnl ?? null,
        percent_pnl: p.percentPnl ?? null,
        realized_pnl: p.realizedPnl ?? null,
        redeemable: p.redeemable == null ? null : p.redeemable ? 1 : 0,
        snapshot_at: ts,
      });
    }
    return positions.length;
  });
}

export function getPositions(walletId) {
  return getDb().prepare('SELECT * FROM positions WHERE wallet_id = ?').all(walletId);
}

// ------------------------------- markets ---------------------------------
export function upsertMarket(m) {
  getDb()
    .prepare(
      `INSERT INTO markets (condition_id, title, slug, category, tags, end_date, closed, updated_at)
       VALUES (@condition_id, @title, @slug, @category, @tags, @end_date, @closed, @updated_at)
       ON CONFLICT(condition_id) DO UPDATE SET
         title = COALESCE(excluded.title, title),
         slug = COALESCE(excluded.slug, slug),
         category = COALESCE(excluded.category, category),
         tags = COALESCE(excluded.tags, tags),
         end_date = COALESCE(excluded.end_date, end_date),
         closed = COALESCE(excluded.closed, closed),
         updated_at = excluded.updated_at`
    )
    .run({
      condition_id: m.conditionId,
      title: m.title ?? null,
      slug: m.slug ?? null,
      category: m.category ?? null,
      tags: m.tags ? JSON.stringify(m.tags) : null,
      end_date: m.endDate ?? null,
      closed: m.closed == null ? null : m.closed ? 1 : 0,
      updated_at: now(),
    });
}

export function getMarket(conditionId) {
  return getDb().prepare('SELECT * FROM markets WHERE condition_id = ?').get(conditionId) || null;
}

// --------------------------- metrics & scores ----------------------------
export function saveMetrics(walletId, window, metrics) {
  getDb()
    .prepare(
      `INSERT INTO trader_metrics (wallet_id, window, metrics_json, computed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(wallet_id, window) DO UPDATE SET
         metrics_json = excluded.metrics_json, computed_at = excluded.computed_at`
    )
    .run(walletId, window, JSON.stringify(metrics), now());
}

export function getMetrics(walletId, window) {
  const row = getDb()
    .prepare('SELECT metrics_json, computed_at FROM trader_metrics WHERE wallet_id = ? AND window = ?')
    .get(walletId, window);
  if (!row) return null;
  return { ...JSON.parse(row.metrics_json), computedAt: row.computed_at };
}

export function saveScore(walletId, { score, confidence, breakdown }) {
  getDb()
    .prepare(
      `INSERT INTO trader_scores (wallet_id, score, confidence, breakdown_json, computed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(wallet_id) DO UPDATE SET
         score = excluded.score, confidence = excluded.confidence,
         breakdown_json = excluded.breakdown_json, computed_at = excluded.computed_at`
    )
    .run(walletId, score, confidence, JSON.stringify(breakdown), now());
}

export function getScore(walletId) {
  const row = getDb().prepare('SELECT * FROM trader_scores WHERE wallet_id = ?').get(walletId);
  if (!row) return null;
  return {
    score: row.score,
    confidence: row.confidence,
    breakdown: JSON.parse(row.breakdown_json),
    computedAt: row.computed_at,
  };
}

// -------------------------------- alerts ---------------------------------
export function insertAlert(a) {
  const info = getDb()
    .prepare(
      `INSERT INTO alerts (wallet_id, trade_id, kind, severity, title, payload_json, delivered, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      a.walletId ?? null,
      a.tradeId ?? null,
      a.kind,
      a.severity || 'info',
      a.title,
      JSON.stringify(a.payload || {}),
      a.delivered ? 1 : 0,
      now()
    );
  return Number(info.lastInsertRowid);
}

export function markAlertDelivered(id) {
  getDb().prepare('UPDATE alerts SET delivered = 1 WHERE id = ?').run(id);
}

export function listAlerts({ walletId = null, limit = 100 } = {}) {
  const db = getDb();
  const rows = walletId
    ? db
        .prepare('SELECT * FROM alerts WHERE wallet_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(walletId, limit)
    : db.prepare('SELECT * FROM alerts ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload_json) }));
}

// -------------------------- notification settings ------------------------
export function getSettings() {
  return getDb().prepare('SELECT * FROM notification_settings WHERE id = 1').get();
}

export function updateSettings(patch) {
  const current = getSettings();
  const all = { ...current, ...patch, updated_at: now() };
  // node:sqlite rejects named params that don't appear in the SQL, so bind only
  // the columns the UPDATE statement references (id is excluded).
  const cols = [
    'alert_new_trades', 'alert_large_trades', 'alert_position_changes', 'alert_high_score',
    'alert_unusual', 'min_trade_usd', 'very_large_usd', 'min_trader_score',
    'telegram_bot_token', 'telegram_chat_id', 'updated_at',
  ];
  const merged = {};
  for (const c of cols) merged[c] = all[c] ?? null;
  getDb()
    .prepare(
      `UPDATE notification_settings SET
        alert_new_trades=@alert_new_trades, alert_large_trades=@alert_large_trades,
        alert_position_changes=@alert_position_changes, alert_high_score=@alert_high_score,
        alert_unusual=@alert_unusual, min_trade_usd=@min_trade_usd, very_large_usd=@very_large_usd,
        min_trader_score=@min_trader_score, telegram_bot_token=@telegram_bot_token,
        telegram_chat_id=@telegram_chat_id, updated_at=@updated_at
       WHERE id = 1`
    )
    .run(merged);
  return getSettings();
}

// ------------------------------ sync runs --------------------------------
export function startSyncRun(walletId, kind) {
  const info = getDb()
    .prepare(
      `INSERT INTO sync_runs (wallet_id, kind, started_at, status) VALUES (?, ?, ?, 'running')`
    )
    .run(walletId, kind, now());
  return Number(info.lastInsertRowid);
}

export function finishSyncRun(id, { status, tradesSeen = 0, tradesNew = 0, error = null }) {
  getDb()
    .prepare(
      `UPDATE sync_runs SET finished_at = ?, status = ?, trades_seen = ?, trades_new = ?, error = ?
       WHERE id = ?`
    )
    .run(now(), status, tradesSeen, tradesNew, error, id);
}

export function recentSyncRuns(walletId, limit = 10) {
  return getDb()
    .prepare('SELECT * FROM sync_runs WHERE wallet_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(walletId, limit);
}

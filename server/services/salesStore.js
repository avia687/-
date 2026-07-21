// Income store (orders + manual entries).
// Uses PostgreSQL when DATABASE_URL is set (persists across deploys),
// otherwise falls back to a local JSON file (server/data/sales.json).
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/sales.json');

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

function toDay(value) {
  const d = value ? new Date(value) : new Date();
  return isNaN(d) ? new Date().toISOString().slice(0, 10)
                  : d.toISOString().slice(0, 10);
}

// Canonical record built from an arbitrary income entry.
function buildRecord(entry) {
  return {
    id: entry.id || uid(),
    source: entry.source === 'order' ? 'order' : 'manual',
    orderId: entry.orderId || null,
    amount: round2(entry.amount),
    date: toDay(entry.date),
    desc: (entry.desc || '').toString().slice(0, 120),
    category: entry.category || 'sales',
    items: Array.isArray(entry.items)
      ? entry.items.map(i => ({ name: (i.name || '').toString(), price: round2(i.price) }))
      : [],
    customerName: (entry.customerName || '').toString(),
    createdAt: new Date().toISOString(),
  };
}

// Map a הקרון order onto an income entry.
function orderToEntry(order) {
  return {
    source: 'order',
    orderId: order.id,
    amount: order.total,
    date: order.createdAt,
    desc: order.customerName
      ? `הזמנה #${order.id} — ${order.customerName}`
      : `הזמנה #${order.id}`,
    category: 'sales',
    customerName: order.customerName,
    items: (order.items || []).map(i => ({ name: i.name, price: i.price })),
  };
}

// End-of-day summary computed from a list of entries.
function computeSummary(entries, day) {
  const date = toDay(day);
  const dayEntries = entries.filter(e => e.date === date);
  const total = dayEntries.reduce((a, e) => a + Number(e.amount || 0), 0);
  const orders = dayEntries.filter(e => e.source === 'order');

  const counts = {};
  dayEntries.forEach(e =>
    (e.items || []).forEach(it => {
      const name = it.name || '—';
      if (!counts[name]) counts[name] = { name, count: 0, revenue: 0 };
      counts[name].count += 1;
      counts[name].revenue += Number(it.price) || 0;
    })
  );
  const topItems = Object.values(counts).sort((a, b) => b.count - a.count);

  return {
    date,
    total: round2(total),
    orderCount: orders.length,
    entryCount: dayEntries.length,
    avgOrder: orders.length ? round2(total / orders.length) : 0,
    topItems,
  };
}

// ---- File backend ----
const fileBackend = {
  async init() {},
  async readAll() {
    try {
      const arr = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  },
  async insert(rec) {
    const list = await this.readAll();
    list.push(rec);
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
    } catch (err) {
      console.error('sales store write failed:', err.message);
    }
    return rec;
  },
  async remove(id) {
    const list = await this.readAll();
    const next = list.filter(e => e.id !== id);
    const changed = next.length !== list.length;
    if (changed) {
      try { fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2)); }
      catch (err) { console.error('sales store write failed:', err.message); }
    }
    return changed;
  },
};

// ---- PostgreSQL backend ----
function pgSslOption(url) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
  if (/sslmode=require/.test(url || '')) return { rejectUnauthorized: false };
  return false;
}

function rowToRec(row) {
  return {
    id: row.id,
    source: row.source,
    orderId: row.order_id,
    amount: Number(row.amount),
    date: row.date,
    desc: row.desc || '',
    category: row.category,
    items: Array.isArray(row.items) ? row.items : (row.items || []),
    customerName: row.customer_name || '',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function makePgBackend() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: pgSslOption(process.env.DATABASE_URL),
  });
  pool.on('error', err => console.error('PG pool error:', err.message));

  return {
    pool,
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS income_entries (
          id            text PRIMARY KEY,
          source        text NOT NULL,
          order_id      text,
          amount        numeric NOT NULL,
          date          text NOT NULL,
          "desc"        text,
          category      text,
          items         jsonb NOT NULL DEFAULT '[]',
          customer_name text,
          created_at    timestamptz NOT NULL DEFAULT now()
        )`);
      await pool.query(
        'CREATE INDEX IF NOT EXISTS income_entries_date_idx ON income_entries(date)'
      );
    },
    async readAll() {
      const { rows } = await pool.query(
        'SELECT * FROM income_entries ORDER BY date DESC, created_at DESC'
      );
      return rows.map(rowToRec);
    },
    async insert(rec) {
      await pool.query(
        `INSERT INTO income_entries
           (id, source, order_id, amount, date, "desc", category, items, customer_name, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [rec.id, rec.source, rec.orderId, rec.amount, rec.date, rec.desc,
         rec.category, JSON.stringify(rec.items), rec.customerName, rec.createdAt]
      );
      return rec;
    },
    async remove(id) {
      const { rowCount } = await pool.query('DELETE FROM income_entries WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };
}

// ---- Facade: pick a backend once, at load ----
let backend = fileBackend;
let backendName = 'file';

const ready = (async () => {
  if (process.env.DATABASE_URL) {
    try {
      const pg = makePgBackend();
      await pg.init();
      backend = pg;
      backendName = 'postgres';
    } catch (err) {
      console.error('PostgreSQL init failed, using file store:', err.message);
    }
  }
  console.log(`sales store: ${backendName}`);
})();

async function readAll() { await ready; return backend.readAll(); }
async function record(entry) { await ready; return backend.insert(buildRecord(entry)); }
async function recordOrder(order) { return record(orderToEntry(order)); }
async function remove(id) { await ready; return backend.remove(id); }
async function dailySummary(day) { return computeSummary(await readAll(), day); }

module.exports = { ready, readAll, record, recordOrder, remove, dailySummary };

// File-backed store for income entries (orders + manual).
// Persists to server/data/sales.json. Swap for a real DB if needed.
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/sales.json');

function readAll() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
  } catch (err) {
    console.error('sales store write failed:', err.message);
  }
}

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function toDay(value) {
  const d = value ? new Date(value) : new Date();
  return isNaN(d) ? new Date().toISOString().slice(0, 10)
                  : d.toISOString().slice(0, 10);
}

// Add an income entry. Returns the stored record.
function record(entry) {
  const list = readAll();
  const rec = {
    id: entry.id || uid(),
    source: entry.source === 'order' ? 'order' : 'manual',
    orderId: entry.orderId || null,
    amount: Math.round((Number(entry.amount) || 0) * 100) / 100,
    date: toDay(entry.date),
    desc: (entry.desc || '').toString().slice(0, 120),
    category: entry.category || 'sales',
    items: Array.isArray(entry.items)
      ? entry.items.map(i => ({
          name: (i.name || '').toString(),
          price: Math.round((Number(i.price) || 0) * 100) / 100,
        }))
      : [],
    customerName: (entry.customerName || '').toString(),
    createdAt: new Date().toISOString(),
  };
  list.push(rec);
  writeAll(list);
  return rec;
}

// Record income from a הקרון order.
function recordOrder(order) {
  return record({
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
  });
}

function remove(id) {
  const list = readAll();
  const next = list.filter(e => e.id !== id);
  const changed = next.length !== list.length;
  if (changed) writeAll(next);
  return changed;
}

// End-of-day summary for a given day (YYYY-MM-DD).
function dailySummary(day) {
  const date = toDay(day);
  const entries = readAll().filter(e => e.date === date);
  const total = entries.reduce((a, e) => a + e.amount, 0);
  const orders = entries.filter(e => e.source === 'order');

  const counts = {};
  entries.forEach(e =>
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
    total: Math.round(total * 100) / 100,
    orderCount: orders.length,
    entryCount: entries.length,
    avgOrder: orders.length ? Math.round((total / orders.length) * 100) / 100 : 0,
    topItems,
  };
}

module.exports = { readAll, record, recordOrder, remove, dailySummary };

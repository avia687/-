import { useState, useEffect } from 'react';

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff} שניות`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins} דקות`;
  return `${Math.floor(mins / 60)} שעות`;
}

export default function ChefPage() {
  const [orders, setOrders] = useState([]);
  const [completing, setCompleting] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  async function fetchOrders() {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(data);
      setLastUpdate(new Date());
    } catch {
      // silent — will retry
    }
  }

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  async function markReady(orderId) {
    setCompleting(orderId);
    try {
      await fetch(`/api/orders/${orderId}/ready`, { method: 'PUT' });
      await fetchOrders();
    } catch {
      alert('שגיאה בעדכון ההזמנה');
    } finally {
      setCompleting(null);
    }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerInner}>
          <div>
            <h1 style={s.headerTitle}>🍳 לוח שף</h1>
            <p style={s.headerSub}>הקרון</p>
          </div>
          <div style={s.badge}>
            {orders.length > 0 && (
              <span style={s.count}>{orders.length}</span>
            )}
            <span style={s.badgeLabel}>ממתינות</span>
          </div>
        </div>
      </header>

      <main style={s.main}>
        {lastUpdate && (
          <p style={s.updated}>מתעדכן אוטומטית כל 5 שניות</p>
        )}

        {orders.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>🎉</div>
            <p style={s.emptyText}>אין הזמנות ממתינות</p>
            <p style={s.emptyNote}>עדכון אוטומטי...</p>
          </div>
        ) : (
          <div style={s.orderList}>
            {orders.map((order, i) => (
              <div key={order.id} style={{ ...s.card, borderRight: `5px solid ${i === 0 ? '#E8622A' : '#ccc'}` }}>
                <div style={s.cardHeader}>
                  <div style={s.orderNum}>#{order.id}</div>
                  <div style={s.orderTime}>{timeAgo(order.createdAt)} לפני</div>
                </div>

                <div style={s.customerInfo}>
                  <span style={s.customerName}>👤 {order.customerName}</span>
                  <span style={s.customerPhone}>📞 {order.customerPhone}</span>
                </div>

                <div style={s.itemsList}>
                  {order.items.map((item, idx) => (
                    <div key={idx} style={s.orderItem}>
                      <span style={s.itemName}>{item.name}</span>
                      {item.extras && item.extras.length > 0 && (
                        <span style={s.itemExtras}>{item.extras.join(', ')}</span>
                      )}
                      <span style={s.itemPrice}>{item.price}₪</span>
                    </div>
                  ))}
                </div>

                <div style={s.cardFooter}>
                  <span style={s.total}>סה"כ: {order.total}₪</span>
                  <button
                    style={{ ...s.readyBtn, opacity: completing === order.id ? 0.7 : 1 }}
                    onClick={() => markReady(order.id)}
                    disabled={completing === order.id}
                  >
                    {completing === order.id ? '...' : '✓ מוכן'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', background: '#FFF8F3' },

  header: {
    background: '#2C1810',
    color: '#fff',
    padding: '16px 20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.2)'
  },
  headerInner: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', maxWidth: 640, margin: '0 auto'
  },
  headerTitle: { fontSize: 24, fontWeight: 800 },
  headerSub: { color: '#C8A882', fontSize: 14, marginTop: 2 },

  badge: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  count: {
    background: '#E8622A', color: '#fff', borderRadius: '50%',
    width: 36, height: 36, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 18, fontWeight: 800
  },
  badgeLabel: { color: '#C8A882', fontSize: 12 },

  main: { maxWidth: 640, margin: '0 auto', padding: '16px' },

  updated: { color: '#9A7860', fontSize: 12, textAlign: 'center', marginBottom: 12 },

  empty: {
    textAlign: 'center', padding: '60px 20px',
    background: '#fff', borderRadius: 20, marginTop: 20,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
  },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyText: { fontSize: 22, fontWeight: 700, color: '#2C1810', marginBottom: 6 },
  emptyNote: { color: '#9A7860', fontSize: 14 },

  orderList: { display: 'flex', flexDirection: 'column', gap: 16 },

  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '16px 18px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    border: '1px solid #EDD8C8'
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10
  },
  orderNum: { fontSize: 22, fontWeight: 900, color: '#E8622A' },
  orderTime: { fontSize: 13, color: '#9A7860', background: '#FFF0E6', padding: '3px 10px', borderRadius: 20 },

  customerInfo: { display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' },
  customerName: { fontWeight: 700, fontSize: 16 },
  customerPhone: { color: '#7A5840', fontSize: 15 },

  itemsList: { borderTop: '1px solid #F0E0D0', paddingTop: 10, marginBottom: 12 },
  orderItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    paddingBottom: 6, flexWrap: 'wrap'
  },
  itemName: { fontWeight: 700, fontSize: 16 },
  itemExtras: { color: '#7A5840', fontSize: 14, flex: 1 },
  itemPrice: { fontWeight: 700, color: '#E8622A', fontSize: 15, marginRight: 'auto' },

  cardFooter: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', borderTop: '1px solid #F0E0D0', paddingTop: 12
  },
  total: { fontSize: 20, fontWeight: 800, color: '#2C1810' },
  readyBtn: {
    background: '#2D8A4E', color: '#fff',
    borderRadius: 12, padding: '12px 28px',
    fontSize: 18, fontWeight: 800,
    border: 'none', cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(45,138,78,0.3)',
    transition: 'opacity 0.15s'
  }
};

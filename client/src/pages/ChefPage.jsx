import { useState, useEffect } from 'react';
import './ChefPage.css';

function toWaPhone(phone) {
  const d = phone.replace(/\D/g, '');
  return d.startsWith('0') ? '972' + d.slice(1) : d;
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff} שנ\'`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} דק\'`;
  return `${Math.floor(m / 60)} שע\'`;
}

export default function ChefPage() {
  const [orders,     setOrders]     = useState([]);
  const [completing, setCompleting] = useState(null);
  const [tick,       setTick]       = useState(0);

  async function fetchOrders() {
    try {
      const res  = await fetch('/api/orders');
      const data = await res.json();
      setOrders(data);
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => {
      fetchOrders();
      setTick(t => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function markReady(id) {
    setCompleting(id);
    try {
      await fetch(`/api/orders/${id}/ready`, { method: 'PUT' });
      await fetchOrders();
    } catch {
      alert('שגיאה בעדכון');
    } finally {
      setCompleting(null);
    }
  }

  return (
    <div className="chef-page">
      <header className="chef-header">
        <div className="chef-header-inner">
          <div>
            <h1 className="chef-title">לוח שף</h1>
            <p className="chef-sub">הקרון · מתעדכן כל 5 שניות</p>
          </div>
          {orders.length > 0 && (
            <div className="chef-badge">{orders.length}</div>
          )}
        </div>
      </header>

      <main className="chef-main">
        {orders.length === 0 ? (
          <div className="chef-empty">
            <span className="chef-empty-icon">✓</span>
            <p className="chef-empty-text">אין הזמנות ממתינות</p>
            <p className="chef-empty-note">עדכון אוטומטי...</p>
          </div>
        ) : (
          <div className="chef-list">
            {orders.map((order, i) => (
              <div key={order.id} className="chef-card" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="chef-card-header">
                  <span className="chef-order-num">#{order.id}</span>
                  <span className="chef-time">{timeAgo(order.createdAt)} לפני</span>
                </div>

                <div className="chef-customer">
                  <span className="chef-name">👤 {order.customerName}</span>
                  <span className="chef-phone">📞 {order.customerPhone}</span>
                </div>

                <div className="chef-items">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="chef-item">
                      <span className="chef-item-name">{item.name}</span>
                      {item.extras?.length > 0 &&
                        <span className="chef-item-extras">{item.extras.join(' · ')}</span>}
                      <span className="chef-item-price">{item.price}₪</span>
                    </div>
                  ))}
                </div>

                <div className="chef-footer">
                  <span className="chef-total">סה"כ {order.total}₪</span>
                  <div className="chef-actions">
                    <a
                      href={`https://wa.me/${toWaPhone(order.customerPhone)}?text=${encodeURIComponent('ההזמנה שלך מוכנה! 🎉\nהקרון — הזמנה #' + order.id)}`}
                      className="wa-notify-btn"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      💬 שלח מוכן
                    </a>
                    <button
                      className={`ready-btn ${completing === order.id ? 'ready-btn--loading' : ''}`}
                      onClick={() => markReady(order.id)}
                      disabled={completing === order.id}
                    >
                      {completing === order.id ? <span className="spinner" /> : '✓ סיים'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

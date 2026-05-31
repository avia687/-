import { useState } from 'react';

const MENU = [
  {
    id: 'toast',
    name: 'טוסט',
    emoji: '🥪',
    basePrice: 26,
    description: 'רוטב פיצה + גבינה צהובה',
    priceNote: 'תוספת ראשונה כלולה, כל תוספת נוספת 2₪',
    toppings: [
      { id: 'tomato',    name: 'עגבניה',  free: false },
      { id: 'onion',     name: 'בצל',     free: false },
      { id: 'olives',    name: 'זיתים',   free: false },
      { id: 'mushrooms', name: 'פטריות',  free: false },
      { id: 'pesto',     name: 'פסטו',    free: false },
      { id: 'spicy',     name: '🌶 חריף', free: true  },
    ]
  },
  {
    id: 'omelette',
    name: 'חביתה',
    emoji: '🍳',
    basePrice: 28,
    description: 'חביתה טרייה',
    priceNote: 'כל הירקות כלולים',
    vegetables: [
      { id: 'tomato',   name: 'עגבניה' },
      { id: 'cucumber', name: 'מלפפון' },
      { id: 'lettuce',  name: 'חסה'    },
      { id: 'onion',    name: 'בצל'    },
      { id: 'olives',   name: 'זיתים'  },
      { id: 'pickles',  name: 'חמוצים' },
    ]
  }
];

function calcToastPrice(selected) {
  const paid = selected.filter(id => id !== 'spicy');
  return 26 + Math.max(0, paid.length - 1) * 2;
}

function toastExtrasLabel(selected) {
  const item = MENU[0];
  return selected.map(id => item.toppings.find(t => t.id === id)?.name).filter(Boolean).join(', ');
}

function omelettExtrasLabel(selected) {
  const item = MENU[1];
  return selected.map(id => item.vegetables.find(v => v.id === id)?.name).filter(Boolean).join(', ');
}

export default function CustomerPage() {
  const [modal, setModal] = useState(null);
  const [toastSelected, setToastSelected] = useState([]);
  const [omeletteSelected, setOmeletteSelected] = useState([]);
  const [cart, setCart] = useState([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [error, setError] = useState('');

  const total = cart.reduce((s, i) => s + i.price, 0);

  function openModal(item) {
    setModal(item);
    setToastSelected([]);
    setOmeletteSelected([]);
  }

  function toggleToast(id) {
    setToastSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleOmelette(id) {
    setOmeletteSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function addToCart() {
    if (modal.id === 'toast') {
      const price = calcToastPrice(toastSelected);
      const extras = toastSelected.map(id => modal.toppings.find(t => t.id === id)?.name).filter(Boolean);
      setCart(prev => [...prev, { uid: Date.now(), name: 'טוסט', extras, price }]);
    } else {
      const extras = omeletteSelected.map(id => modal.vegetables.find(v => v.id === id)?.name).filter(Boolean);
      setCart(prev => [...prev, { uid: Date.now(), name: 'חביתה', extras, price: 28 }]);
    }
    setModal(null);
  }

  function removeFromCart(uid) {
    setCart(prev => prev.filter(i => i.uid !== uid));
  }

  async function submitOrder() {
    if (!name.trim()) { setError('אנא הכנס שם'); return; }
    if (!phone.trim() || !/^0[0-9]{9}$/.test(phone.replace(/[-\s]/g, ''))) {
      setError('אנא הכנס מספר טלפון תקין (לדוגמה: 0501234567)');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim(),
          customerPhone: phone.replace(/[-\s]/g, ''),
          items: cart.map(i => ({ name: i.name, extras: i.extras, price: i.price })),
          total
        })
      });
      const data = await res.json();
      setOrderId(data.orderId);
    } catch {
      setError('שגיאה בשליחת ההזמנה, נסה שוב');
    } finally {
      setSubmitting(false);
    }
  }

  if (orderId) {
    return (
      <div style={styles.successWrap}>
        <div style={styles.successCard}>
          <div style={styles.successIcon}>✅</div>
          <h2 style={styles.successTitle}>ההזמנה נשלחה!</h2>
          <div style={styles.successNum}>#{orderId}</div>
          <p style={styles.successMsg}>
            נשלח לך הודעה בוואטסאפ<br />כשהאוכל מוכן 🎉
          </p>
          <button
            style={styles.successBtn}
            onClick={() => { setCart([]); setName(''); setPhone(''); setOrderId(null); }}
          >
            הזמנה חדשה
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <span style={styles.headerEmoji}>🚐</span>
        <h1 style={styles.headerTitle}>הקרון</h1>
      </header>

      {/* Menu */}
      <main style={styles.main}>
        <h2 style={styles.sectionTitle}>התפריט שלנו</h2>
        <div style={styles.menuGrid}>
          {MENU.map(item => (
            <div key={item.id} style={styles.menuCard}>
              <div style={styles.menuEmoji}>{item.emoji}</div>
              <h3 style={styles.menuName}>{item.name}</h3>
              <p style={styles.menuDesc}>{item.description}</p>
              <p style={styles.menuNote}>{item.priceNote}</p>
              <div style={styles.menuFooter}>
                <span style={styles.menuPrice}>{item.basePrice}₪</span>
                <button style={styles.addBtn} onClick={() => openModal(item)}>
                  + הוסף
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Cart */}
        {cart.length > 0 && (
          <div style={styles.cartSection}>
            <h2 style={styles.sectionTitle}>ההזמנה שלי</h2>
            {cart.map(item => (
              <div key={item.uid} style={styles.cartItem}>
                <div style={styles.cartItemInfo}>
                  <span style={styles.cartItemName}>{item.name}</span>
                  {item.extras.length > 0 && (
                    <span style={styles.cartItemExtras}>{item.extras.join(', ')}</span>
                  )}
                </div>
                <div style={styles.cartItemRight}>
                  <span style={styles.cartItemPrice}>{item.price}₪</span>
                  <button style={styles.removeBtn} onClick={() => removeFromCart(item.uid)}>✕</button>
                </div>
              </div>
            ))}
            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>סה"כ</span>
              <span style={styles.totalPrice}>{total}₪</span>
            </div>

            {/* Customer details */}
            <div style={styles.formSection}>
              <h3 style={styles.formTitle}>פרטים לקבלת הודעה</h3>
              <input
                style={styles.input}
                type="text"
                placeholder="שם"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <input
                style={styles.input}
                type="tel"
                placeholder="מספר טלפון (0501234567)"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                dir="ltr"
              />
              {error && <p style={styles.errorMsg}>{error}</p>}
              <button
                style={{ ...styles.submitBtn, opacity: submitting ? 0.7 : 1 }}
                onClick={submitOrder}
                disabled={submitting}
              >
                {submitting ? 'שולח...' : `שלח הזמנה — ${total}₪`}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      {modal && (
        <div style={styles.overlay} onClick={() => setModal(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <button style={styles.closeBtn} onClick={() => setModal(null)}>✕</button>
            <div style={styles.modalEmoji}>{modal.emoji}</div>
            <h3 style={styles.modalTitle}>{modal.name}</h3>

            {modal.id === 'toast' && (
              <>
                <p style={styles.modalSubtitle}>בחר תוספות</p>
                <p style={styles.modalNote}>תוספת ראשונה כלולה · כל תוספת נוספת 2₪ · חריף תמיד חינם</p>
                <div style={styles.toppingGrid}>
                  {modal.toppings.map(t => {
                    const active = toastSelected.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        style={{ ...styles.toppingBtn, ...(active ? styles.toppingActive : {}) }}
                        onClick={() => toggleToast(t.id)}
                      >
                        {t.name}
                        {t.free && <span style={styles.freeBadge}> חינם</span>}
                      </button>
                    );
                  })}
                </div>
                <div style={styles.modalFooter}>
                  <span style={styles.modalPrice}>{calcToastPrice(toastSelected)}₪</span>
                  <button style={styles.modalAddBtn} onClick={addToCart}>הוסף להזמנה</button>
                </div>
              </>
            )}

            {modal.id === 'omelette' && (
              <>
                <p style={styles.modalSubtitle}>ירקות לבחירה (הכל כלול)</p>
                <div style={styles.toppingGrid}>
                  {modal.vegetables.map(v => {
                    const active = omeletteSelected.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        style={{ ...styles.toppingBtn, ...(active ? styles.toppingActive : {}) }}
                        onClick={() => toggleOmelette(v.id)}
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
                <div style={styles.modalFooter}>
                  <span style={styles.modalPrice}>28₪</span>
                  <button style={styles.modalAddBtn} onClick={addToCart}>הוסף להזמנה</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg)', paddingBottom: 40 },

  header: {
    background: 'var(--orange)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '20px 24px',
    boxShadow: '0 2px 12px rgba(232,98,42,0.3)'
  },
  headerEmoji: { fontSize: 32 },
  headerTitle: { fontSize: 32, fontWeight: 800, letterSpacing: 1 },

  main: { maxWidth: 600, margin: '0 auto', padding: '24px 16px' },

  sectionTitle: { fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 16 },

  menuGrid: { display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 },

  menuCard: {
    background: 'var(--white)',
    borderRadius: 'var(--radius)',
    padding: 20,
    boxShadow: 'var(--shadow)',
    border: '1px solid var(--orange-border)'
  },
  menuEmoji: { fontSize: 40, marginBottom: 8 },
  menuName: { fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 4 },
  menuDesc: { color: 'var(--muted)', fontSize: 15, marginBottom: 4 },
  menuNote: { color: 'var(--orange)', fontSize: 13, fontWeight: 500, marginBottom: 12 },
  menuFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  menuPrice: { fontSize: 24, fontWeight: 800, color: 'var(--orange)' },
  addBtn: {
    background: 'var(--orange)',
    color: '#fff',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 22px',
    fontSize: 16,
    fontWeight: 700,
    transition: 'background 0.15s'
  },

  cartSection: {
    background: 'var(--white)',
    borderRadius: 'var(--radius)',
    padding: 20,
    boxShadow: 'var(--shadow)',
    border: '1px solid var(--orange-border)'
  },
  cartItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #F3E8DD'
  },
  cartItemInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  cartItemName: { fontWeight: 700, fontSize: 16 },
  cartItemExtras: { color: 'var(--muted)', fontSize: 13 },
  cartItemRight: { display: 'flex', alignItems: 'center', gap: 10 },
  cartItemPrice: { fontWeight: 700, color: 'var(--orange)', fontSize: 16 },
  removeBtn: {
    background: 'var(--red-light)',
    color: 'var(--red)',
    border: 'none',
    borderRadius: 8,
    width: 28,
    height: 28,
    fontSize: 13,
    fontWeight: 700
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '14px 0 4px',
    borderTop: '2px solid var(--orange-border)',
    marginTop: 4
  },
  totalLabel: { fontSize: 18, fontWeight: 800 },
  totalPrice: { fontSize: 22, fontWeight: 800, color: 'var(--orange)' },

  formSection: { marginTop: 20 },
  formTitle: { fontSize: 16, fontWeight: 700, color: 'var(--muted)', marginBottom: 12 },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--radius-sm)',
    border: '1.5px solid var(--orange-border)',
    fontSize: 16,
    background: 'var(--orange-pale)',
    marginBottom: 10,
    display: 'block',
    color: 'var(--text)'
  },
  errorMsg: { color: 'var(--red)', fontSize: 14, marginBottom: 10, fontWeight: 500 },
  submitBtn: {
    width: '100%',
    background: 'var(--green)',
    color: '#fff',
    borderRadius: 'var(--radius-sm)',
    padding: '14px 0',
    fontSize: 18,
    fontWeight: 800,
    marginTop: 4,
    transition: 'opacity 0.15s'
  },

  // Modal
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100
  },
  modal: {
    background: '#fff',
    borderRadius: '24px 24px 0 0',
    padding: '28px 20px 36px',
    width: '100%',
    maxWidth: 500,
    maxHeight: '85vh',
    overflowY: 'auto',
    position: 'relative'
  },
  closeBtn: {
    position: 'absolute', top: 16, left: 16,
    background: '#F0E8E0', border: 'none', borderRadius: 8,
    width: 32, height: 32, fontSize: 16, color: 'var(--muted)',
    fontWeight: 700
  },
  modalEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 4 },
  modalSubtitle: { textAlign: 'center', fontWeight: 600, color: 'var(--text)', marginBottom: 4 },
  modalNote: { textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginBottom: 16 },

  toppingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginBottom: 24
  },
  toppingBtn: {
    padding: '10px 4px',
    borderRadius: 10,
    background: 'var(--orange-pale)',
    color: 'var(--text)',
    border: '2px solid transparent',
    fontSize: 15,
    fontWeight: 600,
    transition: 'all 0.12s'
  },
  toppingActive: {
    background: 'var(--orange)',
    color: '#fff',
    border: '2px solid var(--orange)'
  },
  freeBadge: { fontSize: 11, opacity: 0.85 },

  modalFooter: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderTop: '1px solid #F0E4D8', paddingTop: 16
  },
  modalPrice: { fontSize: 26, fontWeight: 800, color: 'var(--orange)' },
  modalAddBtn: {
    background: 'var(--orange)',
    color: '#fff',
    borderRadius: 12,
    padding: '12px 28px',
    fontSize: 17,
    fontWeight: 800
  },

  // Success
  successWrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'var(--bg)', padding: 16
  },
  successCard: {
    background: '#fff', borderRadius: 24, padding: '40px 32px',
    textAlign: 'center', boxShadow: 'var(--shadow-lg)', maxWidth: 360, width: '100%'
  },
  successIcon: { fontSize: 64, marginBottom: 12 },
  successTitle: { fontSize: 28, fontWeight: 800, marginBottom: 8 },
  successNum: {
    fontSize: 36, fontWeight: 900, color: 'var(--orange)',
    background: 'var(--orange-pale)', borderRadius: 12,
    padding: '8px 20px', display: 'inline-block', marginBottom: 16
  },
  successMsg: { color: 'var(--muted)', fontSize: 17, lineHeight: 1.7, marginBottom: 28 },
  successBtn: {
    background: 'var(--orange)', color: '#fff',
    borderRadius: 12, padding: '12px 32px', fontSize: 16, fontWeight: 700
  }
};

import { useState, useEffect } from 'react';
import './CustomerPage.css';

const MENU = [
  {
    id: 'toast',
    name: 'טוסט',
    emoji: '🥪',
    basePrice: 26,
    description: 'רוטב פיצה · גבינה צהובה',
    priceNote: 'תוספת ראשונה כלולה · כל תוספת נוספת +2₪',
    toppings: [
      { id: 'tomato',    name: 'עגבניה',  free: false },
      { id: 'onion',     name: 'בצל',     free: false },
      { id: 'olives',    name: 'זיתים',   free: false },
      { id: 'mushrooms', name: 'פטריות',  free: false },
      { id: 'pesto',     name: 'פסטו',    free: false },
      { id: 'spicy',     name: 'חריף 🌶', free: true  },
    ]
  },
  {
    id: 'omelette',
    name: 'חביתה',
    emoji: '🍳',
    basePrice: 28,
    description: 'חביתה טרייה',
    priceNote: 'כל הירקות כלולים במחיר',
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

export default function CustomerPage() {
  const [modal, setModal]               = useState(null);
  const [toastSel, setToastSel]         = useState([]);
  let   [omeletteSel, setOmeletteSel]   = useState([]);
  const [cart, setCart]                 = useState([]);
  const [name, setName]                 = useState('');
  const [phone, setPhone]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [orderId, setOrderId]           = useState(null);
  const [error, setError]               = useState('');
  const [visible, setVisible]           = useState(false);

  useEffect(() => { setTimeout(() => setVisible(true), 50); }, []);

  const total = cart.reduce((s, i) => s + i.price, 0);

  function openModal(item) {
    setModal(item);
    setToastSel([]);
    setOmeletteSel([]);
  }

  function toggleToast(id) {
    setToastSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }
  function toggleOmelette(id) {
    setOmeletteSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  function addToCart() {
    if (modal.id === 'toast') {
      const price  = calcToastPrice(toastSel);
      const extras = toastSel.map(id => modal.toppings.find(t => t.id === id)?.name).filter(Boolean);
      setCart(p => [...p, { uid: Date.now(), name: 'טוסט', extras, price }]);
    } else {
      const extras = omeletteSel.map(id => modal.vegetables.find(v => v.id === id)?.name).filter(Boolean);
      setCart(p => [...p, { uid: Date.now(), name: 'חביתה', extras, price: 28 }]);
    }
    setModal(null);
  }

  function removeFromCart(uid) {
    setCart(p => p.filter(i => i.uid !== uid));
  }

  async function submitOrder() {
    if (!name.trim())                                   { setError('אנא הכנס שם'); return; }
    if (!/^0[0-9]{9}$/.test(phone.replace(/[-\s]/g,''))) { setError('מספר טלפון לא תקין'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res  = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName:  name.trim(),
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

  /* ── Success ── */
  if (orderId) return (
    <div className="success-wrap">
      <div className="success-card">
        <div className="success-check">✓</div>
        <h2 className="success-title">ההזמנה נשלחה</h2>
        <div className="success-num">#{orderId}</div>
        <p className="success-msg">נשלח לך הודעה בוואטסאפ<br/>כשהאוכל מוכן</p>
        <button className="success-btn" onClick={() => { setCart([]); setName(''); setPhone(''); setOrderId(null); }}>
          הזמנה חדשה
        </button>
      </div>
    </div>
  );

  return (
    <div className={`page ${visible ? 'page--visible' : ''}`}>

      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <span className="header-icon">🚐</span>
          <h1 className="header-title">הקרון</h1>
        </div>
        <p className="header-sub">אוכל רחוב · טרי · מהיר</p>
      </header>

      <main className="main">

        {/* Menu */}
        <section className="section">
          <h2 className="section-title">התפריט</h2>
          <div className="menu-grid">
            {MENU.map((item, i) => (
              <div
                key={item.id}
                className="menu-card"
                style={{ animationDelay: `${0.1 + i * 0.15}s` }}
              >
                <div className="menu-emoji">{item.emoji}</div>
                <h3 className="menu-name">{item.name}</h3>
                <p className="menu-desc">{item.description}</p>
                <p className="menu-note">{item.priceNote}</p>
                <div className="menu-footer">
                  <span className="menu-price">{item.basePrice}₪</span>
                  <button className="add-btn" onClick={() => openModal(item)}>
                    <span className="add-btn-plus">+</span> הוסף
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Cart */}
        {cart.length > 0 && (
          <section className="cart-section">
            <h2 className="section-title">ההזמנה שלי</h2>
            <div className="cart-list">
              {cart.map(item => (
                <div key={item.uid} className="cart-item">
                  <div className="cart-item-info">
                    <span className="cart-item-name">{item.name}</span>
                    {item.extras.length > 0 &&
                      <span className="cart-item-extras">{item.extras.join(' · ')}</span>}
                  </div>
                  <div className="cart-item-right">
                    <span className="cart-item-price">{item.price}₪</span>
                    <button className="remove-btn" onClick={() => removeFromCart(item.uid)}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="total-row">
              <span className="total-label">סה"כ</span>
              <span className="total-price">{total}₪</span>
            </div>

            <div className="form-section">
              <p className="form-label">פרטים לקבלת הודעה בוואטסאפ</p>
              <input className="input" type="text" placeholder="שם" value={name}
                onChange={e => setName(e.target.value)} />
              <input className="input" type="tel" placeholder="טלפון (0501234567)" value={phone}
                onChange={e => setPhone(e.target.value)} dir="ltr" />
              {error && <p className="error-msg">{error}</p>}
              <button
                className={`submit-btn ${submitting ? 'submit-btn--loading' : ''}`}
                onClick={submitOrder}
                disabled={submitting}
              >
                {submitting
                  ? <span className="spinner" />
                  : `שלח הזמנה · ${total}₪`}
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Modal */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setModal(null)}>✕</button>

            <div className="modal-emoji">{modal.emoji}</div>
            <h3 className="modal-title">{modal.name}</h3>

            {modal.id === 'toast' && (<>
              <p className="modal-subtitle">בחר תוספות</p>
              <p className="modal-note">תוספת ראשונה כלולה · חריף תמיד חינם</p>
              <div className="topping-grid">
                {modal.toppings.map(t => (
                  <button
                    key={t.id}
                    className={`topping-btn ${toastSel.includes(t.id) ? 'topping-btn--active' : ''}`}
                    onClick={() => toggleToast(t.id)}
                  >
                    {t.name}
                    {t.free && <span className="free-tag">חינם</span>}
                  </button>
                ))}
              </div>
              <div className="modal-footer">
                <span className="modal-price">{calcToastPrice(toastSel)}₪</span>
                <button className="modal-add-btn" onClick={addToCart}>הוסף להזמנה</button>
              </div>
            </>)}

            {modal.id === 'omelette' && (<>
              <p className="modal-subtitle">ירקות לבחירה</p>
              <p className="modal-note">הכל כלול במחיר</p>
              <div className="topping-grid">
                {modal.vegetables.map(v => (
                  <button
                    key={v.id}
                    className={`topping-btn ${omeletteSel.includes(v.id) ? 'topping-btn--active' : ''}`}
                    onClick={() => toggleOmelette(v.id)}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
              <div className="modal-footer">
                <span className="modal-price">28₪</span>
                <button className="modal-add-btn" onClick={addToCart}>הוסף להזמנה</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}

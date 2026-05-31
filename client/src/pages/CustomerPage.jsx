import { useState } from 'react';
import './CustomerPage.css';

const MENU = [
  {
    id: 'toast',
    name: 'טוסט',
    icon: '🥪',
    basePrice: 26,
    desc: 'רוטב פיצה · גבינה צהובה',
    note: 'תוספת ראשונה כלולה · כל תוספת נוספת 2₪',
    toppings: [
      { id: 'tomato',    name: 'עגבניה',  free: false },
      { id: 'onion',     name: 'בצל',     free: false },
      { id: 'olives',    name: 'זיתים',   free: false },
      { id: 'mushrooms', name: 'פטריות',  free: false },
      { id: 'pesto',     name: 'פסטו',    free: false },
      { id: 'spicy',     name: 'חריף',    free: true  },
    ]
  },
  {
    id: 'omelette',
    name: 'חביתה',
    icon: '🍳',
    basePrice: 28,
    desc: 'חביתה טרייה',
    note: 'כל הירקות כלולים במחיר',
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

function calcToastPrice(sel) {
  return 26 + Math.max(0, sel.filter(id => id !== 'spicy').length - 1) * 2;
}

export default function CustomerPage() {
  const [modal,      setModal]      = useState(null);
  const [toastSel,   setToastSel]   = useState([]);
  const [omlSel,     setOmlSel]     = useState([]);
  const [cart,       setCart]       = useState([]);
  const [name,       setName]       = useState('');
  const [phone,      setPhone]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [orderId,    setOrderId]    = useState(null);

  const total = cart.reduce((s, i) => s + i.price, 0);

  function openModal(item) { setModal(item); setToastSel([]); setOmlSel([]); }

  function toggle(id, sel, setSel) {
    setSel(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  function addToCart() {
    if (modal.id === 'toast') {
      const extras = toastSel.map(id => modal.toppings.find(t => t.id === id)?.name).filter(Boolean);
      setCart(p => [...p, { uid: Date.now(), name: 'טוסט', extras, price: calcToastPrice(toastSel) }]);
    } else {
      const extras = omlSel.map(id => modal.vegetables.find(v => v.id === id)?.name).filter(Boolean);
      setCart(p => [...p, { uid: Date.now(), name: 'חביתה', extras, price: 28 }]);
    }
    setModal(null);
  }

  async function submit() {
    if (!name.trim())                                         { setError('נא להכניס שם'); return; }
    if (!/^0[0-9]{9}$/.test(phone.replace(/[-\s]/g, '')))    { setError('מספר טלפון לא תקין'); return; }
    setError(''); setLoading(true);
    try {
      const res  = await fetch('/api/orders', {
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
    } catch { setError('שגיאה בשליחה, נסה שוב'); }
    finally  { setLoading(false); }
  }

  if (orderId) return (
    <div className="success-wrap">
      <div className="success-card">
        <span className="success-check">✓</span>
        <h2 className="success-title">ההזמנה נשלחה!</h2>
        <div className="success-num">#{orderId}</div>
        <p className="success-msg">נשלח לך הודעה בוואטסאפ<br/>כשהאוכל מוכן</p>
        <button className="success-btn" onClick={() => { setCart([]); setName(''); setPhone(''); setOrderId(null); }}>
          הזמנה חדשה
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <div className="header-logo">ה<span>קרון</span></div>
          <span className="header-tag">אוכל רחוב</span>
        </div>
      </header>

      <main className="main">
        <section className="section">
          <p className="section-label">התפריט</p>
          <div className="menu-grid">
            {MENU.map(item => (
              <div key={item.id} className="menu-card">
                <div className="menu-card-left">
                  <span className="menu-item-icon">{item.icon}</span>
                  <div className="menu-item-name">{item.name}</div>
                  <div className="menu-item-desc">{item.desc}</div>
                  <div className="menu-item-note">{item.note}</div>
                </div>
                <div className="menu-card-right">
                  <span className="menu-item-price">{item.basePrice}₪</span>
                  <button className="add-btn" onClick={() => openModal(item)}>הוסף +</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {cart.length > 0 && (
          <section className="section">
            <p className="section-label">הזמנה</p>
            <div className="cart-section">
              <div className="cart-header">פריטים שנבחרו</div>

              {cart.map(item => (
                <div key={item.uid} className="cart-item">
                  <div className="cart-item-info">
                    <div className="cart-item-name">{item.name}</div>
                    {item.extras.length > 0 &&
                      <div className="cart-item-extras">{item.extras.join(', ')}</div>}
                  </div>
                  <div className="cart-item-right">
                    <span className="cart-item-price">{item.price}₪</span>
                    <button className="remove-btn" onClick={() => setCart(p => p.filter(i => i.uid !== item.uid))}>✕</button>
                  </div>
                </div>
              ))}

              <div className="total-row">
                <span className="total-label">סה"כ לתשלום</span>
                <span className="total-price">{total}₪</span>
              </div>

              <div className="form-section">
                <p className="form-title">לאן לשלוח הודעה?</p>
                <input className="input" type="text" placeholder="שם" value={name} onChange={e => setName(e.target.value)} />
                <input className="input" type="tel"  placeholder="מספר טלפון" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" />
                {error && <p className="error-msg">{error}</p>}
                <button className="submit-btn" onClick={submit} disabled={loading}>
                  {loading ? <span className="spinner" /> : `שלח הזמנה · ${total}₪`}
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <button className="close-btn" onClick={() => setModal(null)}>✕</button>

            <span className="modal-item-icon">{modal.icon}</span>
            <h3 className="modal-title">{modal.name}</h3>

            {modal.id === 'toast' && (<>
              <p className="modal-subtitle">בחר תוספות</p>
              <p className="modal-note">תוספת ראשונה כלולה · חריף תמיד בחינם</p>
              <div className="topping-grid">
                {modal.toppings.map(t => (
                  <button key={t.id}
                    className={`topping-btn ${toastSel.includes(t.id) ? 'topping-btn--active' : ''}`}
                    onClick={() => toggle(t.id, toastSel, setToastSel)}>
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
                  <button key={v.id}
                    className={`topping-btn ${omlSel.includes(v.id) ? 'topping-btn--active' : ''}`}
                    onClick={() => toggle(v.id, omlSel, setOmlSel)}>
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

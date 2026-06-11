import { useState } from 'react';
import './CustomerPage.css';

const FOOD = [
  {
    id: 'omelette', name: 'חביתה', icon: '🍳', basePrice: 28,
    desc: 'חביתה טרייה',
  },
  {
    id: 'toast', name: 'טוסט', icon: '🥪', basePrice: 26,
    desc: 'רוטב פיצה · גבינה צהובה',
    note: 'תוספת ראשונה כלולה · כל תוספת נוספת +2₪',
    toppings: [
      { id: 'tomato',    name: 'עגבניה', free: false },
      { id: 'onion',     name: 'בצל',    free: false },
      { id: 'olives',    name: 'זיתים',  free: false },
      { id: 'mushrooms', name: 'פטריות', free: false },
      { id: 'pesto',     name: 'פסטו',   free: false },
      { id: 'spicy',     name: 'חריף',   free: true  },
    ]
  },
  {
    id: 'veggie-omelette', name: 'חביתת ירק', icon: '🥬', basePrice: 33,
    desc: 'חביתה עם כל הירקות',
    note: 'כל הירקות כלולים במחיר',
    vegetables: [
      { id: 'tomato',   name: 'עגבניה' },
      { id: 'cucumber', name: 'מלפפון' },
      { id: 'lettuce',  name: 'חסה'    },
      { id: 'onion',    name: 'בצל'    },
      { id: 'olives',   name: 'זיתים'  },
      { id: 'pickles',  name: 'חמוצים' },
    ]
  },
  {
    id: 'mushroom-omelette', name: 'חביתת פטריות', icon: '🍄', basePrice: 31,
    desc: 'חביתה עם פטריות',
  },
  {
    id: 'cream-cheese', name: 'סנדביץ גבינת שמנת', icon: '🥖', basePrice: 25,
    desc: 'גבינת שמנת טרייה',
    note: 'כל הירקות כלולים במחיר',
    vegetables: [
      { id: 'tomato',   name: 'עגבניה' },
      { id: 'cucumber', name: 'מלפפון' },
      { id: 'lettuce',  name: 'חסה'    },
      { id: 'onion',    name: 'בצל'    },
      { id: 'olives',   name: 'זיתים'  },
      { id: 'pickles',  name: 'חמוצים' },
    ]
  },
];

// drinks with sizes: can 8₪ / bottle 10₪
// drinks without sizes: fixed price
const DRINKS = [
  { id: 'coke',         name: 'קולה',        bg: '#CC0000', sizes: true  },
  { id: 'coke-zero',    name: 'קולה זירו',   bg: '#111111', sizes: true  },
  { id: 'fanta',        name: 'פאנטה',       bg: '#E55A00', sizes: true  },
  { id: 'sprite',       name: 'ספרייט',      bg: '#007A33', sizes: true  },
  { id: 'water-grape',  name: 'מים ענבים',   bg: '#5B2D8E', price: 10, sizes: false },
  { id: 'water-peach',  name: 'מים אפרסק',   bg: '#D4660A', price: 10, sizes: false },
  { id: 'excel',        name: 'אקסל',        bg: '#1A4FA0', price: 7,  sizes: false },
  { id: 'excel-black',  name: 'אקסל שחור',   bg: '#1A1A1A', price: 7,  sizes: false },
  { id: 'excel-blue',   name: 'אקסל בלו',    bg: '#0A7EC2', price: 7,  sizes: false },
];

function calcToastPrice(sel) {
  return 26 + Math.max(0, sel.filter(id => id !== 'spicy').length - 1) * 2;
}

export default function CustomerPage() {
  const [modal,   setModal]   = useState(null);
  const [toastSel, setToastSel] = useState([]);
  const [omlSel,  setOmlSel]  = useState([]);
  const [cart,    setCart]    = useState([]);
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [orderId, setOrderId] = useState(null);

  const total = cart.reduce((s, i) => s + i.price, 0);

  function openModal(item) { setModal(item); setToastSel([]); setOmlSel([]); }

  function handleAdd(item) {
    if (item.toppings || item.vegetables) {
      openModal(item);
    } else {
      setCart(p => [...p, { uid: Date.now(), name: item.name, extras: [], price: item.basePrice }]);
    }
  }

  function toggle(id, sel, set) {
    set(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  function addFood() {
    if (modal.toppings) {
      const extras = toastSel.map(id => modal.toppings.find(t => t.id === id)?.name).filter(Boolean);
      setCart(p => [...p, { uid: Date.now(), name: modal.name, extras, price: calcToastPrice(toastSel) }]);
    } else {
      const extras = omlSel.map(id => modal.vegetables.find(v => v.id === id)?.name).filter(Boolean);
      setCart(p => [...p, { uid: Date.now(), name: modal.name, extras, price: modal.basePrice }]);
    }
    setModal(null);
  }

  function addDrink(drink, size, price) {
    const name = size ? `${drink.name} ${size}` : drink.name;
    setCart(p => [...p, { uid: Date.now(), name, extras: [], price }]);
  }

  async function submit() {
    if (!name.trim())                                       { setError('נא להכניס שם'); return; }
    if (!/^0[0-9]{9}$/.test(phone.replace(/[-\s]/g, ''))) { setError('מספר טלפון לא תקין'); return; }
    setError(''); setLoading(true);
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
    } catch { setError('שגיאה בשליחה, נסה שוב'); }
    finally  { setLoading(false); }
  }

  if (orderId) {
    const waText = [
      `הזמנה חדשה! 🛵 #${orderId}`,
      ``,
      `שם: ${name}`,
      `טלפון: ${phone}`,
      ``,
      ...cart.map(i => `• ${i.name}${i.extras.length ? ' - ' + i.extras.join(', ') : ''}: ${i.price}₪`),
      ``,
      `סה״כ: ${total}₪`
    ].join('\n');
    const waUrl = `https://wa.me/972545414123?text=${encodeURIComponent(waText)}`;

    return (
      <div className="success-wrap">
        <div className="success-card">
          <div className="success-check">✓</div>
          <h2 className="success-title">ההזמנה מוכנה!</h2>
          <div className="success-num">#{orderId}</div>
          <p className="success-msg">לחץ על הכפתור כדי לשלוח<br/>את ההזמנה לשף בוואטסאפ</p>
          <a href={waUrl} className="whatsapp-btn" target="_blank" rel="noopener noreferrer">
            שלח הזמנה לשף 📲
          </a>
          <button className="success-btn"
            onClick={() => { setCart([]); setName(''); setPhone(''); setOrderId(null); }}>
            הזמנה חדשה
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">

      {/* Header */}
      <header className="header">
        <div className="header-glow" />
        <img src="/logo.svg" alt="הקרון" className="header-logo" />
        <h1 className="header-title">הקרון</h1>
      </header>

      <main className="main">

        {/* Food */}
        <section className="section">
          <p className="section-label">אוכל</p>
          <div className="food-grid">
            {FOOD.map((item, i) => (
              <div key={item.id} className="food-card" style={{ animationDelay: `${i * 0.12}s` }}>
                <span className="food-icon">{item.icon}</span>
                <div className="food-body">
                  <h3 className="food-name">{item.name}</h3>
                  <p className="food-desc">{item.desc}</p>
                  <p className="food-note">{item.note}</p>
                </div>
                <div className="food-right">
                  <span className="food-price">{item.basePrice}₪</span>
                  <button className="add-btn" onClick={() => handleAdd(item)}>הוסף +</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Drinks */}
        <section className="section">
          <p className="section-label">שתייה</p>
          <div className="drinks-grid">
            {DRINKS.map(d => (
              <div key={d.id} className="drink-card">
                <div className="drink-dot" style={{ background: d.bg }} />
                <span className="drink-name">{d.name}</span>
                {d.sizes ? (
                  <div className="drink-sizes">
                    <button className="drink-btn" onClick={() => addDrink(d, 'פחית', 8)}>
                      <span>פחית</span><strong>8₪</strong>
                    </button>
                    <button className="drink-btn" onClick={() => addDrink(d, 'בקבוק', 10)}>
                      <span>בקבוק</span><strong>10₪</strong>
                    </button>
                  </div>
                ) : (
                  <button className="drink-add" onClick={() => addDrink(d, null, d.price)}>
                    {d.price}₪ +
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Cart */}
        {cart.length > 0 && (
          <section className="section">
            <p className="section-label">ההזמנה שלי</p>
            <div className="cart-box">
              {cart.map(item => (
                <div key={item.uid} className="cart-row">
                  <div className="cart-info">
                    <span className="cart-name">{item.name}</span>
                    {item.extras.length > 0 &&
                      <span className="cart-extras">{item.extras.join(' · ')}</span>}
                  </div>
                  <span className="cart-price">{item.price}₪</span>
                  <button className="del-btn"
                    onClick={() => setCart(p => p.filter(i => i.uid !== item.uid))}>✕</button>
                </div>
              ))}
              <div className="cart-total">
                <span>סה"כ</span>
                <span className="cart-total-price">{total}₪</span>
              </div>

              <div className="form">
                <p className="form-label">לאן לשלוח הודעה כשמוכן?</p>
                <input className="inp" type="text" placeholder="שם" value={name}
                  onChange={e => setName(e.target.value)} />
                <input className="inp" type="tel" placeholder="מספר טלפון" value={phone}
                  onChange={e => setPhone(e.target.value)} dir="ltr" />
                {error && <p className="err">{error}</p>}
                <button className="submit-btn" onClick={submit} disabled={loading}>
                  {loading ? <span className="spin" /> : `שלח הזמנה · ${total}₪`}
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Modal */}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-bar" />
            <button className="close-btn" onClick={() => setModal(null)}>✕</button>
            <span className="modal-icon">{modal.icon}</span>
            <h3 className="modal-title">{modal.name}</h3>

            {modal.toppings && (<>
              <p className="modal-sub">בחר תוספות</p>
              <p className="modal-note">תוספת ראשונה כלולה · חריף תמיד בחינם</p>
              <div className="topping-grid">
                {modal.toppings.map(t => (
                  <button key={t.id}
                    className={`top-btn ${toastSel.includes(t.id) ? 'top-btn--on' : ''}`}
                    onClick={() => toggle(t.id, toastSel, setToastSel)}>
                    {t.name}
                    {t.free && <span className="free-tag">חינם</span>}
                  </button>
                ))}
              </div>
              <div className="modal-foot">
                <span className="modal-price">{calcToastPrice(toastSel)}₪</span>
                <button className="modal-add" onClick={addFood}>הוסף להזמנה</button>
              </div>
            </>)}

            {modal.vegetables && (<>
              <p className="modal-sub">ירקות לבחירה</p>
              <p className="modal-note">הכל כלול במחיר</p>
              <div className="topping-grid">
                {modal.vegetables.map(v => (
                  <button key={v.id}
                    className={`top-btn ${omlSel.includes(v.id) ? 'top-btn--on' : ''}`}
                    onClick={() => toggle(v.id, omlSel, setOmlSel)}>
                    {v.name}
                  </button>
                ))}
              </div>
              <div className="modal-foot">
                <span className="modal-price">{modal.basePrice}₪</span>
                <button className="modal-add" onClick={addFood}>הוסף להזמנה</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}

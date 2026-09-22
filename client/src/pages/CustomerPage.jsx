import { useEffect, useMemo, useState } from 'react';
import { DRINKS, ALL_ITEMS, SITE_INFO } from '../data/menu';
import { getOpenStatus, generateTimeSlots, computeTotals, formatPrice } from '../lib/orderUtils';
import Header from '../components/Header';
import Hero from '../components/Hero';
import MenuSection from '../components/MenuSection';
import ItemModal from '../components/ItemModal';
import CartDrawer from '../components/CartDrawer';
import FAQSection from '../components/FAQSection';
import Footer from '../components/Footer';
import WhatsAppFab from '../components/WhatsAppFab';
import './CustomerPage.css';

const CART_KEY = 'hakaron.cart.v1';
const FAV_KEY = 'hakaron.favorites.v1';
const LAST_ORDER_KEY = 'hakaron.lastOrder.v1';

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function addonsSignature(addons) {
  return addons.map(a => a.id).sort().join(',');
}

export default function CustomerPage() {
  const [cart, setCart] = useState(() => loadJSON(CART_KEY, []));
  const [favorites, setFavorites] = useState(() => new Set(loadJSON(FAV_KEY, [])));
  const [lastOrder, setLastOrder] = useState(() => loadJSON(LAST_ORDER_KEY, null));

  const [modalItem, setModalItem] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartBump, setCartBump] = useState(false);
  const [toast, setToast] = useState(null);

  const [fulfillment, setFulfillment] = useState('pickup');
  const [selectedTime, setSelectedTime] = useState('asap');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState('מזומן');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderResult, setOrderResult] = useState(null);

  const openStatus = useMemo(() => getOpenStatus(), []);
  const timeSlots = useMemo(() => generateTimeSlots(), [cartOpen]);

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); }, [favorites]);

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 1800);
  }

  function bumpCart() {
    setCartBump(true);
    setTimeout(() => setCartBump(false), 500);
  }

  function addToCart(line) {
    setCart(prev => {
      const sig = addonsSignature(line.addons);
      const existing = prev.find(l => l.itemId === line.itemId && addonsSignature(l.addons) === sig);
      if (existing) {
        return prev.map(l => l.uid === existing.uid ? { ...l, qty: l.qty + line.qty } : l);
      }
      return [...prev, { ...line, uid: `${line.itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }];
    });
    bumpCart();
    showToast(`${line.name} נוסף לסל 🛍️`);
  }

  function handleModalAdd(line) {
    addToCart(line);
    setModalItem(null);
  }

  function increaseLine(uid) {
    setCart(prev => prev.map(l => l.uid === uid ? { ...l, qty: l.qty + 1 } : l));
  }
  function decreaseLine(uid) {
    setCart(prev => prev
      .map(l => l.uid === uid ? { ...l, qty: l.qty - 1 } : l)
      .filter(l => l.qty > 0));
  }
  function removeLine(uid) {
    setCart(prev => prev.filter(l => l.uid !== uid));
  }

  function toggleFavorite(id) {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleOrderAgain() {
    if (!lastOrder) return;
    setCart(lastOrder.lines.map(l => ({
      ...l,
      uid: `${l.itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    })));
    setCartOpen(true);
    showToast('ההזמנה הקודמת נוספה לסל ↻');
  }

  const recommendations = useMemo(() => {
    const inCart = new Set(cart.map(l => l.itemId));
    return DRINKS.filter(i => !inCart.has(i.id)).slice(0, 4);
  }, [cart]);

  async function handleSubmit() {
    setError('');
    if (!name.trim()) { setError('נא להכניס שם מלא'); return; }
    if (!/^0[0-9]{8,9}$/.test(phone.replace(/[-\s]/g, ''))) { setError('מספר טלפון לא תקין'); return; }
    if (fulfillment === 'delivery' && !address.trim()) { setError('נא להכניס כתובת למשלוח'); return; }

    const { subtotal, deliveryFee, total } = computeTotals(cart, fulfillment);
    setLoading(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim(),
          customerPhone: phone.replace(/[-\s]/g, ''),
          items: cart.map(l => ({
            name: l.qty > 1 ? `${l.name} × ${l.qty}` : l.name,
            extras: l.addons.map(a => a.name),
            price: l.unitPrice * l.qty,
          })),
          subtotal,
          deliveryFee,
          total,
          payment,
          fulfillment,
          address: fulfillment === 'delivery' ? address.trim() : null,
          requestedTime: selectedTime,
          notes: notes.trim(),
        }),
      });
      if (!res.ok) throw new Error('order-failed');
      const data = await res.json();

      const result = {
        orderId: data.orderId,
        fulfillment,
        selectedTime,
        total,
        lines: cart,
      };
      setOrderResult(result);
      localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ lines: cart }));
      setLastOrder({ lines: cart });
      setCart([]);
      setCartOpen(false);
      setNotes('');
    } catch {
      setError('הייתה תקלה בשליחת ההזמנה. נסו שוב בעוד רגע.');
    } finally {
      setLoading(false);
    }
  }

  function resetOrder() {
    setOrderResult(null);
    setName(''); setPhone(''); setAddress(''); setNotes('');
    setFulfillment('pickup'); setSelectedTime('asap');
  }

  if (orderResult) {
    const timeLabel = orderResult.selectedTime === 'asap'
      ? `בעוד כ-${SITE_INFO.prepTimeMinutes} דקות`
      : `בשעה ${orderResult.selectedTime}`;
    const paymentEmoji = { 'מזומן': '💵', 'ביט': '🔵', 'פייבוקס': '💙' }[payment] || '';
    const waText = [
      `הזמנה חדשה מהאתר! #${orderResult.orderId}`,
      ``,
      `שם: ${name}`,
      `טלפון: ${phone}`,
      `${orderResult.fulfillment === 'delivery' ? 'משלוח לכתובת: ' + address : 'איסוף עצמי'}`,
      `תשלום: ${paymentEmoji} ${payment}`,
      ``,
      ...orderResult.lines.map(l => `• ${l.name}${l.addons.length ? ' - ' + l.addons.map(a => a.name).join(', ') : ''}: ${formatPrice(l.unitPrice * l.qty)}`),
      ``,
      `סה״כ: ${formatPrice(orderResult.total)}`,
    ].join('\n');
    const waUrl = `https://wa.me/${SITE_INFO.whatsapp}?text=${encodeURIComponent(waText)}`;

    return (
      <div className="success-wrap">
        <div className="success-card">
          <div className="success-check">✓</div>
          <h2 className="success-title">ההזמנה נשלחה בהצלחה!</h2>
          <div className="success-num">מספר הזמנה #{orderResult.orderId}</div>
          <p className="success-msg">
            {orderResult.fulfillment === 'delivery' ? 'המשלוח בדרך אליכם' : 'ההזמנה תחכה לכם לאיסוף'}<br />
            {timeLabel}
          </p>
          <p className="success-demo">🔒 זו הזמנת דמו — התשלום בפועל מתבצע מול המזנון, לא בוצע חיוב מקוון.</p>
          <a href={waUrl} className="whatsapp-btn" target="_blank" rel="noopener noreferrer">
            שלחו לנו את ההזמנה בוואטסאפ 📲
          </a>
          <button className="success-btn" onClick={resetOrder}>הזמנה חדשה</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Header
        openStatus={openStatus}
        cartCount={cartCount}
        cartBump={cartBump}
        onCartClick={() => setCartOpen(true)}
      />

      <Hero
        openStatus={openStatus}
        onOrderClick={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })}
        onOrderAgain={handleOrderAgain}
        hasLastOrder={!!lastOrder}
      />

      <main>
        <MenuSection
          menu={ALL_ITEMS}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onOpenItem={setModalItem}
        />
        <FAQSection />
      </main>

      <Footer />
      <WhatsAppFab />

      {modalItem && (
        <ItemModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onAdd={handleModalAdd}
        />
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onIncrease={increaseLine}
        onDecrease={decreaseLine}
        onRemove={removeLine}
        fulfillment={fulfillment}
        setFulfillment={setFulfillment}
        timeSlots={timeSlots}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        name={name} setName={setName}
        phone={phone} setPhone={setPhone}
        address={address} setAddress={setAddress}
        notes={notes} setNotes={setNotes}
        payment={payment} setPayment={setPayment}
        error={error}
        loading={loading}
        onSubmit={handleSubmit}
        recommendations={recommendations}
        onOpenItem={item => { setCartOpen(false); setModalItem(item); }}
      />

      {toast && <div className="add-toast" role="status">{toast}</div>}
    </div>
  );
}

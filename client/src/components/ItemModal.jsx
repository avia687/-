import { useEffect, useState } from 'react';
import {
  SANDWICH_VEGETABLES, TOAST_TOPPINGS, TOAST_TOPPING_PRICE, TOAST_SAUCES, PAID_ADDONS,
} from '../data/menu';
import FoodArt from './FoodArt';
import { formatPrice } from '../lib/orderUtils';

const TAG_LABELS = {
  popular: 'הכי אהוב',
  vegetarian: 'צמחוני',
  vegan: 'טבעוני',
  spicy: 'חריף',
};

export default function ItemModal({ item, onClose, onAdd }) {
  const isSized = Array.isArray(item.sizes) && item.sizes.length > 0;
  const [sizeId, setSizeId] = useState(isSized ? item.sizes[0].id : null);
  const [vegSel, setVegSel] = useState([]);
  const [toppingSel, setToppingSel] = useState([]);
  const [sauceSel, setSauceSel] = useState([]);
  const [paidSel, setPaidSel] = useState([]);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(id, list, setList) {
    setList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const freeCount = item.includedToppings || 0;
  const toppingsExtra = item.toastToppings ? toppingSel.reduce((sum, id, idx) => {
    if (idx < freeCount) return sum;
    return sum + TOAST_TOPPING_PRICE;
  }, 0) : 0;
  const paidExtra = item.paidAddons ? paidSel.reduce((sum, id) => {
    const addon = PAID_ADDONS.find(a => a.id === id);
    return sum + (addon ? addon.price : 0);
  }, 0) : 0;

  const selectedSize = isSized ? item.sizes.find(s => s.id === sizeId) : null;
  const basePrice = isSized ? selectedSize.price : item.price;
  const unitPrice = basePrice + toppingsExtra + paidExtra;
  const lineTotal = unitPrice * qty;

  function handleAdd() {
    const addons = [];
    vegSel.forEach(id => {
      const v = SANDWICH_VEGETABLES.find(x => x.id === id);
      if (v) addons.push({ id: v.id, name: v.name, price: 0 });
    });
    toppingSel.forEach((id, idx) => {
      const t = TOAST_TOPPINGS.find(x => x.id === id);
      if (t) addons.push({ id: t.id, name: t.name, price: idx < freeCount ? 0 : TOAST_TOPPING_PRICE });
    });
    sauceSel.forEach(id => {
      const s = TOAST_SAUCES.find(x => x.id === id);
      if (s) addons.push({ id: s.id, name: s.name, price: 0 });
    });
    paidSel.forEach(id => {
      const a = PAID_ADDONS.find(x => x.id === id);
      if (a) addons.push({ id: a.id, name: a.name, price: a.price });
    });

    onAdd({
      itemId: item.id,
      name: isSized ? `${item.name} (${selectedSize.label})` : item.name,
      art: item.art,
      basePrice,
      addons,
      unitPrice,
      qty,
    });
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={e => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="סגור">✕</button>

        <div className="modal-hero">
          <FoodArt id={item.art} size={118} />
        </div>

        {item.tags.length > 0 && (
          <div className="item-tags modal-tags">
            {item.tags.map(t => <span key={t} className={`tag tag--${t}`}>{TAG_LABELS[t]}</span>)}
          </div>
        )}

        <h3 id="modal-title" className="modal-title">{item.name}</h3>
        <p className="modal-desc">{item.desc}</p>

        {isSized && (
          <div className="modal-addons">
            <p className="modal-sub">גודל</p>
            <div className="addon-grid">
              {item.sizes.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`addon-btn ${sizeId === s.id ? 'addon-btn--on' : ''}`}
                  onClick={() => setSizeId(s.id)}
                  aria-pressed={sizeId === s.id}
                >
                  <span>{s.label}</span>
                  <span className="addon-price">{formatPrice(s.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {item.vegetables && (
          <div className="modal-addons">
            <p className="modal-sub">ירקות לבחירה <span className="modal-note">· הכול חינם</span></p>
            <div className="addon-grid">
              {SANDWICH_VEGETABLES.map(v => (
                <button
                  key={v.id}
                  type="button"
                  className={`addon-btn ${vegSel.includes(v.id) ? 'addon-btn--on' : ''}`}
                  onClick={() => toggle(v.id, vegSel, setVegSel)}
                  aria-pressed={vegSel.includes(v.id)}
                >
                  <span>{v.name}</span>
                  <span className="addon-price">{vegSel.includes(v.id) ? 'נבחר ✓' : 'חינם'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {item.toastToppings && (
          <div className="modal-addons">
            <p className="modal-sub">
              תוספות לטוסט
              {freeCount > 0 && <span className="modal-note"> · הראשונה כלולה, כל נוספת {formatPrice(TOAST_TOPPING_PRICE)}</span>}
            </p>
            <div className="addon-grid">
              {TOAST_TOPPINGS.map(t => {
                const idx = toppingSel.indexOf(t.id);
                const on = idx !== -1;
                const isFree = on && idx < freeCount;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`addon-btn ${on ? 'addon-btn--on' : ''}`}
                    onClick={() => toggle(t.id, toppingSel, setToppingSel)}
                    aria-pressed={on}
                  >
                    <span>{t.name}</span>
                    <span className="addon-price">
                      {on ? (isFree ? 'כלול' : `+${formatPrice(TOAST_TOPPING_PRICE)}`) : `+${formatPrice(TOAST_TOPPING_PRICE)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {item.sauces && (
          <div className="modal-addons">
            <p className="modal-sub">רוטב לבחירה <span className="modal-note">· חינם</span></p>
            <div className="addon-grid">
              {TOAST_SAUCES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`addon-btn ${sauceSel.includes(s.id) ? 'addon-btn--on' : ''}`}
                  onClick={() => toggle(s.id, sauceSel, setSauceSel)}
                  aria-pressed={sauceSel.includes(s.id)}
                >
                  <span>{s.name}</span>
                  <span className="addon-price">{sauceSel.includes(s.id) ? 'נבחר ✓' : 'חינם'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {item.paidAddons && (
          <div className="modal-addons">
            <p className="modal-sub">תוספות בתשלום</p>
            <div className="addon-grid">
              {PAID_ADDONS.map(a => (
                <button
                  key={a.id}
                  type="button"
                  className={`addon-btn ${paidSel.includes(a.id) ? 'addon-btn--on' : ''}`}
                  onClick={() => toggle(a.id, paidSel, setPaidSel)}
                  aria-pressed={paidSel.includes(a.id)}
                >
                  <span>{a.name}</span>
                  <span className="addon-price">+{formatPrice(a.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="modal-qty">
          <span className="modal-sub" style={{ marginBottom: 0 }}>כמות</span>
          <div className="qty-stepper">
            <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="הפחת כמות">−</button>
            <span aria-live="polite">{qty}</span>
            <button type="button" onClick={() => setQty(q => Math.min(10, q + 1))} aria-label="הוסף כמות">+</button>
          </div>
        </div>

        <div className="modal-foot">
          <span className="modal-price">{formatPrice(lineTotal)}</span>
          <button className="btn btn-primary" onClick={handleAdd}>הוספה לסל</button>
        </div>
      </div>
    </div>
  );
}

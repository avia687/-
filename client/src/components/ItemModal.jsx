import { useEffect, useState } from 'react';
import { SANDWICH_ADDONS, TOAST_ADDONS } from '../data/menu';
import FoodArt from './FoodArt';
import { formatPrice } from '../lib/orderUtils';

const TAG_LABELS = {
  popular: 'הכי אהוב',
  vegetarian: 'צמחוני',
  vegan: 'טבעוני',
  spicy: 'חריף',
};

export default function ItemModal({ item, onClose, onAdd }) {
  const [selected, setSelected] = useState([]);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const catalog = item.addons === 'sandwich' ? SANDWICH_ADDONS
    : item.addons === 'toast' ? TOAST_ADDONS
    : [];
  const freeCount = item.includedToppings || 0;

  function toggleAddon(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function addonPriceLabel(id, index) {
    const addon = catalog.find(a => a.id === id);
    if (!addon) return '';
    const isFree = freeCount > 0 && index < freeCount;
    return isFree ? 'כלול' : `+${formatPrice(addon.price)}`;
  }

  const addonsExtra = catalog.length === 0 ? 0 : selected.reduce((sum, id, idx) => {
    if (freeCount > 0 && idx < freeCount) return sum;
    const addon = catalog.find(a => a.id === id);
    return sum + (addon ? addon.price : 0);
  }, 0);

  const unitPrice = item.price + addonsExtra;
  const lineTotal = unitPrice * qty;

  function handleAdd() {
    const addonObjs = selected.map((id, idx) => {
      const addon = catalog.find(a => a.id === id);
      const isFree = freeCount > 0 && idx < freeCount;
      return { id, name: addon.name, price: isFree ? 0 : addon.price };
    });
    onAdd({
      itemId: item.id,
      name: item.name,
      art: item.art,
      basePrice: item.price,
      addons: addonObjs,
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

        {catalog.length > 0 && (
          <div className="modal-addons">
            <p className="modal-sub">
              תוספות לבחירה
              {freeCount > 0 && <span className="modal-note"> · התוספת הראשונה כלולה במחיר</span>}
            </p>
            <div className="addon-grid">
              {catalog.map(a => {
                const idx = selected.indexOf(a.id);
                const on = idx !== -1;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`addon-btn ${on ? 'addon-btn--on' : ''}`}
                    onClick={() => toggleAddon(a.id)}
                    aria-pressed={on}
                  >
                    <span>{a.name}</span>
                    <span className="addon-price">{on ? addonPriceLabel(a.id, idx) : `+${formatPrice(a.price)}`}</span>
                  </button>
                );
              })}
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

import { useEffect, useState } from 'react';
import { SITE_INFO } from '../data/menu';
import { formatPrice, computeTotals, getItemPriceLabel } from '../lib/orderUtils';
import { IconClose, IconArrowRight, IconTrash, IconBox, IconTruck, IconLock } from './Icons';

const PAYMENT_METHODS = [
  { id: 'מזומן',    label: 'מזומן' },
  { id: 'ביט',      label: 'ביט' },
  { id: 'פייבוקס', label: 'פייבוקס' },
];

export default function CartDrawer({
  open, onClose,
  cart, onIncrease, onDecrease, onRemove,
  fulfillment, setFulfillment,
  timeSlots, selectedTime, setSelectedTime,
  name, setName, phone, setPhone, address, setAddress,
  notes, setNotes, payment, setPayment,
  error, loading, onSubmit,
  recommendations, onOpenItem,
}) {
  const [step, setStep] = useState('cart');

  useEffect(() => { if (open) setStep('cart'); }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && open) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isDelivery = fulfillment === 'delivery';
  const { subtotal, deliveryFee, total, remainingForFree, progressPct } = computeTotals(cart, fulfillment);

  return (
    <div className="cart-overlay" onClick={onClose}>
      <aside
        className="cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="סל ההזמנות"
        onClick={e => e.stopPropagation()}
      >
        <div className="cart-drawer-head">
          {step === 'checkout' ? (
            <button className="cart-back" onClick={() => setStep('cart')}><IconArrowRight size={16} /> חזרה לסל</button>
          ) : (
            <h2>הסל שלי</h2>
          )}
          <button className="modal-close" onClick={onClose} aria-label="סגור סל"><IconClose size={16} /></button>
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            <p>הסל ריק כרגע. בואו נבחר משהו טעים מהתפריט.</p>
            <button className="btn btn-primary" onClick={onClose}>לתפריט</button>
          </div>
        ) : step === 'cart' ? (
          <>
            {isDelivery && (
              <div className="free-delivery-bar">
                {remainingForFree > 0 ? (
                  <p>נשארו עוד <strong>{formatPrice(remainingForFree)}</strong> למשלוח חינם</p>
                ) : (
                  <p>קיבלתם משלוח חינם!</p>
                )}
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}

            <div className="cart-lines">
              {cart.map(line => (
                <div key={line.uid} className="cart-line">
                  <div className="cart-line-info">
                    <span className="cart-line-name">{line.name}</span>
                    {line.addons.length > 0 && (
                      <span className="cart-line-extras">
                        {line.addons.map(a => a.name).join(' · ')}
                      </span>
                    )}
                    <div className="cart-line-qty">
                      <button onClick={() => onDecrease(line.uid)} aria-label="הפחת כמות">−</button>
                      <span>{line.qty}</span>
                      <button onClick={() => onIncrease(line.uid)} aria-label="הוסף כמות">+</button>
                    </div>
                  </div>
                  <div className="cart-line-right">
                    <span className="cart-line-price">{formatPrice(line.unitPrice * line.qty)}</span>
                    <button className="cart-line-del" onClick={() => onRemove(line.uid)} aria-label="הסר מהסל">
                      <IconTrash size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {recommendations.length > 0 && (
              <div className="cart-recs">
                <p className="modal-sub">רוצים גם לשתות?</p>
                <div className="cart-recs-row">
                  {recommendations.map(item => (
                    <button key={item.id} className="rec-chip" onClick={() => onOpenItem(item)}>
                      <span>{item.name}</span>
                      <span className="rec-chip-price">{getItemPriceLabel(item)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="cart-summary">
              <div className="summary-row"><span>סכום ביניים</span><span>{formatPrice(subtotal)}</span></div>
              <div className="summary-row summary-row--total"><span>סה״כ</span><span>{formatPrice(subtotal)}</span></div>
            </div>

            <button className="btn btn-primary btn-block" onClick={() => setStep('checkout')}>
              להמשך ההזמנה
            </button>
          </>
        ) : (
          <div className="checkout-form">
            <p className="modal-sub">איך תרצו לקבל את ההזמנה?</p>
            <div className="fulfillment-toggle">
              <button
                className={fulfillment === 'pickup' ? 'is-on' : ''}
                onClick={() => setFulfillment('pickup')}
              ><IconBox size={16} /> איסוף עצמי</button>
              <button
                className={fulfillment === 'delivery' ? 'is-on' : ''}
                onClick={() => setFulfillment('delivery')}
              ><IconTruck size={16} /> משלוח</button>
            </div>

            <label className="field">
              <span>{isDelivery ? 'שעת משלוח' : 'שעת איסוף'}</span>
              <select value={selectedTime} onChange={e => setSelectedTime(e.target.value)}>
                {timeSlots.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>

            <label className="field">
              <span>שם מלא</span>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="לדוגמה: נועה כהן" />
            </label>

            <label className="field">
              <span>טלפון נייד</span>
              <input type="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-1234567" />
            </label>

            {isDelivery && (
              <label className="field">
                <span>כתובת למשלוח</span>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="רחוב, מספר בית, קומה" />
                <small>{SITE_INFO.deliveryRadius}</small>
              </label>
            )}

            <label className="field">
              <span>הערות להזמנה (לא חובה)</span>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="לדוגמה: בלי בצל, תודה!" rows={2} />
            </label>

            <p className="modal-sub">אמצעי תשלום</p>
            <div className="payment-grid">
              {PAYMENT_METHODS.map(p => (
                <button
                  key={p.id}
                  className={`payment-btn ${payment === p.id ? 'payment-btn--on' : ''}`}
                  onClick={() => setPayment(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="demo-note">
              <IconLock size={13} /> אתר בדמו: לא מתבצע חיוב אונליין. התשלום בפועל מתבצע מול המזנון בעת {isDelivery ? 'המשלוח' : 'האיסוף'}.
            </p>

            <div className="cart-summary cart-summary--checkout">
              <div className="summary-row"><span>סכום ביניים</span><span>{formatPrice(subtotal)}</span></div>
              <div className="summary-row">
                <span>{isDelivery ? 'משלוח' : 'איסוף עצמי'}</span>
                <span>{isDelivery ? (deliveryFee === 0 ? 'חינם' : formatPrice(deliveryFee)) : 'ללא עלות'}</span>
              </div>
              <div className="summary-row summary-row--total"><span>סה״כ לתשלום</span><span>{formatPrice(total)}</span></div>
            </div>

            {error && <p className="err" role="alert">{error}</p>}

            <button className="btn btn-primary btn-block" onClick={onSubmit} disabled={loading}>
              {loading ? <span className="spin" /> : `שליחת הזמנה · ${formatPrice(total)}`}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

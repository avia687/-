import { SITE_INFO } from '../data/menu';

export function formatPrice(n) {
  return `${n % 1 === 0 ? n : n.toFixed(1)}₪`;
}

export function getItemPriceLabel(item) {
  if (Array.isArray(item.sizes) && item.sizes.length > 0) {
    const min = Math.min(...item.sizes.map(s => s.price));
    return `מ-${formatPrice(min)}`;
  }
  return formatPrice(item.price);
}

export function getItemMinPrice(item) {
  if (Array.isArray(item.sizes) && item.sizes.length > 0) {
    return Math.min(...item.sizes.map(s => s.price));
  }
  return item.price;
}

// JS getDay(): 0=ראשון … 6=שבת
const DAY_HOURS = {
  0: SITE_INFO.hours[0],
  1: SITE_INFO.hours[0],
  2: SITE_INFO.hours[0],
  3: SITE_INFO.hours[0],
  4: SITE_INFO.hours[0],
  5: SITE_INFO.hours[1],
  6: SITE_INFO.hours[2],
};

export function getOpenStatus(now = new Date()) {
  const today = DAY_HOURS[now.getDay()];
  if (!today || !today.open) {
    return { isOpen: false, text: 'סגור היום', today };
  }
  const [oh, om] = today.open.split(':').map(Number);
  const [ch, cm] = today.close.split(':').map(Number);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  const isOpen = minutesNow >= openMin && minutesNow < closeMin;
  if (isOpen) {
    return { isOpen: true, text: `פתוח עכשיו · עד ${today.close}`, today };
  }
  if (minutesNow < openMin) {
    return { isOpen: false, text: `נפתח היום ב-${today.open}`, today };
  }
  return { isOpen: false, text: 'סגור כעת', today };
}

export function generateTimeSlots(count = 8, stepMinutes = 10) {
  const slots = [];
  const now = new Date();
  let base = new Date(now.getTime() + SITE_INFO.prepTimeMinutes * 60000);
  base.setMinutes(Math.ceil(base.getMinutes() / stepMinutes) * stepMinutes, 0, 0);

  slots.push({ value: 'asap', label: `בהקדם האפשרי (כ-${SITE_INFO.prepTimeMinutes} דק׳)` });
  for (let i = 0; i < count; i++) {
    const t = new Date(base.getTime() + i * stepMinutes * 60000);
    const label = t.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    slots.push({ value: label, label });
  }
  return slots;
}

export function computeTotals(cart, fulfillment) {
  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const isDelivery = fulfillment === 'delivery';
  const deliveryFee = isDelivery && subtotal < SITE_INFO.freeDeliveryThreshold ? SITE_INFO.deliveryFee : 0;
  return {
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    remainingForFree: Math.max(0, SITE_INFO.freeDeliveryThreshold - subtotal),
    progressPct: Math.min(100, (subtotal / SITE_INFO.freeDeliveryThreshold) * 100),
  };
}

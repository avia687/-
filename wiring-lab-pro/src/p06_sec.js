/* =====================================================================
   p06 · Sec – אבטחה: ולידציה, JSON בטוח, סכמות, הצפנה (Web Crypto)
   · כל טקסט של משתמש מוצג דרך esc() (בסיס) או textContent – אין מקום אחר.
   · JSON מבחוץ: מגבלת גודל, דחיית __proto__/constructor/prototype, סכמה מלאה.
   · Vault: AES-GCM 256 עם מפתח מ-PBKDF2-SHA256 (250,000 איטרציות, salt אקראי).
     ה-PIN לא נשמר בשום מקום – רק salt, iv וטקסט מוצפן.
   · StyleFix: במקום style="" (חסום ב-CSP) – data-sw (רוחב %) ו-data-sc (צבע),
     שמוחלים דרך CSSOM אחרי בדיקת ערך.
   ===================================================================== */
const Sec = (() => {
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;
  /** מחרוזת נקייה: בלי תווי בקרה וכיווניות מוסתרים, באורך מוגבל */
  const str = (v, max = 2000) => String(v == null ? '' : v).replace(CTRL, '').slice(0, max);
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const isId = s => typeof s === 'string' && ID_RE.test(s);
  /** מספר בטווח, או null */
  function num(v, min = -Infinity, max = Infinity) {
    const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) && n >= min && n <= max ? n : null;
  }
  const bytes = s => (window.TextEncoder ? new TextEncoder().encode(s).length : s.length * 3);

  class ImportError extends Error {}
  /** JSON מבחוץ: גודל, תחביר ומפתחות אסורים. זורק ImportError עם הודעה בעברית */
  function parseJSON(text, maxBytes = 5 * 1024 * 1024) {
    if (typeof text !== 'string' || !text.trim()) throw new ImportError('הקובץ ריק.');
    const n = bytes(text);
    if (n > maxBytes) throw new ImportError(`הקובץ גדול מדי (${(n / 1048576).toFixed(1)}MB, מותר עד ${(maxBytes / 1048576).toFixed(0)}MB).`);
    let depth = 0;
    try {
      return JSON.parse(text, function (k, v) {
        if (BAD_KEYS.has(k)) throw new ImportError(`מפתח אסור בקובץ: "${k}". הקובץ נדחה.`);
        if (v && typeof v === 'object' && ++depth > 200000) throw new ImportError('הקובץ מכיל יותר מדי אובייקטים.');
        return v;
      });
    } catch (e) {
      if (e instanceof ImportError) throw e;
      throw new ImportError('זה לא JSON תקין: ' + str(e.message, 120));
    }
  }

  /* ---------- סכמה מינימלית ----------
     { t:'obj', p:{ key: schema }, req:[...], extra:false }
     { t:'arr', of: schema, max }  { t:'str', max, re, en:[...] }  { t:'num', min, max, int }  { t:'bool' }
     opt:true – שדה לא חובה. הערכים שעוברים מוחזרים כעותק נקי (בלי שדות לא מוכרים). */
  function check(v, s, path = 'קובץ', errs = []) {
    const at = path;
    if (v === undefined || v === null) { if (!s.opt) errs.push(`${at}: חסר`); return undefined; }
    switch (s.t) {
      case 'obj': {
        if (typeof v !== 'object' || Array.isArray(v)) { errs.push(`${at}: צריך להיות אובייקט`); return undefined; }
        const out = {};
        for (const k of Object.keys(v)) {
          if (BAD_KEYS.has(k)) { errs.push(`${at}: מפתח אסור "${k}"`); continue; }
          if (!own(s.p, k)) { if (s.extra === false) errs.push(`${at}: שדה לא מוכר "${str(k, 40)}"`); continue; }
        }
        for (const k of Object.keys(s.p)) {
          const r = check(v[k], s.p[k], `${at}.${k}`, errs);
          if (r !== undefined) out[k] = r;
        }
        return out;
      }
      case 'arr': {
        if (!Array.isArray(v)) { errs.push(`${at}: צריך להיות רשימה`); return undefined; }
        if (s.max != null && v.length > s.max) { errs.push(`${at}: יותר מ-${s.max} פריטים`); return undefined; }
        return v.map((x, i) => check(x, s.of, `${at}[${i}]`, errs));
      }
      case 'str': {
        if (typeof v !== 'string') { errs.push(`${at}: צריך להיות טקסט`); return undefined; }
        if (s.max != null && v.length > s.max) { errs.push(`${at}: ארוך מ-${s.max} תווים`); return undefined; }
        if (s.re && !s.re.test(v)) { errs.push(`${at}: פורמט לא תקין`); return undefined; }
        if (s.en && !s.en.includes(v)) { errs.push(`${at}: ערך לא מוכר "${str(v, 30)}"`); return undefined; }
        return str(v, s.max || 2000);
      }
      case 'num': {
        if (typeof v !== 'number' || !isFinite(v)) { errs.push(`${at}: צריך להיות מספר`); return undefined; }
        if ((s.min != null && v < s.min) || (s.max != null && v > s.max) || (s.int && !Number.isInteger(v))) { errs.push(`${at}: מחוץ לטווח`); return undefined; }
        return v;
      }
      case 'bool':
        if (typeof v !== 'boolean') { errs.push(`${at}: צריך להיות true/false`); return undefined; }
        return v;
      case 'any': return v;
      default: errs.push(`${at}: סכמה לא מוכרת`); return undefined;
    }
  }
  /** בדיקה מלאה: מחזיר { ok, value, errors } */
  function validate(v, schema, label) {
    const errors = [];
    const value = check(v, schema, label || 'קובץ', errors);
    return { ok: !errors.length, value, errors };
  }

  /* ---------- ולידציה של שדות בטופס ---------- */
  function fieldMsg(inp, msg) {
    inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
    let m = inp.parentElement && inp.parentElement.querySelector('.field-err');
    if (!m && msg && inp.parentElement) { m = document.createElement('span'); m.className = 'field-err'; m.id = (inp.id || 'f') + '-err'; inp.parentElement.appendChild(m); inp.setAttribute('aria-describedby', m.id); }
    if (m) { m.textContent = msg || ''; m.hidden = !msg; }
  }
  function checkField(inp) {
    if (!inp || inp.tagName !== 'INPUT') return true;
    if (inp.type === 'number' || inp.classList.contains('num')) {
      const raw = inp.value.trim();
      if (!raw) { fieldMsg(inp, ''); return true; }
      const lo = inp.min !== '' ? Number(inp.min) : -Infinity, hi = inp.max !== '' ? Number(inp.max) : Infinity;
      const x = parseFloat(raw.replace(',', '.'));
      if (!isFinite(x) || !/^-?\d*[.,]?\d*$/.test(raw)) { fieldMsg(inp, 'מספר בלבד'); return false; }
      if (x < lo || x > hi) { fieldMsg(inp, `טווח מותר: ${isFinite(lo) ? lo : ''}–${isFinite(hi) ? hi : ''}`); return false; }
      fieldMsg(inp, ''); return true;
    }
    if (inp.maxLength > 0 && inp.value.length > inp.maxLength) { fieldMsg(inp, `עד ${inp.maxLength} תווים`); return false; }
    return true;
  }
  document.addEventListener('input', e => { if (e.target && e.target.matches && e.target.matches('input.num, input[type="number"]')) checkField(e.target); }, true);

  /* ---------- StyleFix ---------- */
  const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]+\))$/;
  function applyStyles(root) {
    if (!root || !root.querySelectorAll) return;
    const one = el => {
      if (el.hasAttribute('data-sw')) { const n = num(el.getAttribute('data-sw'), -1e9, 1e9); el.style.width = (n === null ? 0 : Math.max(0, Math.min(100, n))) + '%'; }
      if (el.hasAttribute('data-sc')) { const c = el.getAttribute('data-sc'); if (COLOR_RE.test(c)) el.style.setProperty('--c', c); }
    };
    if (root.nodeType === 1 && (root.hasAttribute('data-sw') || root.hasAttribute('data-sc'))) one(root);
    root.querySelectorAll('[data-sw],[data-sc]').forEach(one);
  }
  if (window.MutationObserver) {
    new MutationObserver(list => {
      for (const r of list) {
        if (r.type === 'attributes') applyStyles(r.target);
        else r.addedNodes.forEach(n => { if (n.nodeType === 1) applyStyles(n); });
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sw', 'data-sc'] });
  }
  applyStyles(document.body);

  return { own, str, isId, num, parseJSON, ImportError, validate, check, checkField, fieldMsg, applyStyles, BAD_KEYS };
})();

/* ---------- Vault: הצפנה מקומית ---------- */
const Vault = (() => {
  const ITER = 250000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ok = () => !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
  const b64 = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  async function derive(secret, salt, iter = ITER) {
    const base = await crypto.subtle.importKey('raw', enc.encode(String(secret).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  /** הצפנה עם מפתח קיים */
  async function sealWith(key, salt, value, iter = ITER) {
    const iv = rnd(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
    return { enc: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  /** הצפנה עם סיסמה (salt חדש) */
  async function seal(secret, value) { const salt = rnd(16); return sealWith(await derive(secret, salt), salt, value); }
  const isSealed = o => !!(o && typeof o === 'object' && o.enc === 'AES-GCM-256' && typeof o.ct === 'string' && typeof o.iv === 'string' && typeof o.salt === 'string');
  /** פענוח. זורק Error('bad-secret') כשהסיסמה שגויה או שהנתונים שונו */
  async function openWith(key, box) {
    try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)))); }
    catch (e) { throw new Error('bad-secret'); }
  }
  async function open(secret, box) {
    if (!isSealed(box)) throw new Error('not-sealed');
    const iter = Number(box.iter);
    if (!(iter >= 100000 && iter <= 5000000)) throw new Error('bad-params');
    return openWith(await derive(secret, unb64(box.salt), iter), box);
  }
  async function sha256(text) { const h = await crypto.subtle.digest('SHA-256', enc.encode(text)); return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join(''); }
  return { ok, ITER, derive, seal, sealWith, open, openWith, isSealed, sha256, rnd, b64, unb64 };
})();

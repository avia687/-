'use strict';
/* =====================================================================
   p06 · Sec – אבטחה: ולידציה, JSON בטוח, סכמות, הצפנה (Web Crypto)
   · כל טקסט של משתמש מוצג דרך esc() (בסיס) או textContent – אין מקום אחר.
   · JSON מבחוץ: מגבלת גודל, דחיית __proto__/constructor/prototype, סכמה מלאה.
   · Vault: AES-GCM 256 עם מפתח מ-PBKDF2-SHA256 (250,000 איטרציות, salt אקראי).
     ה-PIN לא נשמר בשום מקום – רק salt, iv וטקסט מוצפן.
   · StyleFix: במקום data-sx="s26" (חסום ב-CSP) – data-sw (רוחב %) ו-data-sc (צבע),
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

/* =====================================================================
   p06b · Persist – אחסון מקומי בלבד
   · IndexedDB (מסד 'ev-lab'), נפילה ל-localStorage ואז לזיכרון – הכול ב-try/catch.
   · מטמון סינכרוני: הקוד הקיים קורא/כותב מיד, הכתיבה לדיסק נדחית ב-250ms
     ומדווחת במחוון ״נשמר״.
   · נעילת PIN (אופציונלית): כל הנתונים האישיים נשמרים כרשומה אחת מוצפנת
     (AES-GCM, מפתח מ-PBKDF2). ה-PIN לא נשמר; המפתח חי רק בזיכרון.
   · גיבוי: JSON עם גרסת סכמה + SHA-256, אופציה להצפנה בסיסמה, Web Share.
   · שחזור: תצוגה מקדימה של השינויים, מיזוג או החלפה, הגירה אוטומטית מגרסאות קודמות.
   ===================================================================== */
const Persist = (() => {
  const SCHEMA = 2;
  const DBNAME = 'ev-lab', STORE = 'kv', BLOBS = 'blobs';
  /** מרחבים אישיים – מוצפנים כשיש PIN, נכללים בגיבוי ובמחיקה */
  const PERSONAL = ['log', 'vehicles', 'projects', 'reminders', 'quotes', 'cards', 'escalations'];
  /** מרחבים לא רגישים – העדפות והתקדמות (גם הם בגיבוי ובמחיקה) */
  const PLAIN = ['prefs', 'progress', 'consent'];
  const DEFAULTS = { log: [], vehicles: [], projects: [], reminders: [], quotes: [], cards: {}, escalations: [], prefs: {}, progress: {}, consent: {} };
  const LEGACY = { log: 'wiring-lab.log.v1', prefs: 'wiring-lab.pro.v1' };
  const LS_PREFIX = 'ev-lab.kv.';

  let backend = 'mem', db = null;
  const cache = {}; const meta = { lock: null, lastBackup: 0, schema: SCHEMA, created: 0 };
  let key = null, locked = false, dirty = new Set(), timer = null, lastSaved = 0, failed = false;
  const listeners = new Set();
  const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const fresh = ns => clone(DEFAULTS[ns]);

  /* ---------- שכבת גישה ---------- */
  function idbOpen() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('no-idb')); return; }
      let req;
      try { req = indexedDB.open(DBNAME, 1); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); if (!d.objectStoreNames.contains(BLOBS)) d.createObjectStore(BLOBS); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error || new Error('idb-open'));
      req.onblocked = () => rej(new Error('idb-blocked'));
      setTimeout(() => rej(new Error('idb-timeout')), 4000);
    });
  }
  function tx(store, mode, fn) {
    return new Promise((res, rej) => {
      try {
        const t = db.transaction(store, mode), s = t.objectStore(store);
        const r = fn(s);
        t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
        t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
      } catch (e) { rej(e); }
    });
  }
  const mem = {}, memBlobs = {};
  async function rawGet(k) {
    if (backend === 'idb') return tx(STORE, 'readonly', s => s.get(k));
    if (backend === 'ls') { const v = localStorage.getItem(LS_PREFIX + k); return v == null ? undefined : JSON.parse(v); }
    return clone(mem[k]);
  }
  async function rawSetMany(entries) {
    if (backend === 'idb') return tx(STORE, 'readwrite', s => { entries.forEach(([k, v]) => (v === undefined ? s.delete(k) : s.put(v, k))); });
    if (backend === 'ls') { entries.forEach(([k, v]) => (v === undefined ? localStorage.removeItem(LS_PREFIX + k) : localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)))); return; }
    entries.forEach(([k, v]) => { if (v === undefined) delete mem[k]; else mem[k] = clone(v); });
  }
  async function rawClear() {
    if (backend === 'idb') { await tx(STORE, 'readwrite', s => s.clear()); await tx(BLOBS, 'readwrite', s => s.clear()); return; }
    if (backend === 'ls') { Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => localStorage.removeItem(k)); return; }
    Object.keys(mem).forEach(k => delete mem[k]); Object.keys(memBlobs).forEach(k => delete memBlobs[k]);
  }

  /* ---------- אתחול ---------- */
  let readyResolve; const ready = new Promise(r => { readyResolve = r; });
  async function init() {
    try { db = await idbOpen(); backend = 'idb'; }
    catch (e) {
      try { localStorage.setItem(LS_PREFIX + '_t', '1'); localStorage.removeItem(LS_PREFIX + '_t'); backend = 'ls'; } catch (e2) { backend = 'mem'; }
    }
    try {
      const m = await rawGet('meta');
      if (m && typeof m === 'object') Object.assign(meta, { lock: m.lock || null, lastBackup: Number(m.lastBackup) || 0, schema: Number(m.schema) || 1, created: Number(m.created) || 0 });
      if (!meta.created) meta.created = Date.now();
      for (const ns of PLAIN) cache[ns] = sanitizeNs(ns, await rawGet('ns:' + ns));
      if (meta.lock) { locked = true; PERSONAL.forEach(ns => { cache[ns] = fresh(ns); }); }
      else for (const ns of PERSONAL) cache[ns] = sanitizeNs(ns, await rawGet('ns:' + ns));
      await migrateLegacy();
      if (meta.schema !== SCHEMA) { meta.schema = SCHEMA; await rawSetMany([['meta', clone(meta)]]); }
    } catch (e) {
      failed = true;
      PERSONAL.concat(PLAIN).forEach(ns => { if (cache[ns] === undefined) cache[ns] = fresh(ns); });
    }
    readyResolve(); emit();
  }
  /** העברת נתונים מגרסה קודמת (localStorage) – פעם אחת */
  async function migrateLegacy() {
    let moved = false;
    try {
      const lg = localStorage.getItem(LEGACY.log);
      if (lg && !locked) {
        const arr = JSON.parse(lg);
        if (Array.isArray(arr) && !cache.log.length) { cache.log = arr.filter(x => x && Sec.isId(x.id)).map(x => RepairLogSchema.fix(x)).filter(Boolean); dirty.add('log'); }
        localStorage.removeItem(LEGACY.log); moved = true;
      }
      const pr = localStorage.getItem(LEGACY.prefs);
      if (pr) {
        const o = JSON.parse(pr);
        if (o && typeof o === 'object') {
          const { acad, ...rest } = o;
          if (!Object.keys(cache.prefs).length) { cache.prefs = sanitizeNs('prefs', rest); dirty.add('prefs'); }
          if (acad && !cache.progress.acad) { cache.progress = Object.assign({}, cache.progress, { acad }); dirty.add('progress'); }
        }
        localStorage.removeItem(LEGACY.prefs); moved = true;
      }
    } catch (e) { /* אין localStorage */ }
    if (moved) await flush();
  }
  function sanitizeNs(ns, v) {
    const d = DEFAULTS[ns];
    if (Array.isArray(d)) return Array.isArray(v) ? v : fresh(ns);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : fresh(ns);
  }

  /* ---------- קריאה/כתיבה ---------- */
  function get(ns) { if (!(ns in DEFAULTS)) throw new Error('ns ' + ns); if (cache[ns] === undefined) cache[ns] = fresh(ns); return cache[ns]; }
  function set(ns, v) {
    if (!(ns in DEFAULTS)) throw new Error('ns ' + ns);
    if (locked && PERSONAL.includes(ns)) { UI.toast('היומן נעול – הזינו PIN כדי לשמור'); return false; }
    cache[ns] = v; dirty.add(ns); schedule(); return true;
  }
  const touch = ns => set(ns, get(ns));
  function schedule() { clearTimeout(timer); state('saving'); timer = setTimeout(flush, 250); }
  async function flush() {
    clearTimeout(timer); timer = null;
    if (!dirty.size) { state(failed ? 'error' : 'saved'); return true; }
    const ds = [...dirty]; dirty = new Set();
    try {
      const entries = [];
      ds.filter(ns => PLAIN.includes(ns)).forEach(ns => entries.push(['ns:' + ns, clone(cache[ns])]));
      if (ds.some(ns => PERSONAL.includes(ns))) {
        if (meta.lock) {
          if (!key) throw new Error('locked');
          const all = {}; PERSONAL.forEach(ns => { all[ns] = cache[ns]; });
          entries.push(['sealed', await Vault.sealWith(key.k, key.salt, all, meta.lock.iter)]);
        } else ds.filter(ns => PERSONAL.includes(ns)).forEach(ns => entries.push(['ns:' + ns, clone(cache[ns])]));
      }
      entries.push(['meta', clone(meta)]);
      await rawSetMany(entries);
      failed = false; lastSaved = Date.now(); state('saved'); return true;
    } catch (e) {
      ds.forEach(ns => dirty.add(ns)); failed = true; state('error'); return false;
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty.size) flush(); });
  window.addEventListener('pagehide', () => { if (dirty.size) flush(); });

  /* ---------- מחוון ״נשמר״ ---------- */
  let st = 'idle';
  function state(s) { st = s; emit(); }
  function emit() { listeners.forEach(fn => { try { fn(status()); } catch (e) { /* */ } }); }
  function status() { return { state: st, backend, locked, lockOn: !!meta.lock, lastSaved, lastBackup: meta.lastBackup, failed }; }
  const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  /* ---------- נעילת PIN ---------- */
  const PIN_RE = /^\d{4,12}$/;
  async function enableLock(pin) {
    if (!Vault.ok()) throw new Error('no-crypto');
    if (!PIN_RE.test(pin)) throw new Error('bad-pin');
    await flush();
    const salt = Vault.rnd(16), k = await Vault.derive(pin, salt);
    key = { k, salt };
    meta.lock = { v: 1, iter: Vault.ITER, salt: Vault.b64(salt), check: await Vault.sealWith(k, salt, 'ev-lab') };
    const all = {}; PERSONAL.forEach(ns => { all[ns] = cache[ns]; });
    await rawSetMany([['sealed', await Vault.sealWith(k, salt, all)], ['meta', clone(meta)]].concat(PERSONAL.map(ns => ['ns:' + ns, undefined])));
    await sealBlobs(true);
    emit(); return true;
  }
  async function unlock(pin) {
    if (!meta.lock) return true;
    const salt = Vault.unb64(meta.lock.salt), k = await Vault.derive(pin, salt, meta.lock.iter);
    await Vault.openWith(k, meta.lock.check);                   // זורק bad-secret אם שגוי
    const box = await rawGet('sealed');
    const all = box ? await Vault.openWith(k, box) : {};
    PERSONAL.forEach(ns => { cache[ns] = sanitizeNs(ns, all[ns]); });
    key = { k, salt }; locked = false; armIdle(); emit(); return true;
  }
  function lockNow() {
    if (!meta.lock) return;
    if (dirty.size) flush();
    key = null; locked = true; PERSONAL.forEach(ns => { cache[ns] = fresh(ns); }); emit();
  }
  async function disableLock(pin) {
    if (!meta.lock) return true;
    if (locked) await unlock(pin);
    else { const salt = Vault.unb64(meta.lock.salt); await Vault.openWith(await Vault.derive(pin, salt, meta.lock.iter), meta.lock.check); }
    await sealBlobs(false);
    meta.lock = null; key = null;
    await rawSetMany([['sealed', undefined], ['meta', clone(meta)]].concat(PERSONAL.map(ns => ['ns:' + ns, clone(cache[ns])])));
    emit(); return true;
  }
  // נעילה אוטומטית אחרי 15 דקות בלי פעילות
  let idleT = null;
  function armIdle() { clearTimeout(idleT); if (meta.lock && !locked) idleT = setTimeout(lockNow, 15 * 60 * 1000); }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (meta.lock && !locked) armIdle(); }, { passive: true }));

  /* ---------- קבצים (תמונות) ---------- */
  async function putBlob(id, blob) {
    if (!Sec.isId(id)) throw new Error('bad-id');
    if (locked) throw new Error('locked');
    let v = blob;
    if (meta.lock && key) { const buf = await blob.arrayBuffer(); const iv = Vault.rnd(12); v = { iv: Vault.b64(iv), type: blob.type, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key.k, buf) }; }
    if (backend === 'idb') return tx(BLOBS, 'readwrite', s => s.put(v, id));
    if (backend === 'mem' || backend === 'ls') { memBlobs[id] = v; return; }
  }
  async function getBlob(id) {
    let v = backend === 'idb' ? await tx(BLOBS, 'readonly', s => s.get(id)) : memBlobs[id];
    if (!v) return null;
    if (v instanceof Blob) return v;
    if (!key) return null;
    try { return new Blob([await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Vault.unb64(v.iv) }, key.k, v.ct)], { type: v.type }); } catch (e) { return null; }
  }
  async function delBlob(id) { if (backend === 'idb') return tx(BLOBS, 'readwrite', s => s.delete(id)); delete memBlobs[id]; }
  async function blobIds() { if (backend === 'idb') return tx(BLOBS, 'readonly', s => s.getAllKeys()); return Object.keys(memBlobs); }
  async function sealBlobs(on) {
    if (!key) return;
    for (const id of await blobIds()) {
      const v = backend === 'idb' ? await tx(BLOBS, 'readonly', s => s.get(id)) : memBlobs[id];
      if (on && v instanceof Blob) { const iv = Vault.rnd(12); const e = { iv: Vault.b64(iv), type: v.type, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key.k, await v.arrayBuffer()) }; backend === 'idb' ? await tx(BLOBS, 'readwrite', s => s.put(e, id)) : (memBlobs[id] = e); }
      if (!on && v && !(v instanceof Blob)) { const b = await getBlob(id); if (b) backend === 'idb' ? await tx(BLOBS, 'readwrite', s => s.put(b, id)) : (memBlobs[id] = b); }
    }
  }

  /* ---------- גיבוי ---------- */
  function snapshot() { const d = {}; PERSONAL.concat(PLAIN).forEach(ns => { d[ns] = clone(get(ns)); }); return d; }
  async function backup(password) {
    if (locked) throw new Error('locked');
    await flush();
    const data = snapshot();
    const checksum = 'sha256:' + await Vault.sha256(JSON.stringify(data));
    const head = { app: 'ev-lab', type: 'backup', schema: SCHEMA, created: new Date().toISOString() };
    const file = password ? Object.assign(head, { encrypted: await Vault.seal(password, { checksum, data }) }) : Object.assign(head, { checksum, data });
    return JSON.stringify(file, null, 1);
  }
  function markBackedUp() { meta.lastBackup = Date.now(); rawSetMany([['meta', clone(meta)]]).catch(() => {}); emit(); }
  const needsBackup = () => {
    const has = PERSONAL.some(ns => { const v = cache[ns]; return Array.isArray(v) ? v.length : v && Object.keys(v).length; });
    return has && !locked && Date.now() - (meta.lastBackup || meta.created || Date.now()) > 14 * 864e5;
  };

  /* ---------- שחזור ---------- */
  const RepairLogSchema = { fix: x => (typeof RepairLog !== 'undefined' ? RepairLog.normalize(x) : x) };
  const OBJ = { t: 'any' };
  const LIST = { t: 'arr', max: 20000, of: { t: 'obj', extra: true, p: { id: { t: 'str', re: /^[A-Za-z0-9_-]{1,40}$/ } } } };
  const DATA_SCHEMA = () => ({ t: 'obj', p: {
    log: { t: 'arr', max: 20000, opt: true, of: RepairLog.ITEM }, vehicles: Object.assign({ opt: true }, LIST), projects: Object.assign({ opt: true }, LIST),
    reminders: Object.assign({ opt: true }, LIST), quotes: Object.assign({ opt: true }, LIST), escalations: Object.assign({ opt: true }, LIST),
    cards: { t: 'obj', opt: true, extra: true, p: {} }, prefs: { t: 'obj', opt: true, extra: true, p: {} }, progress: { t: 'obj', opt: true, extra: true, p: {} }, consent: { t: 'obj', opt: true, extra: true, p: {} }
  } });
  /** הגירה: כל גרסה קודמת → סכמה 2 */
  function migrate(obj) {
    const notes = [];
    if (Array.isArray(obj)) { notes.push('קובץ ישן (רשימת רשומות) – הומר ליומן'); return { data: { log: obj }, notes, schema: 0 }; }
    if (obj && obj.type === 'repair-log') { notes.push(`יומן תיקונים מגרסה ${Sec.num(obj.version) || 1} – הומר לגיבוי מלא`); return { data: { log: obj.items || [] }, notes, schema: 1 }; }
    if (obj && obj.type === 'backup' && obj.app === 'ev-lab') {
      const s = Sec.num(obj.schema, 1, 99);
      if (s > SCHEMA) throw new Sec.ImportError(`הגיבוי נוצר בגרסה חדשה יותר (סכמה ${s}). עדכנו את האפליקציה ונסו שוב.`);
      return { data: obj.data || {}, notes, schema: s };
    }
    throw new Sec.ImportError('זה לא קובץ גיבוי של מעבדת EV.');
  }
  /** קורא קובץ גיבוי: מחזיר { data, notes } או זורק ImportError. password – אם הקובץ מוצפן */
  async function readBackup(text, password) {
    let obj = Sec.parseJSON(text, 25 * 1024 * 1024);
    if (obj && obj.encrypted) {
      if (!password) { const e = new Sec.ImportError('הגיבוי מוצפן – הזינו סיסמה.'); e.needPassword = true; throw e; }
      let inner; try { inner = await Vault.open(password, obj.encrypted); } catch (e) { throw new Sec.ImportError('סיסמה שגויה, או שהקובץ שונה.'); }
      Sec.parseJSON(JSON.stringify(inner));                       // אותה בדיקת מפתחות אסורים
      obj = Object.assign({}, obj, { checksum: inner.checksum, data: inner.data }); delete obj.encrypted;
    }
    const mg = migrate(obj);
    if (obj && obj.type === 'backup') {
      const sum = 'sha256:' + await Vault.sha256(JSON.stringify(obj.data));
      if (obj.checksum !== sum) throw new Sec.ImportError('בדיקת השלמות (checksum) נכשלה – הקובץ נפגם או נערך ידנית.');
    }
    const r = Sec.validate(mg.data, DATA_SCHEMA(), 'גיבוי');
    if (!r.ok) { const e = new Sec.ImportError('הגיבוי לא עבר בדיקה:\n' + r.errors.slice(0, 8).join('\n')); e.errors = r.errors; throw e; }
    const data = r.value;
    if (data.log) data.log = data.log.map(x => RepairLog.normalize(x));
    return { data, notes: mg.notes, schema: mg.schema };
  }
  const NAMES = { log: 'יומן תיקונים', vehicles: 'כרטיסי כלי', projects: 'פרויקטי בנייה', reminders: 'תזכורות תחזוקה', quotes: 'הצעות מחיר', escalations: 'פניות ״לא מצאתי״', cards: 'כרטיסיות חזרה', prefs: 'העדפות', progress: 'התקדמות באקדמיה', consent: 'הסכמות' };
  /** תצוגה מקדימה: לכל מרחב – חדש / שונה / זהה / יימחק (בהחלפה) */
  function preview(data) {
    const rows = [];
    for (const ns of PERSONAL.concat(PLAIN)) {
      if (!(ns in data)) continue;
      const inc = data[ns], cur = get(ns);
      if (Array.isArray(inc)) {
        const byId = new Map(cur.map(x => [x.id, x]));
        let add = 0, chg = 0, same = 0;
        inc.forEach(x => { const c = byId.get(x.id); if (!c) add++; else if (JSON.stringify(c) === JSON.stringify(x)) same++; else chg++; });
        const incIds = new Set(inc.map(x => x.id));
        rows.push({ ns, name: NAMES[ns], add, chg, same, gone: cur.filter(x => !incIds.has(x.id)).length, total: inc.length });
      } else {
        const keys = Object.keys(inc || {});
        const chg = keys.filter(k => JSON.stringify(cur[k]) !== JSON.stringify(inc[k])).length;
        rows.push({ ns, name: NAMES[ns], add: keys.filter(k => !(k in cur)).length, chg, same: keys.length - chg, gone: Object.keys(cur).filter(k => !(k in inc)).length, total: keys.length, obj: true });
      }
    }
    return rows;
  }
  function apply(data, mode) {
    if (locked) throw new Error('locked');
    for (const ns of PERSONAL.concat(PLAIN)) {
      if (!(ns in data)) continue;
      const inc = clone(data[ns]);
      if (mode === 'replace') cache[ns] = inc;
      else if (Array.isArray(inc)) {
        const cur = get(ns), idx = new Map(cur.map((x, i) => [x.id, i]));
        inc.forEach(x => { if (!idx.has(x.id)) cur.push(x); else if ((x.updated || '') > (cur[idx.get(x.id)].updated || '')) cur[idx.get(x.id)] = x; });
      } else cache[ns] = Object.assign({}, get(ns), inc);
      dirty.add(ns);
    }
    return flush();
  }

  /* ---------- פרטיות: ייצוא הכול ומחיקה ---------- */
  async function wipe() {
    clearTimeout(timer); dirty = new Set(); key = null; locked = false; meta.lock = null; meta.lastBackup = 0; meta.created = Date.now();
    try { await rawClear(); } catch (e) { /* */ }
    try {
      Object.keys(localStorage).filter(k => /^(wiring-lab|ev-lab)/.test(k)).forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch (e) { /* */ }
    try { if (window.caches) for (const k of await caches.keys()) if (/^ev-lab-user/.test(k)) await caches.delete(k); } catch (e) { /* */ }
    PERSONAL.concat(PLAIN).forEach(ns => { cache[ns] = fresh(ns); });
    emit();
  }
  async function estimate() { try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; } }
  async function persistRequest() { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; } }

  return { init, ready, get, set, touch, flush, status, onChange, enableLock, unlock, lockNow, disableLock, putBlob, getBlob, delBlob, blobIds,
    backup, markBackedUp, needsBackup, readBackup, preview, apply, wipe, estimate, persistRequest, snapshot, PERSONAL, PLAIN, NAMES, SCHEMA,
    isLocked: () => locked, lockOn: () => !!meta.lock, backend: () => backend, PIN_RE };
})();

/* =====================================================================
   p07 · Core Pro – רמות משתמש, מילון מונחים, אמינות נתונים, מצב סדנה
   נשען על: DATA, State, M(), LAYOUT(), vehicleComps(), harness(), UI, Scene
   ===================================================================== */
const IN_FRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

/** אחסון העדפות Pro (נפרד מ-Store הקיים), עטוף ב-try/catch */
const ProStore = {
  // העדפות ב-Persist('prefs'), התקדמות האקדמיה ב-Persist('progress') – IndexedDB
  get(k, d) {
    const o = k === 'acad' ? Persist.get('progress') : Persist.get('prefs');
    const v = Sec.own(o, k) ? o[k] : undefined; return v === undefined ? d : v;
  },
  set(k, v) {
    const ns = k === 'acad' ? 'progress' : 'prefs';
    Persist.set(ns, Object.assign({}, Persist.get(ns), { [k]: v }));
  }
};

/** שורת הסוללה של הדגם הנוכחי ותבניות {V} {full} {empty} כולל חשבון ({full+0.5}) */
const BR = () => battRow(M().voltage);
function tplM(s) {
  if (s == null) return '';
  const b = BR();
  return String(s).replace(/\{(V|full|empty)([+-]\d+(?:\.\d+)?)?\}/g, (_, k, d) => {
    const base = k === 'V' ? b.nominal : k === 'full' ? b.full : b.empty;
    const v = base + (d ? Number(d) : 0);
    return k === 'V' && !d ? String(v) : (Math.round(v * 10) / 10).toFixed(1);
  });
}
const TM = s => bidi(esc(tplM(s)));
function numT(x) { if (typeof x === 'number') return x; const n = Number(tplM(x)); return isFinite(n) ? n : null; }

/* ---------- אמינות נתונים ---------- */
const Conf = (() => {
  const LABEL_KEYS = { 'יצרן': 'brand', 'סוג': 'kind', 'סוללה': 'battery', 'מנוע': 'motor', 'בקר': 'controller', 'צמיגים': 'tires', 'בלמים': 'brakes', 'שיכוך': 'suspension', 'משקל': 'weight', 'טווח': 'range', 'מהירות': 'speed', 'טעינה': 'charging', 'צג': 'display', 'תאורה': 'lights', 'תוספות': 'extras' };
  const L = c => DATA.pro.confLegend[c] || DATA.pro.confLegend.unk;
  function badge(c) {
    const l = L(c);
    return `<span class="conf conf-${c}" role="img" title="${esc(l.name + ' – ' + l.desc)}" aria-label="אמינות: ${esc(l.name)}">${l.icon}</span>`;
  }
  function badgeFor(m, label) {
    const k = LABEL_KEYS[label], c = k && m.dataConfidence && m.dataConfidence[k];
    return c ? badge(c) : '';
  }
  function legendHTML() {
    return `<div class="conf-legend" role="note" aria-label="מקרא אמינות נתונים">${['ok', 'typ', 'unk'].map(c =>
      `<span>${badge(c)} <b>${esc(L(c).name)}</b> <small>${esc(L(c).desc)}</small></span>`).join('')}</div>`;
  }
  function modelExtraHTML(m) {
    const flags = m.specFlags || [];
    return `${flags.length ? `<div class="note warn">${ICON.warn}<span><b>נתונים שדורשים אימות:</b><br>${flags.map(f => `${badge(f.sev || 'typ')} <b>${esc(f.field)}:</b> ${T(f.issue)}`).join('<br>')}</span></div>` : ''}
      <details class="concept"><summary>מה המשמעות של ✅ ⚠️ ❓?</summary><div class="body">${legendHTML()}</div></details>`;
  }
  return { badge, badgeFor, legendHTML, modelExtraHTML };
})();

/* ---------- רמת משתמש: מתחיל / מקצוען + מצב מהיר + מצב סדנה ---------- */
const Level = (() => {
  const get = () => (ProStore.get('level', 'beg') === 'pro' ? 'pro' : 'beg');
  const isBeg = () => get() === 'beg';
  const quick = () => !isBeg() && !!ProStore.get('quick', false);
  const workshop = () => !!ProStore.get('workshop', false);
  function apply() {
    const b = document.body;
    b.classList.toggle('lvl-beg', isBeg());
    b.classList.toggle('lvl-pro', !isBeg());
    b.classList.toggle('quick', quick());
    b.classList.toggle('workshop', workshop());
    $$('#levelSeg [data-level]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.level === get())));
    const q = $('#quickBtn'); if (q) { q.hidden = isBeg(); q.setAttribute('aria-pressed', String(quick())); }
    const w = $('#workshopBtn'); if (w) w.setAttribute('aria-pressed', String(workshop()));
  }
  function rerender() {
    const sel = State.selected;
    if (sel && !$('#compView').hidden) UI.showComp(sel);
    else UI.setMode(State.mode, true);
  }
  function set(l) { ProStore.set('level', l === 'pro' ? 'pro' : 'beg'); apply(); rerender(); UI.toast(l === 'pro' ? 'מצב מקצוען: ערכים, טבלאות וקיצורים' : 'מצב מתחיל: הסברים פשוטים ומילון מונחים'); }
  function setQuick(on) { ProStore.set('quick', !!on); apply(); UI.toast(on ? 'מצב מהיר: בלי הסברים' : 'הסברים מוצגים'); }
  function setWorkshop(on) { ProStore.set('workshop', !!on); apply(); Scene.resize(); UI.toast(on ? 'מצב סדנה: טקסט וכפתורים גדולים' : 'מצב סדנה כבוי'); }
  function init() {
    const seg = $('#levelSeg');
    if (seg) seg.addEventListener('click', e => { const b = e.target.closest('[data-level]'); if (b && b.dataset.level !== get()) set(b.dataset.level); });
    const q = $('#quickBtn'); if (q) q.addEventListener('click', () => setQuick(!quick()));
    const w = $('#workshopBtn'); if (w) w.addEventListener('click', () => setWorkshop(!workshop()));
    apply();
  }
  return { get, isBeg, quick, workshop, apply, set, setWorkshop, init };
})();

/* ---------- מילון מונחים + tooltip אוטומטי במצב מתחיל ---------- */
const Glossary = (() => {
  let re = null, map = null, observer = null, pending = false, tipFor = null;
  const SKIP = 'button,a,script,style,input,select,textarea,label,.term,.lcd,.code,.gtip,summary,[data-noterm],.mode,.pins,.conn-tag,.brand-chip';
  function build() {
    if (re) return;
    map = new Map();
    const terms = [];
    DATA.pro.glossary.forEach(g => g.t.forEach(t => { terms.push(t); map.set(t.toLowerCase(), g); }));
    terms.sort((a, b) => b.length - a.length);
    const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { re = new RegExp('(^|[^\\p{L}\\p{N}])([והבלמשכ]{0,2})(' + terms.map(escRe).join('|') + ')(?![\\p{L}\\p{N}])', 'giu'); }
    catch (e) { re = null; }
  }
  function decorate(root) {
    if (!root || !re || !Level.isBeg()) return;
    const used = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || n.nodeValue.trim().length < 2) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    let count = 0;
    for (const node of nodes) {
      if (count > 40) break;
      const text = node.nodeValue;
      re.lastIndex = 0;
      let m, last = 0, frag = null;
      while ((m = re.exec(text))) {
        const term = m[3], g = map.get(term.toLowerCase());
        if (!g || used.has(g.id)) continue;
        used.add(g.id); count++;
        const start = m.index + m[1].length + m[2].length;
        frag = frag || document.createDocumentFragment();
        frag.appendChild(document.createTextNode(text.slice(last, start)));
        const sp = document.createElement('span');
        sp.className = 'term'; sp.tabIndex = 0; sp.dataset.g = g.id; sp.setAttribute('role', 'button');
        sp.setAttribute('aria-label', term + ' – הסבר');
        sp.textContent = term;
        frag.appendChild(sp);
        last = start + term.length;
      }
      if (frag) { frag.appendChild(document.createTextNode(text.slice(last))); node.parentNode.replaceChild(frag, node); }
    }
  }
  function run() {
    pending = false;
    if (!Level.isBeg()) return;
    if (observer) observer.disconnect();
    decorate($('#modeView')); decorate($('#compView'));
    if (observer) observer.observe($('#panelScroll'), { childList: true, subtree: true });
  }
  function schedule() { if (pending) return; pending = true; requestAnimationFrame(run); }
  function showTip(el) {
    const g = DATA.pro.glossary.find(x => x.id === el.dataset.g); if (!g) return;
    const tip = $('#gtip');
    tip.innerHTML = `<b>${esc(g.t[0])}</b><p>${esc(g.beg)}</p>`;
    tip.hidden = false;
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    let top = r.bottom + 8; if (top + h > window.innerHeight - 8) top = r.top - h - 8;
    const left = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8);
    tip.style.top = Math.max(8, top) + 'px'; tip.style.left = left + 'px';
    tipFor = el; el.setAttribute('aria-describedby', 'gtip');
  }
  function hideTip() { const t = $('#gtip'); if (t) t.hidden = true; if (tipFor) tipFor.removeAttribute('aria-describedby'); tipFor = null; }
  function html() {
    const q = ProStore.get('gq', '');
    return `<p class="lead">מונחים מהמעבדה בשפה פשוטה. במצב ״מתחיל״ המונחים מסומנים בקו מקווקו בכל הפאנל – נגיעה או ריחוף פותחים הסבר.</p>
      <div class="field"><label for="glossQ">חיפוש מונח</label><input class="input" id="glossQ" type="search" value="${esc(q)}" placeholder="למשל BMS, פאזה, Sag" autocomplete="off"></div>
      <div class="stack" id="glossList"></div>`;
  }
  function renderList() {
    const q = ($('#glossQ').value || '').trim().toLowerCase();
    const list = DATA.pro.glossary.filter(g => !q || g.t.some(t => t.toLowerCase().includes(q)) || g.beg.toLowerCase().includes(q));
    $('#glossList').innerHTML = list.length ? list.map(g => `<div class="card gl-row" data-noterm><b>${esc(g.t.join(' · '))}</b><p>${esc(g.beg)}</p></div>`).join('') : '<p class="lead">לא נמצא מונח.</p>';
  }
  function bind() { const i = $('#glossQ'); i.addEventListener('input', () => { ProStore.set('gq', i.value); renderList(); }); renderList(); }
  function init() {
    build();
    if (window.MutationObserver) { observer = new MutationObserver(schedule); observer.observe($('#panelScroll'), { childList: true, subtree: true }); }
    document.addEventListener('mouseover', e => { const t = e.target.closest && e.target.closest('.term'); if (t) showTip(t); });
    document.addEventListener('mouseout', e => { const t = e.target.closest && e.target.closest('.term'); if (t && !t.contains(e.relatedTarget)) hideTip(); });
    document.addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('term')) showTip(e.target); });
    document.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('term')) hideTip(); });
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('.term');
      if (t) { e.stopPropagation(); if (tipFor === t) hideTip(); else showTip(t); return; }
      if (tipFor) hideTip();
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && tipFor) hideTip();
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('term')) { e.preventDefault(); showTip(e.target); }
    });
    $('#panelScroll').addEventListener('scroll', hideTip, { passive: true });
    schedule();
  }
  return { init, html, bind, schedule, decorate };
})();

/* ---------- תוספות לפאנל רכיב ---------- */
const ProUI = (() => {
  function tpRows(list) {
    return `<ul class="clean tp-mini">${list.map(tp => `<li>
      <button type="button" class="linkbtn" data-action="tp-go" data-tp="${tp.id}">${esc(tp.name)}</button>
      <span class="tp-exp num">${TM(tp.expect)}</span>${Conf.badge(tp.conf)}</li>`).join('')}</ul>`;
  }
  function compExtra(id) {
    const an = DATA.pro.analogies[id];
    const tps = (M().testPoints || []).filter(tp => tp.comp === id);
    const cf = (M().commonFailures || []).filter(f => { const c = DATA.pro.causes.find(x => x.id === f.cause); return c && c.comps.includes(id); });
    return `${an ? `<div class="note info beg-only">💡<span><b>במילים פשוטות:</b> ${esc(an)}</span></div>` : ''}
      ${tps.length ? `<div class="card stack"><div class="spread"><h3>נקודות בדיקה ברכיב</h3><button type="button" class="btn sm ghost" data-action="tp-all">כל הנקודות</button></div>${tpRows(tps)}</div>` : ''}
      ${cf.length ? `<div class="card stack"><h3>תקלות נפוצות בדגם הזה</h3><ul class="clean">${cf.map(f => `<li class="cf-row"><span>${esc(f.t)}</span><span class="cf-w" aria-label="משקל ${Math.round(f.w * 100)}%"><i data-sw="${Math.round(f.w * 100)}"></i></span></li>`).join('')}</ul><p class="foot">המשקל משפיע על ההסתברות ההתחלתית במנוע האבחון.</p></div>` : ''}`;
  }
  return { compExtra, tpRows };
})();

/* ---------- יומן תיקונים (משותף לאבחון ולכלים) ---------- */
const RepairLog = (() => {
  // נשמר ב-Persist('log') – IndexedDB, מוצפן כשיש PIN
  let items = [];
  function load() { items = Persist.get('log'); return items; }
  function save() { return Persist.set('log', items); }
  function add(rec) {
    load();
    const r = Object.assign({ id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), updated: new Date().toISOString(), date: new Date().toISOString().slice(0, 10), model: State.model, modelName: M().name, customer: '', serial: '', symptoms: '', measurements: '', replaced: '', notes: '', status: 'פתוח' }, rec || {});
    items.unshift(r); save();
    return r;
  }
  function update(id, patch) { load(); const r = items.find(x => x.id === id); if (r) { Object.assign(r, patch, { updated: new Date().toISOString() }); save(); } return r; }
  function remove(id) { load(); items = items.filter(x => x.id !== id); save(); }
  function all() { return load(); }
  const S = (max, o) => Object.assign({ t: 'str', max, opt: true }, o);
  /** סכמת רשומה – כל ייבוא עובר דרכה */
  const ITEM = { t: 'obj', p: {
    id: { t: 'str', re: /^[A-Za-z0-9_-]{1,40}$/ }, date: S(10, { re: /^(\d{4}-\d{2}-\d{2})?$/ }), model: S(40, { re: /^[A-Za-z0-9_-]*$/ }), modelName: S(120),
    customer: S(120), phone: S(30, { re: /^[0-9+()\- ]*$/ }), anon: { t: 'bool', opt: true }, serial: S(60), symptoms: S(2000), measurements: S(4000),
    replaced: S(1000), notes: S(4000), status: S(30), vehicleId: S(40, { re: /^[A-Za-z0-9_-]*$/ }), km: { t: 'num', min: 0, max: 1e6, opt: true },
    price: { t: 'num', min: 0, max: 1e7, opt: true }, photos: { t: 'arr', max: 20, opt: true, of: { t: 'str', re: /^[A-Za-z0-9_-]{1,40}$/ } },
    updated: S(30)
  } };
  const FILE = { t: 'obj', p: { app: S(40), type: S(40), version: { t: 'num', min: 1, max: 99, opt: true }, exported: S(40), items: { t: 'arr', max: 20000, of: ITEM } } };
  const MAX_BYTES = 5 * 1024 * 1024;
  /** ייבוא: גודל → JSON בטוח → סכמה. מחזיר { ok, items, errors } */
  function parseImport(text) {
    let obj;
    try { obj = Sec.parseJSON(text, MAX_BYTES); } catch (e) { return { ok: false, errors: [e.message] }; }
    if (Array.isArray(obj)) obj = { items: obj };
    const r = Sec.validate(obj, FILE, 'קובץ');
    if (!r.ok) return { ok: false, errors: r.errors };
    return { ok: true, items: r.value.items, errors: [] };
  }
  function normalize(x) {
    return {
      id: x.id, date: x.date || '', model: Sec.own(DATA.models, x.model) ? x.model : '', modelName: x.modelName || '',
      customer: x.customer || '', phone: x.phone || '', anon: !!x.anon, serial: x.serial || '', symptoms: x.symptoms || '', measurements: x.measurements || '',
      replaced: x.replaced || '', notes: x.notes || '', status: x.status || 'פתוח', vehicleId: x.vehicleId || '', km: x.km, price: x.price, photos: x.photos || [], updated: x.updated || ''
    };
  }
  function replaceAll(list, merge) {
    load();
    const clean = list.filter(x => x && Sec.isId(x.id)).map(normalize);
    if (merge) { const ids = new Set(items.map(x => x.id)); clean.forEach(x => { if (!ids.has(x.id)) items.push(x); }); }
    else items = clean;
    save(); return clean.length;
  }
  return { add, update, remove, all, replaceAll, parseImport, normalize, ITEM, MAX_BYTES };
})();

/** העתקה ללוח עם נפילה לבחירת טקסט */
function copyText(text, fallbackEl) {
  const done = () => UI.toast('הועתק ללוח');
  const fail = () => { if (fallbackEl) { fallbackEl.hidden = false; fallbackEl.value = text; fallbackEl.focus(); fallbackEl.select(); } UI.toast('בחרו והעתיקו ידנית'); };
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail); else fail(); } catch (e) { fail(); }
}
/** הורדת קובץ: בדפדפן רגיל – הורדה; בתוך מסגרת מוטמעת – תיבת טקסט להעתקה */
function offerFile(name, text, fallbackEl) {
  if (!IN_FRAME) {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
      a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      UI.toast('הקובץ ירד: ' + name); return;
    } catch (e) { /* נופלים להעתקה */ }
  }
  copyText(text, fallbackEl);
}

/* =====================================================================
   p08 · DiagEngine – מנוע הסתברות (Bayes פשוט) לאבחון מבוסס מדידות
   כל סיבה: משקל התחלתי × משקל דגם. כל ראיה (סימפטום, מדידה, תנאי,
   Wiggle) מכפילה בסבירות P(ראיה | סיבה). מסננים לפי vehicleComps()
   כך ש-omit מסתיר סיבות ומדידות של רכיבים שאין בדגם.
   ===================================================================== */
const DiagEngine = (() => {
  const P = () => DATA.pro;
  const has = id => vehicleComps().includes(id);
  const NORMAL = { m_batt: 'ok', m_ctrl_in: 'same', m_disp: 'ok', m_5v: 'ok', m_thr_rest: 'ok', m_thr_full: 'ok', m_hall: 'all', m_phase_r: 'equal', m_brake: 'works', m_pas: 'pulses', m_sag: 'ok', m_charger: 'ok', m_wiggle: 'none', m_hot: 'none', m_link: 'ok', m_alarm: 'unlocked', m_settings: 'ok' };

  const causeOK = c => (!c.requires || c.requires.some(has)) && c.comps.some(has);
  const measOK = m => (!m.requires || m.requires.every(has)) && (m.comp === 'frame' || has(m.comp)) && !(m.id === 'm_charger' && M().builtInCharger);
  function causes() { return P().causes.filter(causeOK); }
  function measurements() { return P().measurements.filter(measOK); }
  function symptoms() { return P().bayesSymptoms.filter(s => !s.requires || s.requires.every(has)); }
  function measById(id) { return P().measurements.find(m => m.id === id); }
  function causeById(id) { return P().causes.find(c => c.id === id); }
  function compOf(c) { return c.comps.find(has) || c.comps[0]; }
  function prior(c) { const w = (M().failureWeights || {})[c.id]; return c.prior * (w || 1); }

  function likMeas(m, o, cid) {
    const outs = Object.keys(m.outcomes), t = m.lik[cid];
    if (t) {
      if (t[o] != null) return Math.max(0.01, t[o]);
      const spec = Object.values(t).reduce((a, b) => a + b, 0), rest = outs.filter(x => t[x] == null).length;
      return Math.max(0.01, (1 - spec) / Math.max(1, rest));
    }
    const normal = NORMAL[m.id] || outs[0];
    return o === normal ? 0.9 : 0.1 / Math.max(1, outs.length - 1);
  }
  function symLik(s, cid) { const t = P().symptomLik[s]; return t && t[cid] != null ? t[cid] : P().defaultSymptomLik; }
  function interLik(ic, cid) { const x = P().interConditions.find(i => i.id === ic); return x && x.lik[cid] != null ? x.lik[cid] : 0.15; }
  function wigFactor(c, bid) {
    const b = bundleById(bid); if (!b) return 1;
    if (c.id === 'loose_harness') return 2.5;
    return (c.wiggle || []).includes(b.circuit) ? 3 : 0.6;
  }

  /** ראיות: { sym:Set, res:{mid:outcome}, inter:Set, wig:{bundleId:'cut'|'ok'} } */
  function logScores(ev, cs, skip) {
    return cs.map(c => {
      let l = Math.log(prior(c));
      ev.sym.forEach(s => { if (skip !== 's:' + s) l += Math.log(symLik(s, c.id)); });
      Object.keys(ev.res).forEach(mid => { const m = measById(mid); if (m && measOK(m) && skip !== 'm:' + mid) l += Math.log(likMeas(m, ev.res[mid], c.id)); });
      ev.inter.forEach(ic => { if (skip !== 'i:' + ic) l += Math.log(interLik(ic, c.id)); });
      Object.keys(ev.wig || {}).forEach(bid => { if (ev.wig[bid] === 'cut' && skip !== 'w:' + bid) l += Math.log(wigFactor(c, bid)); });
      return l;
    });
  }
  function normalize(logs) {
    const mx = Math.max(...logs), ex = logs.map(l => Math.exp(l - mx)), s = ex.reduce((a, b) => a + b, 0) || 1;
    return ex.map(x => x / s);
  }
  function posterior(ev) {
    const cs = causes();
    if (!cs.length) return [];
    const ps = normalize(logScores(ev, cs));
    return cs.map((c, i) => ({ c, p: ps[i] })).sort((a, b) => b.p - a.p);
  }
  const H = ps => -ps.reduce((a, p) => a + (p > 1e-12 ? p * Math.log2(p) : 0), 0);

  /** כמה צפויה המדידה לצמצם את אי-הוודאות (Expected Information Gain, ביטים) */
  function eig(m, post) {
    const outs = Object.keys(m.outcomes), h0 = H(post.map(x => x.p));
    let exp = 0;
    outs.forEach(o => {
      const joint = post.map(x => x.p * likMeas(m, o, x.c.id)), po = joint.reduce((a, b) => a + b, 0);
      if (po <= 0) return;
      exp += po * H(joint.map(j => j / po));
    });
    return Math.max(0, h0 - exp);
  }
  function suggest(ev, post, n = 3) {
    return measurements().filter(m => ev.res[m.id] == null)
      .map(m => ({ m, g: eig(m, post) })).filter(x => x.g > 0.02)
      .sort((a, b) => b.g - a.g).slice(0, n);
  }
  /** אילו ראיות תומכות בסיבה המובילה או מחלישות אותה (השוואה להסתברות בלי הראיה) */
  function evidence(cid, ev) {
    const cs = causes(), i = cs.findIndex(c => c.id === cid);
    if (i < 0) return [];
    const full = normalize(logScores(ev, cs))[i];
    const items = [];
    ev.sym.forEach(s => items.push({ key: 's:' + s, label: 'סימפטום: ' + ((P().bayesSymptoms.find(x => x.id === s) || {}).name || s) }));
    Object.keys(ev.res).forEach(mid => { const m = measById(mid); if (m && measOK(m)) items.push({ key: 'm:' + mid, label: `${m.name}: ${m.outcomes[ev.res[mid]] || ev.res[mid]}` }); });
    ev.inter.forEach(ic => { const x = P().interConditions.find(y => y.id === ic); if (x) items.push({ key: 'i:' + ic, label: 'תנאי: ' + x.name }); });
    Object.keys(ev.wig || {}).forEach(bid => { if (ev.wig[bid] === 'cut') { const b = bundleById(bid); items.push({ key: 'w:' + bid, label: 'Wiggle: ' + (b ? b.label : bid) + ' גורם לניתוק' }); } });
    return items.map(it => {
      const without = normalize(logScores(ev, cs, it.key))[i];
      return Object.assign(it, { delta: full - without });
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  /** סיווג קריאה מספרית לתוצאה, לפי מתחי הדגם */
  function classify(mid, v, vals) {
    const b = BR();
    const num = x => (typeof x === 'number' && isFinite(x));
    switch (mid) {
      case 'm_batt': if (!num(v)) return null; if (v < 1) return 'zero'; if (v < b.empty - 0.3) return 'low'; if (v > b.full + 0.5) return 'high'; return 'ok';
      case 'm_ctrl_in': {
        if (!num(v)) return null; if (v < 1) return 'zero';
        const ref = vals && num(vals.m_batt) ? vals.m_batt : null;
        if (ref != null) return ref - v >= 0.5 ? 'drop' : 'same';
        return v < b.empty - 0.3 ? 'drop' : 'same';
      }
      case 'm_disp': if (!num(v)) return null; return v < 1 ? 'zero' : 'ok';
      case 'm_5v': if (!num(v)) return null; if (v < 0.5) return 'zero'; if (v < 4.6) return 'low'; return 'ok';
      case 'm_thr_rest': if (!num(v)) return null; if (v < 0.3) return 'zero'; if (v > 1.2) return 'high'; return 'ok';
      case 'm_thr_full': if (!num(v)) return null; return v < 3.3 ? 'low' : 'ok';
      case 'm_charger': if (!num(v)) return null; if (v < 1) return 'zero'; if (v < b.full - 1.5) return 'low'; if (v > b.full + 1.5) return 'high'; return 'ok';
      case 'm_phase_r': {
        if (!Array.isArray(v) || v.filter(x => x !== null).length < 3) return null;
        if (v.some(x => !num(x) || x > 5)) return 'open';
        const mn = Math.min(...v), mx = Math.max(...v);
        return (mx - mn > 0.15 && mx / Math.max(mn, 0.01) > 1.6) ? 'uneven' : 'equal';
      }
      case 'm_sag': {
        if (!Array.isArray(v) || !num(v[0]) || !num(v[1]) || v[0] <= 0) return null;
        const d = (v[0] - v[1]) / v[0] * 100;
        return d < 10 ? 'ok' : d < 20 ? 'high' : 'severe';
      }
      default: return null;
    }
  }
  function sagPct(v) { return Array.isArray(v) && v[0] > 0 && isFinite(v[1]) ? Math.round((v[0] - v[1]) / v[0] * 1000) / 10 : null; }

  return { causes, measurements, symptoms, measById, causeById, compOf, posterior, suggest, evidence, classify, sagPct, eig, measOK, has };
})();

/* =====================================================================
   p09 · DiagPro – ממשק האבחון המתקדם
   תתי-לשוניות: adv (מדידות + ריבוי סימפטומים + הסתברויות חיות),
   inter (תקלות לסירוגין + Wiggle Test), tp (נקודות בדיקה לדגם)
   ומשתלב בלשונית הקודים הקיימת (כרטיס דגם + סימון אמינות).
   ===================================================================== */
const DiagPro = (() => {
  const SUBS = [['adv', 'מדידות'], ['sym', 'עץ שאלות'], ['inter', 'לסירוגין'], ['tp', 'נקודות בדיקה'], ['codes', 'קודים']];
  let ev = fresh(), vals = {}, view = 'main', openM = null, hl = null, tpSel = null, curSub = 'adv';
  function fresh() { return { sym: new Set(), res: {}, inter: new Set(), wig: {} }; }
  const E = DiagEngine;
  const pct = p => (p >= 0.995 ? '99' : p < 0.005 ? '<1' : String(Math.round(p * 100)));

  function subtabs(sub) {
    curSub = sub;
    return `<div class="subtabs" role="tablist" aria-label="כלי אבחון">${SUBS.map(([id, n]) =>
      `<button type="button" role="tab" aria-selected="${sub === id}" data-action="dg-sub" data-sub="${id}">${n}</button>`).join('')}</div>`;
  }
  const handles = sub => sub === 'adv' || sub === 'inter' || sub === 'tp';

  /* ---------- באנרים ---------- */
  function hvBanner() {
    if (M().voltage < DATA.pro.hvThreshold) return '';
    return `<div class="note danger">${ICON.warn}<span><b>${M().voltage}V – מתח מסוכן במגע.</b> מדידות חיות (${Safety.liveBadge()}) בדגם הזה – רק טכנאי עם מולטימטר CAT III, מחטי מדידה מבודדות וכפפות. במקרה ספק – מודדים רק עם סוללה מנותקת.</span></div>`;
  }
  function capNote(m) {
    if (!(m.comp === 'controller' || m.bundle === 'phase' || m.id === 'm_phase_r')) return '';
    return `<div class="note warn">${ICON.warn}<span>קבלים בבקר שומרים מתח גם אחרי ניתוק הסוללה. המתינו 2 דקות ובדקו 0V בכניסת הבקר לפני מגע בפינים.</span></div>`;
  }

  /* ---------- הסתברויות והמלצות ---------- */
  function evCount() { return ev.sym.size + Object.keys(ev.res).length + ev.inter.size + Object.values(ev.wig).filter(x => x === 'cut').length; }
  function probsHTML(post, n = 6) {
    if (!post.length) return '<p class="lead">אין סיבות רלוונטיות לדגם הזה.</p>';
    const top = post.slice(0, n);
    return `<ol class="probs" aria-label="סיבות אפשריות לפי הסתברות">${top.map((x, i) => `<li>
      <button type="button" class="prob ${i === 0 && x.p >= 0.5 ? 'lead-cause' : ''}" data-action="dp-cause" data-c="${x.c.id}" aria-label="${esc(x.c.name)} – ${pct(x.p)} אחוז">
        <span class="pname">${esc(x.c.name)}${x.c.stop === 'battery' ? ' <span class="tag-stop" title="דורש מומחה סוללות">🔋</span>' : x.c.stop === 'noride' ? ' <span class="tag-stop" title="לא לרכוב עד תיקון">⛔</span>' : ''}<small class="pro-only">${esc(x.c.pro)}</small></span>
        <span class="pp num">${pct(x.p)}%</span>
        <span class="pbar" aria-hidden="true"><i data-sw="${Math.max(2, x.p * 100)}"></i></span>
      </button></li>`).join('')}</ol>
      <p class="foot">${evCount() ? `מבוסס על ${evCount()} ראיות. ` : 'עדיין אין ראיות – ההסתברויות לפי שכיחות בדגם. '}האחוזים הם הערכה, לא אבחנה.</p>`;
  }
  function nextHTML(post) {
    const s = E.suggest(ev, post);
    if (!s.length) return evCount() ? '<p class="lead">אין מדידה נוספת שתשנה משמעותית את התמונה. אפשר לעבור לסיכום.</p>' : '';
    return `<div class="next-list">${s.map((x, i) => `<button type="button" class="next-m" data-action="dp-open" data-m="${x.m.id}">
      <span class="nm">${i === 0 ? '⭐ ' : ''}${esc(x.m.name)}</span>${x.m.live ? Safety.liveBadge() : ''}
      <small><span class="pro-only num">ערך מידע ${x.g.toFixed(2)} ביט · </span>${esc(x.m.mode)}</small></button>`).join('')}</div>`;
  }

  /* ---------- כרטיס מדידה ---------- */
  function resLabel(m) { const o = ev.res[m.id]; return o ? `<span class="mtag ${o === (DiagEngineNormal(m)) ? 'ok' : 'bad'}">${esc(m.outcomes[o])}</span>` : '<span class="mtag">לא נמדד</span>'; }
  function DiagEngineNormal(m) { return { m_batt: 'ok', m_ctrl_in: 'same', m_disp: 'ok', m_5v: 'ok', m_thr_rest: 'ok', m_thr_full: 'ok', m_hall: 'all', m_phase_r: 'equal', m_brake: 'works', m_pas: 'pulses', m_sag: 'ok', m_charger: 'ok', m_wiggle: 'none', m_hot: 'none', m_link: 'ok', m_alarm: 'unlocked', m_settings: 'ok' }[m.id]; }
  function inputHTML(m) {
    const v = vals[m.id];
    if (m.type === 'choice') return `<div class="choice-row" role="group" aria-label="${esc(m.name)}">${Object.keys(m.outcomes).map(o =>
      `<button type="button" class="btn sm choice" data-action="dp-choice" data-m="${m.id}" data-o="${o}" aria-pressed="${ev.res[m.id] === o}">${esc(m.outcomes[o])}</button>`).join('')}</div>`;
    if (m.type === 'num3') {
      const a = Array.isArray(v) ? v : [];
      return `<div class="num3">${['U–V', 'V–W', 'W–U'].map((lab, i) => `<label class="field"><span class="lbl">${lab} (Ω)</span><input class="input num dp-in" data-m="${m.id}" data-i="${i}" inputmode="decimal" placeholder="למשל 0.3 או OL" value="${a[i] == null ? '' : (a[i] === Infinity ? 'OL' : a[i])}"></label>`).join('')}</div>`;
    }
    if (m.type === 'pair') {
      const a = Array.isArray(v) ? v : [];
      return `<div class="num3 two">${['במנוחה', 'תחת עומס'].map((lab, i) => `<label class="field"><span class="lbl">${lab} (V)</span><input class="input num dp-in" data-m="${m.id}" data-i="${i}" inputmode="decimal" value="${a[i] == null ? '' : a[i]}"></label>`).join('')}</div>
        <p class="calc-out" id="sag-out">${E.sagPct(a) != null ? `צניחה: ${E.sagPct(a)}%` : ''}</p>`;
    }
    return `<label class="field"><span class="lbl">הקריאה שלכם (${esc(m.unit)})</span><input class="input num dp-in" data-m="${m.id}" inputmode="decimal" value="${v == null ? '' : v}" placeholder="${esc(tplM(m.expect))}"></label>`;
  }
  function measCard(m) {
    const open = openM === m.id;
    return `<details class="meas" id="mc-${m.id}" ${open ? 'open' : ''} data-m="${m.id}">
      <summary><span class="mname">${esc(m.name)}</span>${m.live ? Safety.liveBadge() : ''}<span id="mr-${m.id}">${resLabel(m)}</span></summary>
      <div class="mbody">
        <p class="beg-only">${T(m.how)}</p>
        <div class="meter">
          <div class="mhead"><span>מולטימטר</span><span class="mode">${esc(m.mode)}</span></div>
          <div class="probe"><i class="r" aria-hidden="true"></i><span><b>חוד אדום:</b> ${esc(m.red)}</span></div>
          <div class="probe"><i class="k" aria-hidden="true"></i><span><b>חוד שחור:</b> ${esc(m.black)}</span></div>
          <div class="mhead"><span>ערך תקין צפוי לדגם</span>${Conf.badge(m.id === 'm_batt' || m.id === 'm_charger' || m.id === 'm_ctrl_in' || m.id === 'm_disp' ? 'ok' : 'typ')}</div>
          <div class="lcd num">${TM(m.expect)}</div>
        </div>
        <p class="pro-only foot">${T(m.how)}</p>
        ${capNote(m)}
        ${inputHTML(m)}
        <div class="row"><button type="button" class="btn sm ghost" data-action="dp-clear" data-m="${m.id}">ניקוי</button>
          <button type="button" class="btn sm ghost" data-action="dp-show" data-m="${m.id}">הצג ב-3D</button></div>
      </div></details>`;
  }

  /* ---------- מסכים ---------- */
  function advMain() {
    const post = E.posterior(ev);
    const heat = ev.sym.has('heat') || ev.res.m_hot === 'conn';
    return `
      <div class="note info beg-only">${ICON.info}<span>בחרו מה קורה (אפשר כמה סימפטומים), והזינו מדידות. המערכת משווה לערכים התקינים של <bdi>${esc(M().short)}</bdi> ומעדכנת את הסבירות של כל סיבה בזמן אמת. ⭐ = המדידה שהכי כדאי לעשות עכשיו.</span></div>
      ${hvBanner()}
      <div class="stack"><h3>מה קורה? <small class="lead">(אפשר לבחור כמה)</small></h3>
        <div class="sym-chips" role="group" aria-label="סימפטומים">${E.symptoms().map(s => `<button type="button" class="chip symchip" data-action="dp-sym" data-s="${s.id}" aria-pressed="${ev.sym.has(s.id)}" data-sx="s4"><span aria-hidden="true">${esc(s.glyph)}</span> ${esc(s.name)}<small class="pro-only">&nbsp;· ${esc(s.pro)}</small></button>`).join('')}</div></div>
      ${heat ? `<div class="note danger">${ICON.warn}<span><b>חום או ריח:</b> אם יש עשן, ריח שרוף, סוללה חמה מאוד או נפוחה – עוצרים עכשיו. <button type="button" class="btn sm danger" data-action="dp-hazard" data-h="smell">יש סימן סכנה</button></span></div>` : ''}
      <div class="card stack"><div class="spread"><h3>סיבות אפשריות</h3><span class="lead" data-sx="s27">חיות</span></div><div id="dpProbs" aria-live="polite">${probsHTML(post)}</div></div>
      <div class="card stack"><h3>מה למדוד עכשיו?</h3><div id="dpNext">${nextHTML(post)}</div></div>
      <div class="stack"><h3>מדידות לדגם <bdi>${esc(M().short)}</bdi></h3>${E.measurements().map(measCard).join('')}</div>
      <div class="navrow sticky-actions">
        <button type="button" class="btn primary" data-action="dp-result">סיכום ${ICON.next}</button>
        <button type="button" class="btn" data-action="dp-notfound">לא מצאתי</button>
      </div>
      <div class="row"><button type="button" class="btn sm ghost" data-action="dp-reset">אבחון חדש</button><button type="button" class="btn sm ghost" data-action="dp-save">שמירה ליומן</button><button type="button" class="btn sm ghost" data-action="dp-copy">העתקת דו״ח</button></div>
      <textarea class="input copybox" id="dpCopyBox" hidden rows="6" aria-label="דו״ח להעתקה" readonly></textarea>
      <p class="foot">${esc(DATA.meta.disclaimer)}</p>`;
  }
  function stopBox(c) {
    if (c.stop === 'battery') return `<div class="note danger">${ICON.warn}<span><b>עצרו – מומחה סוללות.</b> ${esc(DATA.meta.batteryNote)} אם יש חום, ריח, נפיחות או נזק – <button type="button" class="linkbtn" data-action="dp-hazard" data-h="swollen">דווחו על סכנה</button>.</span></div>`;
    if (c.stop === 'noride') return `<div class="note danger">${ICON.warn}<span><b>לא לרכוב עד תיקון.</b> במצב הזה הבלימה לא מנתקת את המנוע.</span></div>`;
    if (c.tech || c.diff >= 4) return `<div class="note warn">${ICON.tech}<span><b>מומלץ טכנאי.</b> התיקון דורש ציוד, ניסיון או פתיחת רכיב.</span></div>`;
    return `<div class="note ok">${ICON.ok}<span>אפשר לטפל בעצמכם, בזהירות, עם סוללה מנותקת (חוץ משלבי המדידה החיה).</span></div>`;
  }
  function diffMeter(d) {
    const lbl = ['', 'קל מאוד', 'קל', 'בינוני', 'מתקדם', 'מקצועי'][d] || '';
    return `<div class="spread"><span>רמת קושי: <b>${d}/5 · ${lbl}</b></span><span class="diff5" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= d ? 'on' : ''}"></i>`).join('')}</span></div>`;
  }
  function resultView() {
    const post = E.posterior(ev);
    if (!post.length) return advMain();
    const top = post[0], c = top.c, evs = E.evidence(c.id, ev);
    const weak = top.p < 0.4;
    const vm = c.verify && c.verify.meas ? E.measById(c.verify.meas) : null;
    return `
      <button type="button" class="back linkbtn" data-action="dp-back">${ICON.prev} חזרה למדידות</button>
      <div><p class="eyebrow">${ICON.ok} סיכום אבחון · <bdi>${esc(M().short)}</bdi></p><h2 id="dpTitle" tabindex="-1">${esc(c.name)}</h2><p class="pro-only lead">${esc(c.pro)}</p></div>
      <div class="big-p"><span class="num">${pct(top.p)}%</span><span>סבירות${weak ? ' – עדיין נמוכה, מומלץ עוד מדידות' : ''}</span></div>
      ${stopBox(c)}
      <div class="card stack"><h3>ההוכחה: מה הוביל לכאן</h3>
        ${evs.length ? `<ul class="clean evid">${evs.slice(0, 8).map(e => `<li class="${e.delta >= 0 ? 'sup' : 'weak'}"><span aria-hidden="true">${e.delta >= 0 ? '▲' : '▼'}</span> ${esc(e.label)} <small class="num">(${e.delta >= 0 ? '+' : ''}${Math.round(e.delta * 100)}%)</small></li>`).join('')}</ul>` : '<p class="lead">אין עדיין ראיות – זו רק ההערכה ההתחלתית לפי שכיחות בדגם.</p>'}
      </div>
      <div class="card stack">${diffMeter(c.diff)}
        <dl class="specs"><dt>זמן משוער</dt><dd>${T(c.time)}</dd>
        <dt>כלים</dt><dd>${c.tools.length ? c.tools.map(t => `<span class="chip-s">${esc(t)}</span>`).join(' ') : '—'}</dd>
        <dt>חלקים</dt><dd>${c.parts.length ? c.parts.map(t => `<span class="chip-s">${TM(t)}</span>`).join(' ') : '—'}</dd></dl></div>
      <div class="card stack"><h3>שלבי תיקון</h3><ol class="bul">${c.fix.map(f => `<li>${TM(f)}</li>`).join('')}</ol>
        ${c.comps.some(x => ['battery', 'chargePort'].includes(x)) ? `<div class="note danger">${ICON.warn}<span>${esc(DATA.meta.batteryNote)}</span></div>` : ''}</div>
      <div class="card stack" data-sx="s28"><h3>בדיקת אימות אחרי התיקון</h3><p class="verify">${TM(c.verify.text)}</p>
        ${vm ? `<button type="button" class="btn sm" data-action="dp-open" data-m="${vm.id}">פתיחת המדידה: ${esc(vm.name)}</button>` : ''}</div>
      ${post.length > 1 ? `<div class="card stack"><h3>חלופות</h3>${probsHTML(post.slice(1), 3)}</div>` : ''}
      <div class="row"><button type="button" class="btn sm" data-action="dp-save">שמירה ליומן</button><button type="button" class="btn sm" data-action="dp-copy">העתקת דו״ח</button><button type="button" class="btn sm ghost" data-action="dp-show-cause" data-c="${c.id}">הצג ב-3D</button><button type="button" class="btn sm ghost" data-action="dp-reset">אבחון חדש</button></div>
      <textarea class="input copybox" id="dpCopyBox" hidden rows="6" aria-label="דו״ח להעתקה" readonly></textarea>
      <p class="foot">${esc(DATA.meta.disclaimer)}</p>`;
  }
  function notFoundView() {
    const post = E.posterior(ev);
    const s = E.suggest(ev, post, 6);
    return `
      <button type="button" class="back linkbtn" data-action="dp-back">${ICON.prev} חזרה למדידות</button>
      <div><p class="eyebrow">אסקלציה</p><h2 id="dpTitle" tabindex="-1">לא נמצאה סיבה ברורה</h2><p class="lead">זה קורה בעיקר בתקלות לסירוגין. אלה הצעדים הבאים, לפי כמה כל מדידה צפויה לעזור.</p></div>
      <div class="card stack"><h3>מה עוד למדוד</h3>${s.length ? s.map(x => `<div class="esc-row"><b>${esc(x.m.name)}</b> ${x.m.live ? Safety.liveBadge() : ''}<p class="lead" data-sx="s29">${T(x.m.how)}</p><p class="num foot">צפוי: ${TM(x.m.expect)}</p><button type="button" class="btn sm" data-action="dp-open" data-m="${x.m.id}">למדידה</button></div>`).join('') : '<p class="lead">עשיתם את כל המדידות הזמינות. עברו ללשונית ״לסירוגין״ ל-Wiggle Test ולבדיקות עומס, חום ולחות.</p>'}</div>
      <div class="card stack"><h3>איך לתעד לטכנאי</h3><ul class="bul">
        <li>דגם, מספר סידורי ותאריך קנייה</li><li>מה קורה, מתי, וכמה פעמים (יומן אירועים)</li>
        <li>כל המדידות – עם נקודות המדידה המדויקות</li><li>קודי שגיאה ותמונה של הצג בזמן התקלה</li>
        <li>תמונות של מחברים, בעיקר אם יש השחרה או ירוקת</li><li>מה כבר הוחלף או נבדק</li></ul>
        <div class="row"><button type="button" class="btn sm primary" data-action="dp-copy">העתקת דו״ח לטכנאי</button><button type="button" class="btn sm" data-action="dp-save">שמירה ליומן</button><button type="button" class="btn sm ghost" data-action="dg-sub" data-sub="inter">לבדיקות לסירוגין</button><button type="button" class="btn sm ghost" data-action="dp-reset">אבחון חדש</button></div>
        <textarea class="input copybox" id="dpCopyBox" hidden rows="6" aria-label="דו״ח להעתקה" readonly></textarea></div>
      <div class="card stack"><h3>הסיבות שנשארו פתוחות</h3>${probsHTML(post, 5)}</div>`;
  }
  function interView() {
    const post = E.posterior(ev);
    const bs = harness();
    return `
      <p class="lead">תקלה שמופיעה ונעלמת היא הקשה ביותר. מתחילים מתיעוד ״מתי זה קורה״, ואז בודקים מקטע אחר מקטע.</p>
      ${hvBanner()}
      <div class="card stack"><h3>מתי זה קורה?</h3>
        <div class="sym-chips" role="group" aria-label="תנאים">${DATA.pro.interConditions.map(ic => `<button type="button" class="chip" data-action="dp-inter" data-ic="${ic.id}" aria-pressed="${ev.inter.has(ic.id)}" data-sx="s30">${esc(ic.name)}</button>`).join('')}</div></div>
      <div class="card stack"><h3>Wiggle Test – מקטע אחר מקטע</h3>
        <div class="note warn">${ICON.warn}<span>גלגל ההנעה באוויר, ידיים ובגדים רחוקים מהגלגל. מערכת דולקת, צג דולק ומצערת קלה (או PAS בסיבוב ביד). מנענעים בעדינות כל כבל – בעיקר ליד מחברים, צירי קיפול, יציאת הכבל מהציר וסיבוב הכידון.</span></div>
        <ul class="clean wig-list">${bs.map(b => { const c = circuitById(b.circuit); const r = ev.wig[b.id]; return `<li>
          <button type="button" class="linkbtn" data-action="dp-wfocus" data-b="${b.id}"><span class="sw" data-sc="${c ? c.color : '#888'}"></span> ${esc(b.label)}</button>
          <span class="row" role="group" aria-label="${esc(b.label)}"><button type="button" class="btn sm choice" data-action="dp-wig" data-b="${b.id}" data-r="ok" aria-pressed="${r === 'ok'}">יציב</button><button type="button" class="btn sm choice bad" data-action="dp-wig" data-b="${b.id}" data-r="cut" aria-pressed="${r === 'cut'}">גורם לניתוק</button></span></li>`; }).join('')}</ul></div>
      <div class="card stack"><h3>בדיקות נוספות</h3>
        <div class="esc-row"><b>בדיקת עומס</b><p class="lead" data-sx="s29">מדידת צניחת מתח בהאצה – חושפת סוללה חלשה ומחבר עם התנגדות.</p><button type="button" class="btn sm" data-action="dp-open" data-m="m_sag">למדידה</button></div>
        <div class="esc-row"><b>בדיקת חום</b><p class="lead" data-sx="s29">אחרי 10–15 דקות נסיעה: איפה מורגש חום? מחבר חם = התנגדות מגע.</p><button type="button" class="btn sm" data-action="dp-open" data-m="m_hot">למדידה</button></div>
        <div class="esc-row"><b>בדיקת לחות</b><p class="lead" data-sx="s29">ייבוש 24 שעות במקום חם ויבש, ואז ניסיון חוזר. אם זה עזר – סמנו את התנאי ״ייבוש פתר זמנית״ למעלה.</p></div>
      </div>
      <div class="card stack"><h3>יומן אירועים</h3><p class="lead" data-sx="s29">כל פעם שזה קורה – רשמו: תאריך, שעה, טמפרטורה, מצב סוללה, מה עשיתם באותו רגע, ומה הצג הראה.</p>
        <button type="button" class="btn sm" data-action="dp-diary">העתקת תבנית יומן</button>
        <textarea class="input copybox" id="dpCopyBox" hidden rows="6" aria-label="תבנית להעתקה" readonly></textarea></div>
      <div class="card stack"><h3>ההערכה כרגע</h3><div id="dpProbs">${probsHTML(post, 4)}</div>
        <button type="button" class="btn primary block" data-action="dg-sub" data-sub="adv">למסך האבחון המלא ${ICON.next}</button></div>`;
  }
  function tpView() {
    const m = M(), b = BR(), ex = m.expectedValues || {}, tps = (m.testPoints || []).filter(tp => vehicleComps().includes(tp.comp));
    const tq = (m.torque || []).map(id => DATA.pro.torqueRef[id]).filter(Boolean);
    return `
      <p class="lead">כל נקודת בדיקה ב-<bdi>${esc(m.short)}</bdi>: איפה מודדים, מה הערך התקין, ומה אומר ערך חריג. לחיצה על ״הצג ב-3D״ מסמנת את הרכיב והכבל במודל.</p>
      ${hvBanner()}
      <div class="kv-grid">
        <div class="kv"><span>מלאה ${Conf.badge('ok')}</span><b class="num">${b.full.toFixed(1)}V</b></div>
        <div class="kv"><span>ריקה ≈ ${Conf.badge('ok')}</span><b class="num">${b.empty.toFixed(1)}V</b></div>
        <div class="kv"><span>אספקת חיישנים ${Conf.badge('typ')}</span><b class="num">4.8–5.2V</b></div>
        <div class="kv"><span>זרם בקר ${Conf.badge(ex.controllerAmps ? ex.controllerAmps.conf : 'unk')}</span><b class="num">${ex.controllerAmps && ex.controllerAmps.v ? ex.controllerAmps.v + 'A' : '❓'}</b></div>
      </div>
      <div class="stack">${tps.map(tp => `<div class="card tp-card ${tpSel === tp.id ? 'sel' : ''}" id="tp-${tp.id}">
        <div class="spread"><h3>${esc(tp.name)}</h3><span>${tp.live ? Safety.liveBadge() : ''} ${Conf.badge(tp.conf)}</span></div>
        <p class="pro-only foot"><span class="mode">${esc(tp.mode)}</span> · אדום: ${esc(tp.red)} · שחור: ${esc(tp.black)}</p>
        <p class="beg-only">חוד אדום: ${esc(tp.red)} · חוד שחור: ${esc(tp.black)}</p>
        <div class="lcd num">${TM(tp.expect)}</div>
        ${tp.bad ? `<p class="lead" data-sx="s29"><b>ערך חריג:</b> ${T(tp.bad)}</p>` : ''}
        <div class="row"><button type="button" class="btn sm" data-action="tp-show" data-tp="${tp.id}">הצג ב-3D</button>${tp.meas && E.measById(tp.meas) && E.measOK(E.measById(tp.meas)) ? `<button type="button" class="btn sm ghost" data-action="tp-meas" data-m="${tp.meas}">הזנת קריאה לאבחון</button>` : ''}</div>
      </div>`).join('')}</div>
      ${m.hallSequence ? `<div class="card stack"><div class="spread"><h3>רצף Hall תקין</h3>${Conf.badge(m.hallSequence.conf)}</div>
        <p class="lead" data-sx="s29">${esc(m.hallSequence.note)}</p>
        <div class="hallseq" role="table" aria-label="רצף מצבי Hall"><div role="row" class="hs-h"><span role="columnheader">צעד</span><span role="columnheader">A</span><span role="columnheader">B</span><span role="columnheader">C</span></div>${m.hallSequence.states.map((s, i) => `<div role="row"><span role="cell">${i + 1}</span>${s.split('').map(ch => `<span role="cell" class="${ch === '1' ? 'hi' : 'lo'}">${ch === '1' ? '5V' : '0V'}</span>`).join('')}</div>`).join('')}</div></div>` : ''}
      ${m.connectors ? `<div class="card stack"><h3>מחברים בדגם</h3><dl class="specs">${[['power', 'הספק'], ['charge', 'טעינה'], ['motor', 'מנוע'], ['display', 'צג']].filter(([k]) => m.connectors[k]).map(([k, n]) => `<dt>${n}</dt><dd>${T(m.connectors[k].v)} ${Conf.badge(m.connectors[k].conf)}</dd>`).join('')}
        ${m.displayProtocol ? `<dt>פרוטוקול צג</dt><dd>${T(m.displayProtocol.v)} ${Conf.badge(m.displayProtocol.conf)}</dd>` : ''}</dl></div>` : ''}
      ${tq.length ? `<div class="card stack"><h3>מומנטי הידוק</h3><dl class="specs">${tq.map(t => `<dt>${esc(t.part)}</dt><dd class="num">${esc(t.nm)} ${Conf.badge(t.conf)}</dd>`).join('')}</dl><p class="foot">ערכים טיפוסיים. אם היצרן פרסם ערך – הוא קובע.</p></div>` : ''}
      ${Conf.legendHTML()}`;
  }

  /* ---------- API ללשונית האבחון הקיימת ---------- */
  function html(sub) {
    curSub = sub;
    if (sub === 'adv') return view === 'result' ? resultView() : view === 'notfound' ? notFoundView() : advMain();
    if (sub === 'inter') return interView();
    return tpView();
  }
  function bind(sub) {
    const mv = $('#modeView');
    mv.querySelectorAll('.dp-in').forEach(inp => {
      inp.addEventListener('change', () => onInput(inp));
      inp.addEventListener('input', () => { clearTimeout(inp._t); inp._t = setTimeout(() => onInput(inp), 500); });
    });
    mv.querySelectorAll('details.meas').forEach(d => d.addEventListener('toggle', () => {
      if (d.open) { openM = d.dataset.m; const m = E.measById(openM); if (m) { hl = { comp: m.comp, bundle: m.bundle }; applyHL(false); } }
      else if (openM === d.dataset.m) openM = null;
    }));
    if (sub === 'adv' && openM) { const d = $('#mc-' + openM); if (d) setTimeout(() => d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60); }
    if (sub === 'tp' && tpSel) { const d = $('#tp-' + tpSel); if (d) setTimeout(() => d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60); }
    const t = $('#dpTitle'); if (t && !UI.isMobile()) t.focus({ preventScroll: true });
  }
  function parseNum(s) {
    s = String(s || '').trim().replace(',', '.');
    if (!s) return null;
    if (/^o\.?l$/i.test(s) || s === '∞') return Infinity;
    const n = parseFloat(s); return isFinite(n) ? n : NaN;
  }
  function onInput(inp) {
    const mid = inp.dataset.m, m = E.measById(mid); if (!m) return;
    const v = parseNum(inp.value);
    if (m.type === 'num3' || m.type === 'pair') {
      const n = m.type === 'num3' ? 3 : 2;
      const arr = Array.isArray(vals[mid]) ? vals[mid].slice() : new Array(n).fill(null);
      arr[Number(inp.dataset.i)] = v === null || Number.isNaN(v) ? null : v;
      vals[mid] = arr;
      if (m.type === 'pair') { const o = $('#sag-out'); if (o) o.textContent = E.sagPct(arr) != null ? `צניחה: ${E.sagPct(arr)}%` : ''; }
    } else vals[mid] = v === null || Number.isNaN(v) ? null : v;
    if (v !== null && Number.isNaN(v)) { UI.toast('הזינו מספר (אפשר גם OL למדידת התנגדות)'); return; }
    const o = E.classify(mid, vals[mid], vals);
    if (o) ev.res[mid] = o; else delete ev.res[mid];
    if (mid === 'm_batt' && isFinite(vals.m_batt) && vals.m_batt >= DATA.pro.hvThreshold) UI.toast('מתח מעל 60V – מדידות חיות רק לטכנאי');
    if (mid === 'm_batt' && ev.res.m_ctrl_in && isFinite(vals.m_ctrl_in)) { const o2 = E.classify('m_ctrl_in', vals.m_ctrl_in, vals); if (o2) ev.res.m_ctrl_in = o2; }
    refresh();
  }
  function refresh() {
    const post = E.posterior(ev);
    const p = $('#dpProbs'); if (p) p.innerHTML = probsHTML(post, curSub === 'inter' ? 4 : 6);
    const n = $('#dpNext'); if (n) n.innerHTML = nextHTML(post);
    E.measurements().forEach(m => { const r = $('#mr-' + m.id); if (r) r.innerHTML = resLabel(m); });
    $$('[data-action="dp-choice"]').forEach(b => b.setAttribute('aria-pressed', String(ev.res[b.dataset.m] === b.dataset.o)));
    if (!openM && post[0]) { hl = { comp: E.compOf(post[0].c), bundle: post[0].c.bundle }; applyHL(false); }
    Glossary.schedule();
  }
  function applyHL(focus) {
    if (!hl) { Scene.select(null); Scene.highlightBundle(null); return; }
    const comp = vehicleComps().includes(hl.comp) ? hl.comp : null;
    Scene.select(comp && comp !== 'frame' ? comp : null, focus && comp !== 'frame');
    Scene.highlightBundle(hl.bundle && (hl.bundle === 'all' || bundleById(hl.bundle)) ? hl.bundle : null);
  }
  function highlight(focus) {
    if (curSub === 'tp' && tpSel) { const tp = (M().testPoints || []).find(x => x.id === tpSel); if (tp) hl = { comp: tp.comp, bundle: tp.bundle }; }
    else if (curSub === 'adv' && !openM) { const post = E.posterior(ev); hl = post[0] ? { comp: E.compOf(post[0].c), bundle: post[0].c.bundle } : null; }
    applyHL(focus && curSub === 'tp');
  }
  function reset() { ev = fresh(); vals = {}; view = 'main'; openM = null; tpSel = null; hl = null; }

  /* ---------- דו״ח ---------- */
  function reportText() {
    const m = M(), post = E.posterior(ev), L = [];
    L.push('מעבדת החיווט – דו״ח אבחון');
    L.push(`דגם: ${m.name} (${m.voltage}V, ${m.ah}Ah)`);
    L.push('תאריך: ' + new Date().toLocaleDateString('he-IL'));
    if (ev.sym.size) L.push('סימפטומים: ' + [...ev.sym].map(s => (DATA.pro.bayesSymptoms.find(x => x.id === s) || {}).name).join(', '));
    const ms = Object.keys(ev.res).map(mid => { const mm = E.measById(mid); const v = vals[mid]; const vs = Array.isArray(v) ? v.map(x => x === Infinity ? 'OL' : x).join(' / ') : (v != null ? v : ''); return `- ${mm.name}: ${vs}${vs !== '' && mm.unit ? ' ' + mm.unit : ''} → ${mm.outcomes[ev.res[mid]]}`; });
    if (ms.length) { L.push('מדידות:'); L.push(...ms); }
    if (ev.inter.size) L.push('תנאים: ' + [...ev.inter].map(i => (DATA.pro.interConditions.find(x => x.id === i) || {}).name).join(', '));
    const wig = Object.keys(ev.wig).filter(k => ev.wig[k] === 'cut').map(k => (bundleById(k) || {}).label || k);
    if (wig.length) L.push('Wiggle – גורם לניתוק: ' + wig.join(', '));
    L.push('סיבות מובילות:');
    post.slice(0, 3).forEach((x, i) => L.push(`${i + 1}. ${x.c.name} – ${pct(x.p)}%`));
    L.push('');
    L.push(DATA.meta.disclaimer);
    return L.join('\n');
  }
  function measSummary() {
    return Object.keys(ev.res).map(mid => { const mm = E.measById(mid); const v = vals[mid]; const vs = Array.isArray(v) ? v.map(x => x === Infinity ? 'OL' : x).join('/') : (v != null ? v : ''); return `${mm.name}: ${vs}${mm.unit && vs !== '' ? mm.unit : ''} (${mm.outcomes[ev.res[mid]]})`; }).join('; ');
  }

  /* ---------- פעולות ---------- */
  function rerender() { Diagnostics.render(); }
  UI.on('dp-sym', el => { const s = el.dataset.s; if (ev.sym.has(s)) ev.sym.delete(s); else ev.sym.add(s); if (s === 'heat') rerender(); else { el.setAttribute('aria-pressed', String(ev.sym.has(s))); refresh(); } });
  UI.on('dp-choice', el => { const mid = el.dataset.m, o = el.dataset.o; if (ev.res[mid] === o) delete ev.res[mid]; else ev.res[mid] = o; if (mid === 'm_hot') { rerender(); return; } if (curSub === 'inter') rerender(); else refresh(); });
  UI.on('dp-clear', el => { const mid = el.dataset.m; delete ev.res[mid]; delete vals[mid]; openM = mid; rerender(); });
  UI.on('dp-open', el => { openM = el.dataset.m; view = 'main'; if (curSub !== 'adv') { const b = $('[data-action="dg-sub"][data-sub="adv"]'); if (b) { b.click(); return; } } rerender(); });
  UI.on('dp-show', el => { const m = E.measById(el.dataset.m); if (m) { hl = { comp: m.comp, bundle: m.bundle }; applyHL(true); } });
  UI.on('dp-cause', el => { const c = E.causeById(el.dataset.c); if (!c) return; hl = { comp: E.compOf(c), bundle: c.bundle }; applyHL(true); UI.toast(c.name); });
  UI.on('dp-show-cause', el => { const c = E.causeById(el.dataset.c); if (c) { hl = { comp: E.compOf(c), bundle: c.bundle }; applyHL(true); } });
  UI.on('dp-result', () => { view = 'result'; rerender(); $('#panelScroll').scrollTop = 0; });
  UI.on('dp-notfound', () => { view = 'notfound'; rerender(); $('#panelScroll').scrollTop = 0; });
  UI.on('dp-back', () => { view = 'main'; rerender(); });
  UI.on('dp-reset', () => { reset(); rerender(); $('#panelScroll').scrollTop = 0; UI.toast('אבחון חדש'); });
  UI.on('dp-hazard', el => Safety.trigger(el.dataset.h || 'smell'));
  UI.on('dp-copy', () => copyText(reportText(), $('#dpCopyBox')));
  UI.on('dp-diary', () => copyText('יומן תקלה לסירוגין – ' + M().name + '\nתאריך | שעה | טמפרטורה | % סוללה | מה עשיתי | מה הצג הראה | כמה זמן\n', $('#dpCopyBox')));
  UI.on('dp-save', () => {
    const post = E.posterior(ev);
    const r = RepairLog.add({ symptoms: [...ev.sym].map(s => (DATA.pro.bayesSymptoms.find(x => x.id === s) || {}).name).join(', '), measurements: measSummary(), notes: 'אבחון: ' + post.slice(0, 3).map(x => `${x.c.name} ${pct(x.p)}%`).join(' · ') });
    UI.toast('נשמר ביומן התיקונים (' + r.date + ')');
  });
  UI.on('dp-inter', el => { const i = el.dataset.ic; if (ev.inter.has(i)) ev.inter.delete(i); else ev.inter.add(i); el.setAttribute('aria-pressed', String(ev.inter.has(i))); refresh(); });
  UI.on('dp-wig', el => {
    const b = el.dataset.b, r = el.dataset.r;
    if (ev.wig[b] === r) delete ev.wig[b]; else ev.wig[b] = r;
    const anyCut = Object.values(ev.wig).includes('cut');
    if (anyCut) ev.res.m_wiggle = 'cut'; else if (Object.keys(ev.wig).length) ev.res.m_wiggle = 'none'; else delete ev.res.m_wiggle;
    $$(`[data-action="dp-wig"][data-b="${b}"]`).forEach(x => x.setAttribute('aria-pressed', String(ev.wig[b] === x.dataset.r)));
    hl = { comp: (bundleById(b) || {}).comp, bundle: b }; applyHL(false);
    refresh();
  });
  UI.on('dp-wfocus', el => { const bd = bundleById(el.dataset.b); if (bd) { hl = { comp: bd.comp, bundle: bd.id }; applyHL(true); } });
  UI.on('tp-show', el => { tpSel = el.dataset.tp; $$('.tp-card').forEach(c => c.classList.toggle('sel', c.id === 'tp-' + tpSel)); highlight(true); });
  UI.on('tp-meas', el => { openM = el.dataset.m; view = 'main'; const b = $('[data-action="dg-sub"][data-sub="adv"]'); if (b) b.click(); });
  function openTP(id) {
    tpSel = id || null;
    UI.closeComp(false);
    if (State.mode !== 'diag') UI.setMode('diag');
    const b = $('[data-action="dg-sub"][data-sub="tp"]'); if (b) b.click();
    UI.openSheet('half');
  }
  UI.on('tp-go', el => openTP(el.dataset.tp));
  UI.on('tp-all', () => openTP(null));

  /* ---------- קודי שגיאה: כרטיס דגם + אמינות ---------- */
  function modelCodesCard() {
    const ec = M().errorCodes;
    if (!ec) return '';
    const fams = ec.families || [];
    return `<div class="card stack model-card"><div class="spread"><h3>קודים לדגם <bdi>${esc(M().short)}</bdi></h3>${Conf.badge(ec.conf)}</div>
      <p class="lead" data-sx="s0">${T(ec.note)}</p>
      ${fams.length ? `<div class="row">${fams.map(f => { const b = DATA.errorCodes.brands.find(x => x.id === f); return `<button type="button" class="btn sm" data-action="dg-brand" data-b="${f}">הצג קודי ${esc(b ? b.name : f)}</button>`; }).join('')}</div>` : '<p class="foot">❓ אין קודים מאומתים לדגם הזה במאגר. לא ממציאים קודים – בדקו במדריך הצג.</p>'}</div>`;
  }
  function codeConf(c) { return Conf.badge((DATA.pro.codeConfidence || {})[c.b] || 'unk'); }

  return { subtabs, handles, html, bind, highlight, reset, modelCodesCard, codeConf, openTP, reportText };
})();

/* =====================================================================
   p10 · Academy – מסלול לימוד מ-0 עד מקצוען
   7 מודולים, שיעורים לפי רמה (מתחיל/מקצוען), בוחן לכל מודול ותעודת סיום.
   התוכן יושב ב-<script id="academy-data"> ומפוענח רק בפתיחה הראשונה (lazy).
   שיעורים מסוננים לפי vehicleComps() – omit מסתיר שיעורים לא רלוונטיים.
   ===================================================================== */
const Academy = (() => {
  let data = null, view = 'list', modId = null, lesId = null, answers = {}, submitted = false;
  function load() {
    if (data) return data;
    try { data = JSON.parse(document.getElementById('academy-data').textContent); }
    catch (e) { data = { passScore: 80, modules: [] }; }
    return data;
  }
  const prog = () => { const p = ProStore.get('acad', null); return p && typeof p === 'object' ? p : { read: {}, scores: {}, certs: {} }; };
  const saveProg = p => ProStore.set('acad', p);
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const mod = () => load().modules.find(m => m.id === modId);
  const lessonsOf = m => m.lessons.filter(l => !l.requires || l.requires.some(c => vehicleComps().includes(c)));
  function modStatus(m) {
    const p = prog(), ls = lessonsOf(m), read = ls.filter(l => p.read[m.id + '.' + l.id]).length;
    return { read, total: ls.length, score: p.scores[m.id], cert: p.certs[m.id] };
  }

  function listHTML() {
    const mods = load().modules, p = prog();
    const done = mods.filter(m => p.certs[m.id]).length;
    return `<div class="stack"><h3>אקדמיה: מאפס ועד מקצוען</h3>
      <p class="lead">7 שלבים, כל אחד עם שיעורים קצרים, מודל תלת-ממדי שמתעדכן, בוחן ותעודת סיום. התוכן מותאם לדגם <bdi>${esc(M().short)}</bdi> ולרמה שבחרתם (<b>${Level.isBeg() ? 'מתחיל' : 'מקצוען'}</b>).</p>
      <div class="progress" role="progressbar" aria-label="התקדמות באקדמיה" aria-valuemin="0" aria-valuemax="${mods.length}" aria-valuenow="${done}"><i data-sw="${mods.length ? done / mods.length * 100 : 0}"></i></div>
      <p class="foot num">${done} מתוך ${mods.length} תעודות</p></div>
      <div class="acad-mods">${mods.map((m, i) => { const s = modStatus(m); return `<button type="button" class="acad-mod ${s.cert ? 'done' : ''}" data-action="ac-mod" data-m="${m.id}">
        <span class="n" aria-hidden="true">${s.cert ? '✓' : i + 1}</span><b>${esc(m.title)}</b><small>${esc(m.desc)}</small>
        <span class="st num">${s.read}/${s.total} שיעורים${s.score != null ? `<br>בוחן: ${s.score}%` : ''}</span></button>`; }).join('')}</div>`;
  }
  function modHTML() {
    const m = mod(), s = modStatus(m), p = prog();
    return `<button type="button" class="linkbtn" data-action="ac-list">${ICON.prev} כל המודולים</button>
      <div><p class="eyebrow">מודול ${load().modules.indexOf(m) + 1}</p><h2 id="acTitle" tabindex="-1">${esc(m.title)}</h2><p class="lead">${esc(m.desc)}</p></div>
      <div class="lesson-list">${lessonsOf(m).map((l, i) => `<button type="button" data-action="ac-les" data-l="${l.id}" class="${p.read[m.id + '.' + l.id] ? 'read' : ''}"><span class="num">${i + 1}.</span> ${esc(l.title)}${l.sim ? ' · 🔧 סימולטור' : ''}</button>`).join('')}</div>
      <div class="card stack"><h3>בוחן המודול</h3><p class="lead" data-sx="s0">${m.quiz.length} שאלות. ציון עובר: ${load().passScore}%. ${s.score != null ? `הציון האחרון: <b>${s.score}%</b>.` : ''}</p>
        <div class="row"><button type="button" class="btn primary" data-action="ac-quiz">${s.score != null ? 'לבוחן שוב' : 'לבוחן'}</button>${s.cert ? '<button type="button" class="btn" data-action="ac-cert">התעודה שלי</button>' : ''}</div></div>`;
  }
  function lessonHTML() {
    const m = mod(), ls = lessonsOf(m), i = ls.findIndex(l => l.id === lesId), l = ls[i];
    if (!l) { view = 'module'; return modHTML(); }
    const beg = Level.isBeg();
    return `<button type="button" class="linkbtn" data-action="ac-mod" data-m="${m.id}">${ICON.prev} ${esc(m.title)}</button>
      <div class="progress" role="progressbar" aria-label="התקדמות במודול" aria-valuemin="1" aria-valuemax="${ls.length}" aria-valuenow="${i + 1}"><i data-sw="${(i + 1) / ls.length * 100}"></i></div>
      <div><p class="eyebrow">שיעור ${i + 1} מתוך ${ls.length} · ${beg ? 'מתחיל' : 'מקצוען'}</p><h2 id="acTitle" tabindex="-1">${esc(l.title)}</h2></div>
      <div class="card lesson-body"><p>${md(beg ? l.beg : l.pro)}</p>
        ${beg ? `<details class="concept"><summary>הגרסה המקצועית</summary><div class="body"><p>${md(l.pro)}</p></div></details>` : `<details class="concept"><summary>הסבר פשוט</summary><div class="body"><p>${md(l.beg)}</p></div></details>`}
        ${l.focus && l.focus.comp && vehicleComps().includes(l.focus.comp) ? `<button type="button" class="btn sm ghost" data-action="ac-3d">הצג במודל: ${esc(compName(l.focus.comp))}</button>` : ''}</div>
      ${l.sim ? MeterSim.html() : ''}
      ${m.id === 'm3' ? `<div class="note danger">${ICON.warn}<span>${esc(DATA.meta.batteryNote)}</span></div>` : ''}
      <div class="navrow">
        <button type="button" class="btn" data-action="ac-les" data-l="${ls[i - 1] ? ls[i - 1].id : ''}" ${i === 0 ? 'disabled' : ''}>${ICON.prev} הקודם</button>
        ${i < ls.length - 1 ? `<button type="button" class="btn primary" data-action="ac-les" data-l="${ls[i + 1].id}">הבא ${ICON.next}</button>` : `<button type="button" class="btn primary" data-action="ac-quiz">לבוחן ${ICON.next}</button>`}
      </div>`;
  }
  function quizHTML() {
    const m = mod(), pass = load().passScore;
    const score = submitted ? Math.round(m.quiz.filter((q, i) => answers[i] === q.a).length / m.quiz.length * 100) : null;
    return `<button type="button" class="linkbtn" data-action="ac-mod" data-m="${m.id}">${ICON.prev} ${esc(m.title)}</button>
      <div><p class="eyebrow">בוחן</p><h2 id="acTitle" tabindex="-1">${esc(m.title)}</h2></div>
      ${m.quiz.map((q, i) => `<fieldset class="card quiz-q" data-sx="s31"><legend class="sr-only">שאלה ${i + 1}</legend>
        <b>${i + 1}. ${T(q.q)}</b>
        ${q.opts.map((o, j) => { let cls = ''; if (submitted) { if (j === q.a) cls = 'right'; else if (answers[i] === j) cls = 'wrong'; }
          return `<button type="button" class="quiz-opt ${cls}" data-action="ac-opt" data-q="${i}" data-o="${j}" aria-pressed="${answers[i] === j}" ${submitted ? 'disabled' : ''}>${T(o)}</button>`; }).join('')}
        ${submitted ? `<p class="${answers[i] === q.a ? 'verify' : 'mistake'}">${answers[i] === q.a ? '✓ נכון. ' : '✗ '}${T(q.why)}</p>` : ''}
      </fieldset>`).join('')}
      ${submitted
        ? `<div class="note ${score >= pass ? 'ok' : 'warn'}">${score >= pass ? ICON.ok : ICON.warn}<span><b>ציון: ${score}%</b> ${score >= pass ? '– עברתם! התעודה מחכה.' : `– צריך ${pass}% כדי לעבור. חזרו לשיעורים ונסו שוב.`}</span></div>
           <div class="navrow">${score >= pass ? '<button type="button" class="btn primary" data-action="ac-cert">לתעודה</button>' : '<button type="button" class="btn primary" data-action="ac-quiz">ניסיון נוסף</button>'}<button type="button" class="btn" data-action="ac-list">כל המודולים</button></div>`
        : `<button type="button" class="btn primary block" data-action="ac-submit" ${Object.keys(answers).length < m.quiz.length ? 'disabled' : ''}>הגשה</button>`}`;
  }
  function certHTML() {
    const m = mod(), c = prog().certs[m.id];
    if (!c) { view = 'module'; return modHTML(); }
    const name = ProStore.get('certName', '');
    return `<button type="button" class="linkbtn" data-action="ac-mod" data-m="${m.id}">${ICON.prev} ${esc(m.title)}</button>
      <div class="field"><label for="certName">השם על התעודה</label><input class="input" id="certName" maxlength="60" value="${esc(name)}" autocomplete="name"></div>
      <div class="print-area"><div class="cert" id="certCard">
        <div class="seal" aria-hidden="true">⚡</div>
        <p class="eyebrow" data-sx="s32">מעבדת החיווט · אקדמיה</p>
        <h3>תעודת סיום</h3>
        <p>מאשרת ש-</p><p class="who" id="certWho">${esc(name || 'שם המסיים/ת')}</p>
        <p>סיים/ה בהצלחה את המודול <b>${esc(m.title)}</b></p>
        <p class="num">ציון: ${c.score}% · תאריך: ${esc(c.date)}</p>
        <p class="foot">${esc(DATA.meta.disclaimer)}</p>
      </div></div>
      <div class="row">${IN_FRAME ? '' : '<button type="button" class="btn primary" data-action="ac-print">הדפסה / שמירה כ-PDF</button>'}<button type="button" class="btn" data-action="ac-copycert">העתקת טקסט התעודה</button><button type="button" class="btn ghost" data-action="ac-list">כל המודולים</button></div>
      ${IN_FRAME ? '<p class="foot">הדפסה זמינה כשפותחים את הקובץ index.html ישירות בדפדפן.</p>' : ''}
      <textarea class="input copybox" id="acCopyBox" hidden rows="4" aria-label="טקסט להעתקה" readonly></textarea>`;
  }
  function html() {
    load();
    if (view !== 'lesson') MeterSim.detach();
    if (view === 'module' && mod()) return modHTML();
    if (view === 'lesson' && mod()) return lessonHTML();
    if (view === 'quiz' && mod()) return quizHTML();
    if (view === 'cert' && mod()) return certHTML();
    view = 'list'; return listHTML();
  }
  function bind() {
    if (view === 'lesson') {
      const m = mod(), l = m && lessonsOf(m).find(x => x.id === lesId);
      if (l) { const p = prog(); p.read[m.id + '.' + l.id] = true; saveProg(p); if (l.sim) MeterSim.bind(); else MeterSim.detach(); }
    }
    const n = $('#certName');
    if (n) n.addEventListener('input', () => { ProStore.set('certName', n.value); const w = $('#certWho'); if (w) w.textContent = n.value || 'שם המסיים/ת'; });
    const t = $('#acTitle'); if (t && !UI.isMobile()) t.focus({ preventScroll: true });
  }
  function highlight(focus) {
    const m = mod(), l = view === 'lesson' && m ? lessonsOf(m).find(x => x.id === lesId) : null;
    if (l && l.focus && vehicleComps().includes(l.focus.comp)) {
      Scene.select(l.focus.comp === 'frame' ? null : l.focus.comp, focus && l.focus.comp !== 'frame');
      Scene.highlightBundle(l.focus.bundle && (l.focus.bundle === 'all' || bundleById(l.focus.bundle)) ? l.focus.bundle : null);
    } else if (!(view === 'lesson' && MeterSim.active())) { Scene.select(null); Scene.highlightBundle(null); }
  }
  function go(v) { view = v; Learn.render(); $('#panelScroll').scrollTop = 0; }

  UI.on('ac-list', () => go('list'));
  UI.on('ac-mod', el => { modId = el.dataset.m; go('module'); });
  UI.on('ac-les', el => { if (!el.dataset.l) return; lesId = el.dataset.l; go('lesson'); UI.openSheet('half'); });
  UI.on('ac-3d', () => highlight(true));
  UI.on('ac-quiz', () => { answers = {}; submitted = false; go('quiz'); });
  UI.on('ac-opt', el => {
    answers[Number(el.dataset.q)] = Number(el.dataset.o);
    $$(`[data-action="ac-opt"][data-q="${el.dataset.q}"]`).forEach(b => b.setAttribute('aria-pressed', String(b === el)));
    const sb = $('[data-action="ac-submit"]'); if (sb) sb.disabled = Object.keys(answers).length < mod().quiz.length;
  });
  UI.on('ac-submit', () => {
    const m = mod(); submitted = true;
    const score = Math.round(m.quiz.filter((q, i) => answers[i] === q.a).length / m.quiz.length * 100);
    const p = prog(); p.scores[m.id] = score;
    if (score >= load().passScore) p.certs[m.id] = { score, date: new Date().toLocaleDateString('he-IL') };
    saveProg(p); go('quiz');
  });
  UI.on('ac-cert', () => go('cert'));
  UI.on('ac-print', () => {
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { done(); }
    setTimeout(done, 3000);
  });
  UI.on('ac-copycert', () => {
    const m = mod(), c = prog().certs[m.id];
    copyText(`מעבדת החיווט · אקדמיה\nתעודת סיום\n${ProStore.get('certName', '')}\nסיים/ה בהצלחה את המודול: ${m.title}\nציון: ${c.score}% · תאריך: ${c.date}`, $('#acCopyBox'));
  });
  return { html, bind, highlight };
})();

/* =====================================================================
   p11 · MeterSim – סימולטור מולטימטר על המודל
   המשתמש בוחר מצב, מניח חודים על נקודות (או לוחץ על רכיב בתלת-ממד),
   משנה את מצב הכלי ומקבל קריאה. כולל טעויות נפוצות (Ω במעגל חי,
   מד זרם במקביל למקור) ותרגיל ״מצאו את התקלה״. מתח לפי הדגם שנבחר.
   ===================================================================== */
const MeterSim = (() => {
  const MODES = [['v20', 'V⎓ 20'], ['v200', 'V⎓ 200'], ['ohm', 'Ω 200'], ['cont', 'רציפות'], ['amp', 'A 10']];
  const st = { mode: 'v200', red: 'bat+', black: 'bat-', on: false, thr: 0, hall: 0, brake: false, pedal: false, fault: null, drill: false, blown: false, active: false };
  const FAULTS = [
    { id: '5v_short', name: 'קצר בקו ה-5V', needs: [] },
    { id: 'hallB', name: 'חיישן Hall B תקוע', needs: ['motor'] },
    { id: 'thr_stuck', name: 'מצערת לא מגיבה', needs: ['throttle'] },
    { id: 'brake_stuck', name: 'חיישן בלם תקוע ״לחוץ״', needs: ['brakes'] },
    { id: 'phaseV_open', name: 'פאזה V קרועה', needs: ['motor'] },
    { id: 'conn_power', name: 'מחבר הספק עם התנגדות', needs: [] }
  ];
  const has = c => vehicleComps().includes(c);
  function points() {
    const P = [
      { id: 'bat+', label: 'סוללה + (מחבר הספק)', comp: 'battery', bundle: 'power', net: 'bat+' },
      { id: 'bat-', label: 'סוללה − (מחבר הספק)', comp: 'battery', bundle: 'power', net: 'gnd' },
      { id: 'ctrl+', label: 'כניסת בקר + (Back-probe)', comp: 'controller', bundle: 'power', net: 'ctrl+' },
      { id: 'ctrl-', label: 'כניסת בקר −', comp: 'controller', bundle: 'power', net: 'gnd' },
      { id: 'disp+', label: 'צג V+ (אדום)', comp: 'display', bundle: 'display', net: 'ctrl+' },
      { id: 'dispK', label: 'צג הדלקה (כחול)', comp: 'display', bundle: 'display', net: 'dispK' },
      { id: 'gnd', label: 'GND חיישנים (שחור)', comp: has('throttle') ? 'throttle' : 'motor', bundle: has('throttle') ? 'throttle' : 'hall', net: 'gnd' }
    ];
    if (has('throttle')) P.push({ id: '5v', label: 'מצערת 5V (אדום)', comp: 'throttle', bundle: 'throttle', net: '5v' }, { id: 'thr', label: 'מצערת אות (ירוק)', comp: 'throttle', bundle: 'throttle', net: 'thr' });
    else if (has('pas')) P.push({ id: '5v', label: 'PAS 5V (אדום)', comp: 'pas', bundle: 'pas', net: '5v' });
    if (has('pas')) P.push({ id: 'pas', label: 'PAS אות', comp: 'pas', bundle: 'pas', net: 'pas' });
    if (has('brakes')) P.push({ id: 'brk', label: 'בלם שמאל – אות', comp: 'brakes', bundle: 'brakeL', net: 'brk' });
    if (has('motor')) P.push(
      { id: 'hA', label: 'Hall A (צהוב)', comp: 'motor', bundle: 'hall', net: 'hA' }, { id: 'hB', label: 'Hall B (ירוק)', comp: 'motor', bundle: 'hall', net: 'hB' }, { id: 'hC', label: 'Hall C (כחול)', comp: 'motor', bundle: 'hall', net: 'hC' },
      { id: 'pU', label: 'פאזה U (צד המנוע)', comp: 'motor', bundle: 'phase', net: 'pU' }, { id: 'pV', label: 'פאזה V (צד המנוע)', comp: 'motor', bundle: 'phase', net: 'pV' }, { id: 'pW', label: 'פאזה W (צד המנוע)', comp: 'motor', bundle: 'phase', net: 'pW' },
      { id: 'axle', label: 'ציר המנוע (מתכת)', comp: 'motor', bundle: null, net: 'axle' });
    return P;
  }
  const pt = id => points().find(p => p.id === id) || points()[0];
  const HALL = ['101', '100', '110', '010', '011', '001'];
  function vbat() { return Math.round(BR().s * 3.87 * 10) / 10; }
  /** פוטנציאל של רשת (V ביחס ל-GND). null = צף / לא מוגדר */
  function pot(net) {
    const V = vbat(), on = st.on, f = st.fault;
    switch (net) {
      case 'gnd': case 'axle': return 0;
      case 'bat+': return V;
      case 'ctrl+': return f === 'conn_power' ? Math.round((V - (on ? 2.6 : 0.4)) * 10) / 10 : V;
      case 'dispK': return on ? (f === 'conn_power' ? V - 2.6 : V) : 0;
      case '5v': return on ? (f === '5v_short' ? 0.41 : 5.02) : 0;
      case 'thr': if (!on) return 0; if (f === '5v_short') return 0.05; if (f === 'thr_stuck') return 0.02; return Math.round((0.83 + st.thr / 100 * 3.37) * 100) / 100;
      case 'brk': if (!on) return 0; if (f === '5v_short') return 0.4; return (st.brake || f === 'brake_stuck') ? 0.02 : 4.98;
      case 'pas': if (!on) return 0; if (f === '5v_short') return 0.1; return st.pedal ? 4.93 : 0.03;
      case 'hA': case 'hB': case 'hC': {
        if (!on) return 0; if (f === '5v_short') return 0.2;
        const bit = HALL[st.hall % 6]['ABC'.indexOf(net[1])];
        if (f === 'hallB' && net === 'hB') return 0.01;
        return bit === '1' ? 4.96 : 0.04;
      }
      case 'pU': case 'pV': case 'pW': return null;
      default: return null;
    }
  }
  function ohm(a, b) {
    if (a === b) return 0;
    const phases = ['pU', 'pV', 'pW'];
    if (phases.includes(a) && phases.includes(b)) return (st.fault === 'phaseV_open' && (a === 'pV' || b === 'pV')) ? Infinity : 0.31;
    const g = ['gnd', 'axle'];
    if ((phases.includes(a) && b === 'axle') || (phases.includes(b) && a === 'axle')) return Infinity;
    if (g.includes(a) && g.includes(b)) return a === b ? 0 : Infinity;
    if ((a === 'brk' && b === 'gnd') || (a === 'gnd' && b === 'brk')) return (st.brake || st.fault === 'brake_stuck') ? 0.1 : Infinity;
    if ((a === 'ctrl+' && b === 'bat+') || (a === 'bat+' && b === 'ctrl+')) return st.fault === 'conn_power' ? 0.9 : 0.02;
    if ((a === '5v' && b === 'gnd') || (a === 'gnd' && b === '5v')) return st.fault === '5v_short' ? 12 : Infinity;
    return Infinity;
  }
  function read() {
    const a = pt(st.red), b = pt(st.black), m = st.mode;
    const src = n => n === 'bat+' || n === 'ctrl+' || (st.on && pot(n) != null && Math.abs(pot(n)) > 0.5);
    if (m === 'amp') {
      if (st.blown) return { lcd: 'FUSE', unit: '', msg: '💥 קצר! מד במצב זרם הוא כמעט חוט – חיבור במקביל למקור מתח שורף את הנתיך. מודדים זרם רק בטור, ולזרם הנעה משתמשים במד צבת. במציאות מחליפים נתיך באותו דירוג.', cls: 'bad' };
      const va = pot(a.net), vb = pot(b.net);
      if ((va != null && vb != null && Math.abs(va - vb) > 0.5) || src(a.net) || src(b.net)) {
        st.blown = true;
        return { lcd: 'FUSE', unit: '', msg: '💥 קצר! מד במצב זרם הוא כמעט חוט. חיבור במקביל למקור מתח = קצר, נתיך שרוף וסכנת כוויה. מודדים זרם רק בטור – ולזרם הנעה משתמשים במד צבת.', cls: 'bad' };
      }
      return { lcd: '0.00', unit: 'A', msg: 'אין זרם במסלול הזה.', cls: '' };
    }
    if (m === 'ohm' || m === 'cont') {
      if ((a.net === 'bat+' || b.net === 'bat+') && (a.net !== b.net)) return { lcd: 'Err', unit: '', msg: 'מדידת התנגדות על מקור מתח (הסוללה) נותנת תוצאה שגויה ועלולה להזיק למד. Ω ורציפות – רק על מעגל מנותק ובלי מתח.', cls: 'bad' };
      if (st.on && (src(a.net) || src(b.net))) return { lcd: '----', unit: '', msg: 'המערכת דולקת! מודדים התנגדות ורציפות רק כשהסוללה מנותקת. כבו את ״הפעלה״.', cls: 'bad' };
      const r = ohm(a.net, b.net);
      if (m === 'cont') return r < 20 ? { lcd: r < 1 ? r.toFixed(2) : r.toFixed(1), unit: 'Ω 🔊', msg: 'צפצוף – יש רציפות.', cls: 'ok', beep: true } : { lcd: 'OL', unit: '', msg: 'אין רציפות.', cls: '' };
      return { lcd: r === Infinity ? 'OL' : r.toFixed(2), unit: r === Infinity ? '' : 'Ω', msg: r === Infinity ? 'OL = אין חיבור (התנגדות גבוהה מהטווח).' : '', cls: '' };
    }
    const va = pot(a.net), vb = pot(b.net);
    if (va == null || vb == null) return { lcd: st.on ? '~' + (vbat() / 2).toFixed(0) : '0.0', unit: 'V', msg: 'פאזות צפות: בלי סיבוב המתח עליהן לא יציב ואין לו משמעות. את הפאזות בודקים בהתנגדות, עם מחבר מנותק.', cls: '' };
    const v = va - vb, lim = m === 'v20' ? 20 : 200;
    if (Math.abs(v) >= lim) return { lcd: 'OL', unit: '', msg: `המתח גבוה מהטווח (${lim}V). העבירו לטווח גבוה יותר.`, cls: 'warn' };
    const s = Math.abs(v) < 20 ? v.toFixed(2) : v.toFixed(1);
    return { lcd: s, unit: 'V', msg: v < -0.5 ? 'ערך שלילי = החודים הפוכים. זה לא מזיק במדידת מתח.' : (Math.abs(v) >= DATA.pro.hvThreshold ? '⚠️ מתח מעל 60V – מסוכן במגע.' : ''), cls: v < -0.5 ? 'warn' : '' };
  }
  function lcdHTML() {
    const r = read();
    return `<div class="sim-lcd" aria-live="polite" aria-label="קריאה: ${esc(r.lcd + ' ' + r.unit)}">${esc(r.lcd)}<small>${esc(r.unit)}</small></div>
      <p class="sim-msg ${r.cls === 'bad' ? 'mistake' : r.cls === 'ok' ? 'verify' : r.cls === 'warn' ? 'mistake' : 'foot'}">${esc(r.msg || ' ')}</p>`;
  }
  function html() {
    const P = points();
    if (!P.some(p => p.id === st.red)) st.red = 'bat+';
    if (!P.some(p => p.id === st.black)) st.black = 'bat-';
    const opts = sel => P.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
    const faults = FAULTS.filter(f => f.needs.every(has));
    return `<div class="card sim" id="simBox" aria-label="סימולטור מולטימטר">
      <div class="spread"><h3>🔧 סימולטור מולטימטר · <bdi>${esc(M().short)}</bdi></h3><span class="foot num">${BR().nominal}V</span></div>
      <div class="sim-dev">
        <div id="simLcd">${lcdHTML()}</div>
        <div class="sim-dial" role="radiogroup" aria-label="מצב המולטימטר">${MODES.map(([id, n]) => `<button type="button" role="radio" data-sim-mode="${id}" aria-checked="${st.mode === id}" aria-pressed="${st.mode === id}">${n}</button>`).join('')}</div>
        <div class="sim-probes">
          <label class="field r"><span class="lbl">🔴 חוד אדום</span><select class="input" id="simRed">${opts(st.red)}</select></label>
          <label class="field"><span class="lbl">⚫ חוד שחור</span><select class="input" id="simBlack">${opts(st.black)}</select></label>
        </div>
      </div>
      <div class="sim-state" role="group" aria-label="מצב הכלי">
        <button type="button" class="btn sm choice" data-sim="on" aria-pressed="${st.on}">הפעלה (צג דולק)</button>
        ${has('motor') ? '<button type="button" class="btn sm" data-sim="hall">סיבוב גלגל איטי ⟳</button>' : ''}
        ${has('brakes') ? `<button type="button" class="btn sm choice" data-sim="brake" aria-pressed="${st.brake}">ידית בלם לחוצה</button>` : ''}
        ${has('pas') ? '<button type="button" class="btn sm" data-sim="pedal">סיבוב פדל ⟳</button>' : ''}
        ${st.blown ? '<button type="button" class="btn sm" data-sim="fuse">החלפת נתיך במד</button>' : ''}
      </div>
      ${has('throttle') ? `<label class="field"><span class="lbl">מצערת: <b id="simThrV" class="num">${st.thr}%</b></span><input type="range" id="simThr" min="0" max="100" step="5" value="${st.thr}" aria-label="פתיחת מצערת באחוזים"></label>` : ''}
      <p class="foot beg-only">טיפ: לחצו על רכיב במודל התלת-ממדי כדי להניח עליו את החוד האדום.</p>
      <details class="concept" ${st.drill ? 'open' : ''}><summary>תרגיל: מצאו את התקלה הנסתרת</summary><div class="body">
        <p>המערכת תבחר תקלה אקראית. מדדו, והחליטו מה התקול.</p>
        <div class="row"><button type="button" class="btn sm primary" data-sim="drill">${st.drill ? 'תקלה חדשה' : 'התחלת תרגיל'}</button>${st.drill ? '<button type="button" class="btn sm ghost" data-sim="undrill">סיום תרגיל</button>' : ''}</div>
        ${st.drill ? `<label class="field"><span class="lbl">מה התקול?</span><select class="input" id="simGuess"><option value="">בחרו…</option>${faults.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></label><p id="simGuessOut" class="foot" aria-live="polite"></p>` : ''}
      </div></details>
    </div>`;
  }
  function update() {
    const l = $('#simLcd'); if (l) l.innerHTML = lcdHTML();
    $$('[data-sim-mode]').forEach(b => { const on = b.dataset.simMode === st.mode; b.setAttribute('aria-checked', String(on)); b.setAttribute('aria-pressed', String(on)); });
    $$('[data-sim="on"]').forEach(b => b.setAttribute('aria-pressed', String(st.on)));
    $$('[data-sim="brake"]').forEach(b => b.setAttribute('aria-pressed', String(st.brake)));
    const p = pt(st.red);
    Scene.select(p.comp && p.comp !== 'frame' ? p.comp : null, false);
    Scene.highlightBundle(p.bundle && bundleById(p.bundle) ? p.bundle : null);
  }
  function rebuild() { const box = $('#simBox'); if (!box) return; const tmp = document.createElement('div'); tmp.innerHTML = html(); box.replaceWith(tmp.firstElementChild); bind(); }
  function bind() {
    const box = $('#simBox'); if (!box) return;
    st.active = true;
    window.PickHook = compId => {
      if (!st.active || !$('#simBox')) return false;
      const p = points().find(x => x.comp === compId);
      if (!p) { UI.toast('אין נקודת מדידה ברכיב הזה בסימולטור'); return true; }
      st.red = p.id; const s = $('#simRed'); if (s) s.value = p.id;
      update(); UI.toast('החוד האדום: ' + p.label);
      return true;
    };
    box.addEventListener('click', e => {
      const md = e.target.closest('[data-sim-mode]');
      if (md) { st.mode = md.dataset.simMode; update(); if (st.blown && !$('[data-sim="fuse"]')) rebuild(); return; }
      const b = e.target.closest('[data-sim]'); if (!b) return;
      const a = b.dataset.sim;
      if (a === 'on') st.on = !st.on;
      else if (a === 'hall') st.hall = (st.hall + 1) % 6;
      else if (a === 'brake') st.brake = !st.brake;
      else if (a === 'pedal') st.pedal = !st.pedal;
      else if (a === 'fuse') { st.blown = false; rebuild(); return; }
      else if (a === 'drill') { const fs = FAULTS.filter(f => f.needs.every(has)); st.fault = fs[Math.floor(Math.random() * fs.length)].id; st.drill = true; rebuild(); UI.toast('תקלה נסתרת נבחרה. בהצלחה!'); return; }
      else if (a === 'undrill') { st.fault = null; st.drill = false; rebuild(); return; }
      update();
      if (st.blown && !$('[data-sim="fuse"]')) rebuild();
    });
    const r = $('#simRed'), k = $('#simBlack');
    r.addEventListener('change', () => { st.red = r.value; update(); if (st.blown && !$('[data-sim="fuse"]')) rebuild(); });
    k.addEventListener('change', () => { st.black = k.value; update(); if (st.blown && !$('[data-sim="fuse"]')) rebuild(); });
    const th = $('#simThr'); if (th) th.addEventListener('input', () => { st.thr = Number(th.value); $('#simThrV').textContent = st.thr + '%'; update(); });
    const g = $('#simGuess'); if (g) g.addEventListener('change', () => {
      if (!g.value) return;
      const ok = g.value === st.fault, f = FAULTS.find(x => x.id === st.fault);
      $('#simGuessOut').innerHTML = ok ? `<span class="verify">✓ נכון! ${esc(f.name)}.</span>` : '<span class="mistake">✗ עדיין לא. המשיכו למדוד – השוו לערכים התקינים.</span>';
    });
    update();
  }
  function detach() { st.active = false; if (window.PickHook) window.PickHook = null; }
  return { html, bind, detach, active: () => st.active && !!$('#simBox') };
})();

/* =====================================================================
   p12 · Tools – כלים לטכנאים (לשונית ״כלים״)
   מחשבונים, יומן תיקונים (localStorage + ייצוא/ייבוא JSON + דו״ח ללקוח),
   השוואת דגמים ורכיבים חלופיים, בדיקת עקביות מפרט, סימולטור, מצב סדנה.
   ===================================================================== */
const Tools = (() => {
  const SUBS = [['calc', 'מחשבונים'], ['log', 'יומן תיקונים'], ['cmp', 'השוואה ותאימות'], ['spec', 'בדיקת מפרט'], ['sim', 'סימולטור'], ['shop', 'מצב סדנה'], ['data', 'גיבוי ופרטיות']];
  let sub = null, editId = null, delArm = null, printId = null;
  const num = id => { const e = $('#' + id); if (!e) return NaN; const v = Sec.num(e.value, e.min !== '' ? Number(e.min) : -Infinity, e.max !== '' ? Number(e.max) : Infinity); return v === null ? NaN : v; };
  const f1 = x => (Math.round(x * 10) / 10).toString();
  const out = (id, h) => { const e = $('#' + id); if (e) e.innerHTML = h; };
  const kmOf = s => { const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*(?:–|-)?\s*(\d+(?:\.\d+)?)?\s*ק״מ/); return m ? Number(m[2] || m[1]) : null; };
  const catDefaultWhKm = m => m.cat === 'ebike' ? 12 : (m.voltage >= 60 ? 22 : 15);

  function subtabs() {
    return `<div class="subtabs" role="tablist" aria-label="כלים">${SUBS.map(([id, n]) => `<button type="button" role="tab" aria-selected="${sub === id}" data-action="tl-sub" data-sub="${id}">${n}</button>`).join('')}</div>`;
  }
  const field = (id, label, val, attrs = '') => `<div class="field"><label for="${id}">${label}</label><input class="input num" id="${id}" type="number" inputmode="decimal" value="${esc(val)}" ${/min=/.test(attrs) ? '' : 'min="0"'} ${/max=/.test(attrs) ? '' : 'max="100000"'} ${attrs}></div>`;

  /* ---------- מחשבונים ---------- */
  function calcHTML() {
    const m = M(), b = BR(), amps = m.controllerAmpsNum;
    const vOpts = sel => DATA.batteryTable.map(r => `<option value="${r.nominal}" ${r.nominal === sel ? 'selected' : ''}>${r.nominal}V (${r.s}S)</option>`).join('');
    return `<p class="lead">ערכי ברירת המחדל לקוחים מהדגם <bdi>${esc(m.short)}</bdi>. אפשר לשנות כל שדה.</p>
      <details class="concept" open><summary>טווח משוער</summary><div class="body"><div class="tool-grid">
        ${field('cRWh', 'אנרגיה (Wh)', m.wh)}${field('cRC', 'צריכה (Wh לק״מ)', catDefaultWhKm(m), 'step="0.5"')}${field('cRRes', 'מרווח ביטחון (%)', 15)}${field('cRSoh', 'בריאות סוללה (%)', 100)}
      </div><div class="out-box" id="cROut"></div></div></details>
      <details class="concept"><summary>זמן טעינה</summary><div class="body"><div class="tool-grid">
        ${field('cTAh', 'קיבולת (Ah)', m.ah, 'step="0.1"')}${field('cTA', 'זרם מטען (A)', 2, 'step="0.5"')}${field('cTFrom', 'מ-(%)', 10)}${field('cTTo', 'עד (%)', 100)}
      </div><div class="out-box" id="cTOut"></div></div></details>
      <details class="concept"><summary>צניחת מתח והתנגדות פנימית</summary><div class="body"><div class="tool-grid">
        ${field('cSRest', 'מתח במנוחה (V)', b.nominal + 2, 'step="0.1"')}${field('cSLoad', 'מתח תחת עומס (V)', b.nominal - 2, 'step="0.1"')}${field('cSI', 'זרם בעומס (A) – אם ידוע', amps || '', 'step="0.5"')}
      </div><div class="out-box" id="cSOut"></div></div></details>
      <details class="concept"><summary>הספק, מתח וזרם</summary><div class="body"><div class="tool-grid">
        ${field('cPV', 'מתח (V)', b.nominal)}${field('cPA', 'זרם (A)', amps || 15, 'step="0.5"')}${field('cPW', 'או: הספק רצוי (W)', 250)}
      </div><div class="out-box" id="cPOut"></div></div></details>
      <details class="concept"><summary>התאמת סוללה חלופית</summary><div class="body">
        <p class="lead" data-sx="s29">מזינים את נתוני הסוללה המוצעת ומשווים לדגם. מארז שלם בלבד – לא בונים ולא פותחים סוללות.</p>
        <div class="tool-grid">
          <div class="field"><label for="cBV">מתח נומינלי</label><select class="input" id="cBV">${vOpts(m.voltage)}</select></div>
          ${field('cBAh', 'קיבולת (Ah)', m.ah, 'step="0.1"')}${field('cBA', 'זרם רציף BMS (A)', 25, 'step="1"')}
          <div class="field"><label for="cBConn">מחבר ומתקן</label><select class="input" id="cBConn"><option value="same">זהים למקורי</option><option value="diff">שונים</option><option value="unk">לא ידוע</option></select></div>
        </div><div class="out-box" id="cBOut"></div></div></details>
      <details class="concept"><summary>מחשבון XsYp (תיאורטי)</summary><div class="body">
        <div class="note warn">${ICON.warn}<span>חישוב להבנת מספרים בלבד. אין במעבדה הדרכה להרכבת סוללות או לעבודה על תאים.</span></div>
        <div class="tool-grid">${field('cXS', 'תאים בטור (S)', b.s)}${field('cXP', 'תאים במקביל (P)', 4)}${field('cXV', 'מתח נומינלי לתא (V)', 3.6, 'step="0.05"')}${field('cXAh', 'קיבולת תא (Ah)', 3.5, 'step="0.1"')}${field('cXA', 'זרם מרבי לתא (A)', 10, 'step="1"')}</div>
        <div class="out-box" id="cXOut"></div></div></details>`;
  }
  function updCalc() {
    const m = M();
    // טווח
    { const wh = num('cRWh'), c = num('cRC'), r = num('cRRes'), h = num('cRSoh');
      if ([wh, c, r, h].every(isFinite) && c > 0) {
        const km = wh * (h / 100) * (1 - r / 100) / c, claimed = kmOf(m.range);
        out('cROut', `<span>טווח משוער: <b>${Math.round(km)} ק״מ</b></span><span class="foot">(${f1(wh * h / 100)}Wh זמינים × ${100 - r}% ÷ ${c}Wh/ק״מ)</span>${claimed ? `<span class="foot">היצרן/המשווק מציין: ${claimed} ק״מ ${Conf.badge(m.dataConfidence.range)} ← ${f1(wh / claimed)}Wh/ק״מ${wh / claimed < 8 ? ' – אופטימי' : ''}</span>` : ''}`);
      } }
    // טעינה
    { const ah = num('cTAh'), a = num('cTA'), fr = num('cTFrom'), to = num('cTTo');
      if ([ah, a, fr, to].every(isFinite) && a > 0 && to > fr) {
        const ccTo = Math.min(to, 80), cc = ah * (ccTo - fr) / 100 / a / 0.92, cv = to > 80 ? (to - 80) / 20 * 1.2 : 0;
        out('cTOut', `<span>זמן משוער: <b>${f1(cc + cv)} שעות</b></span><span class="foot">שלב זרם קבוע (CC) ${f1(cc)} ש׳ + שלב מתח קבוע (CV) ${f1(cv)} ש׳. מתח מטען: ${BR().full.toFixed(1)}V.</span>${a > ah * 0.5 ? '<span class="verdict warn">⚠️ זרם טעינה מעל 0.5C – ודאו שהסוללה והמטען מאושרים לכך.</span>' : ''}`);
      } }
    // צניחה
    { const r = num('cSRest'), l = num('cSLoad'), i = num('cSI');
      if (isFinite(r) && isFinite(l) && r > 0) {
        const d = (r - l) / r * 100, dv = r - l;
        const v = d < 10 ? ['ok', '✅ צניחה תקינה'] : d < 20 ? ['warn', '⚠️ צניחה גבוהה – סוללה מזדקנת או מחבר עם התנגדות'] : ['bad', '⛔ צניחה חמורה – בדיקת סוללה במעבדה, אל תעקפו BMS'];
        out('cSOut', `<span>צניחה: <b>${f1(d)}% (${f1(dv)}V)</b></span>${isFinite(i) && i > 0 ? `<span>התנגדות כוללת משוערת: <b>${Math.round(dv / i * 1000)} mΩ</b> · הפסד חום: <b>${Math.round(dv * i)}W</b></span>` : ''}<span class="verdict ${v[0]}">${v[1]}</span>`);
      } }
    // הספק
    { const v = num('cPV'), a = num('cPA'), w = num('cPW');
      out('cPOut', `${isFinite(v) && isFinite(a) ? `<span>${v}V × ${a}A = <b>${Math.round(v * a)}W</b> (שיא בכניסת הבקר)</span>` : ''}${isFinite(w) && isFinite(v) && v > 0 ? `<span>${w}W ב-${v}V ← <b>${f1(w / v)}A</b></span>` : ''}<span class="foot">הספק נומינלי במנוע ≠ הספק שיא בבקר. בישראל ובאירופה אופניים חשמליים: 250W נומינלי.</span>`); }
    // סוללה חלופית
    { const V = Number($('#cBV').value), ah = num('cBAh'), bms = num('cBA'), conn = $('#cBConn').value, ca = m.controllerAmpsNum;
      const rows = [];
      rows.push(V === m.voltage ? ['ok', `✅ מתח ${V}V זהה לדגם`] : ['bad', `⛔ מתח ${V}V שונה מ-${m.voltage}V – לא תואם (סכנה לבקר, ועלול להיות לא חוקי)`]);
      if (isFinite(bms)) rows.push(ca ? (bms >= ca ? ['ok', `✅ BMS ${bms}A ≥ בקר ${ca}A`] : ['bad', `⛔ BMS ${bms}A < בקר ${ca}A – ניתוקים תחת עומס`]) : ['warn', `⚠️ זרם הבקר בדגם לא פורסם ❓ – ודאו מול תווית הבקר שהוא ≤ ${bms}A`]);
      rows.push(conn === 'same' ? ['ok', '✅ מחבר ומתקן זהים'] : conn === 'diff' ? ['bad', '⛔ מחבר/מתקן שונים – אין לאלתר מתאמים בקו ההספק'] : ['warn', '⚠️ מחבר לא ידוע – בדקו לפני קנייה']);
      const cb = battRow(V); rows.push(cb ? ['ok', `ℹ️ מטען נדרש: ${cb.full.toFixed(1)}V${V !== m.voltage ? ' – המטען המקורי לא מתאים!' : ' – המטען המקורי מתאים'}`] : ['warn', 'מתח לא מוכר']);
      if (isFinite(ah)) { const nwh = Math.round(V * ah); rows.push(['ok', `ℹ️ ${nwh}Wh (${nwh >= m.wh ? '+' : ''}${Math.round((nwh / m.wh - 1) * 100)}% מול המקורי ${m.wh}Wh)`]); }
      const bad = rows.some(r => r[0] === 'bad'), warn = rows.some(r => r[0] === 'warn');
      out('cBOut', rows.map(r => `<span class="verdict ${r[0]}">${esc(r[1])}</span>`).join('') + `<span><b>${bad ? '⛔ לא תואם' : warn ? '⚠️ דורש בדיקה' : '✅ תואם לפי הנתונים'}</b></span><span class="foot">${esc(DATA.meta.batteryNote)}</span>`); }
    // XsYp
    { const S = num('cXS'), Pp = num('cXP'), cv = num('cXV'), cah = num('cXAh'), ca = num('cXA');
      if ([S, Pp, cv, cah, ca].every(isFinite) && S > 0 && Pp > 0) {
        const nom = S * cv, cls = DATA.batteryTable.reduce((a, r) => Math.abs(r.s - S) < Math.abs(a.s - S) ? r : a);
        out('cXOut', `<span>${S}S${Pp}P · ${S * Pp} תאים</span><span>נומינלי <b>${f1(nom)}V</b> · מלאה <b>${f1(S * 4.2)}V</b> · ריקה ≈ <b>${f1(S * 3.0)}V</b></span><span>קיבולת <b>${f1(Pp * cah)}Ah</b> · אנרגיה <b>${Math.round(nom * Pp * cah)}Wh</b> · זרם מרבי ≈ <b>${f1(Pp * ca)}A</b></span><span class="foot">הכי קרוב לסוללת ${cls.nominal}V (${cls.s}S).</span>`);
      } }
  }

  /* ---------- יומן תיקונים ---------- */
  function logHTML() {
    if (Persist.isLocked()) return DataUI.lockedCard('היומן');
    const items = RepairLog.all(), r = editId ? items.find(x => x.id === editId) : null;
    const v = k => esc(r ? r[k] : (k === 'model' ? State.model : ''));
    const mOpts = Object.keys(DATA.models).map(id => `<option value="${id}" ${(r ? r.model : State.model) === id ? 'selected' : ''}>${esc(DATA.models[id].short)}</option>`).join('');
    return `<p class="lead">יומן לכל כלי שמגיע לתיקון. נשמר רק בדפדפן הזה – ייצאו JSON לגיבוי או להעברה למכשיר אחר.</p>
      <form class="card stack" id="logForm" autocomplete="off"><h3>${r ? 'עריכת רשומה' : 'רשומה חדשה'}</h3>
        <div class="tool-grid">
          <div class="field"><label for="lgCust">לקוח</label><input class="input" id="lgCust" maxlength="120" value="${v('customer')}"></div>
          <div class="field"><label for="lgModel">דגם</label><select class="input" id="lgModel">${mOpts}</select></div>
          <div class="field"><label for="lgSerial">מספר סידורי</label><input class="input" id="lgSerial" maxlength="60" value="${v('serial')}"></div>
          <div class="field"><label for="lgStatus">סטטוס</label><select class="input" id="lgStatus">${['פתוח', 'בטיפול', 'ממתין לחלק', 'הסתיים'].map(s => `<option ${((r && r.status) || 'פתוח') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label for="lgSym">תלונה / סימפטומים</label><textarea class="input" id="lgSym" rows="2" maxlength="2000">${v('symptoms')}</textarea></div>
        <div class="field"><label for="lgMeas">מדידות</label><textarea class="input" id="lgMeas" rows="2" maxlength="4000" placeholder="למשל: סוללה 51.2V, 5V=4.98V, פאזות 0.3/0.3/0.31Ω">${v('measurements')}</textarea></div>
        <div class="field"><label for="lgRep">מה הוחלף</label><input class="input" id="lgRep" maxlength="1000" value="${v('replaced')}"></div>
        <div class="field"><label for="lgNotes">הערות</label><textarea class="input" id="lgNotes" rows="2" maxlength="4000">${v('notes')}</textarea></div>
        <div class="row"><button type="submit" class="btn primary">${r ? 'שמירת שינויים' : 'הוספה ליומן'}</button>${r ? '<button type="button" class="btn ghost" data-action="lg-cancel">ביטול</button>' : ''}</div>
      </form>
      <div class="stack"><div class="spread"><h3>רשומות (${items.length})</h3>
        <div class="row"><button type="button" class="btn sm" data-action="lg-export" ${items.length ? '' : 'disabled'}>ייצוא JSON</button><button type="button" class="btn sm ghost" data-action="lg-import">ייבוא</button></div></div>
        <textarea class="input copybox" id="lgBox" hidden rows="8" aria-label="JSON להעתקה או להדבקה"></textarea>
        <div id="lgImportBox" hidden class="card stack"><div class="field"><label for="lgFile">קובץ JSON</label><input class="input" id="lgFile" type="file" accept="application/json,.json"></div>
          <div class="field"><label for="lgPaste">או הדביקו JSON</label><textarea class="input copybox" id="lgPaste" rows="5"></textarea></div>
          <label class="check" for="lgMerge" data-sx="s33"><input type="checkbox" id="lgMerge" checked data-sx="s34"><span>מיזוג עם הרשומות הקיימות (בלי למחוק)</span></label>
          <pre class="import-err" id="lgErr" hidden role="alert"></pre>
          <button type="button" class="btn primary" data-action="lg-doimport">ייבוא</button></div>
        ${items.length ? items.map(x => `<div class="card log-item">
          <div class="spread"><b>${esc(x.customer || 'ללא שם')} · <bdi>${esc((DATA.models[x.model] || {}).short || x.modelName)}</bdi></b><span class="status">${esc(x.status)}</span></div>
          <span class="meta num">${esc(x.date)}${x.serial ? ' · מס״ד ' + esc(x.serial) : ''}</span>
          ${x.symptoms ? `<span>${esc(x.symptoms)}</span>` : ''}${x.measurements ? `<span class="foot">${esc(x.measurements)}</span>` : ''}${x.replaced ? `<span>הוחלף: ${esc(x.replaced)}</span>` : ''}${x.notes ? `<span class="foot">${esc(x.notes)}</span>` : ''}
          <div class="row"><button type="button" class="btn sm" data-action="lg-edit" data-id="${esc(x.id)}">עריכה</button><button type="button" class="btn sm ghost" data-action="lg-report" data-id="${esc(x.id)}">דו״ח ללקוח</button><button type="button" class="btn sm ghost" data-action="lg-del" data-id="${esc(x.id)}">${delArm === x.id ? 'לחצו שוב למחיקה' : 'מחיקה'}</button></div>
        </div>`).join('') : '<p class="lead">אין רשומות עדיין. אפשר גם לשמור תוצאת אבחון ישירות מלשונית האבחון.</p>'}
      </div>
      ${printId ? reportHTML(items.find(x => x.id === printId)) : ''}`;
  }
  function reportText(x) {
    const mm = DATA.models[x.model] || {};
    return `דו״ח תיקון – מעבדת החיווט\nתאריך: ${x.date}\nלקוח: ${x.customer}\nכלי: ${mm.name || x.modelName}${x.serial ? ' · מס״ד ' + x.serial : ''}\nתלונה: ${x.symptoms}\nמדידות: ${x.measurements}\nהוחלף: ${x.replaced}\nהערות: ${x.notes}\nסטטוס: ${x.status}\n\n${DATA.meta.disclaimer}`;
  }
  function reportHTML(x) {
    if (!x) return '';
    const mm = DATA.models[x.model] || {};
    return `<div class="card stack print-area" id="lgReport"><h3>דו״ח תיקון ללקוח</h3>
      <dl class="specs"><dt>תאריך</dt><dd class="num">${esc(x.date)}</dd><dt>לקוח</dt><dd>${esc(x.customer)}</dd><dt>כלי</dt><dd><bdi>${esc(mm.name || x.modelName)}</bdi>${x.serial ? ' · מס״ד ' + esc(x.serial) : ''}</dd>
      <dt>תלונה</dt><dd>${esc(x.symptoms)}</dd><dt>מדידות</dt><dd>${esc(x.measurements)}</dd><dt>הוחלף</dt><dd>${esc(x.replaced)}</dd><dt>הערות</dt><dd>${esc(x.notes)}</dd><dt>סטטוס</dt><dd>${esc(x.status)}</dd></dl>
      <p class="foot">${esc(DATA.meta.disclaimer)}</p>
      <div class="row">${IN_FRAME ? '' : '<button type="button" class="btn sm primary" data-action="lg-print">הדפסה</button>'}<button type="button" class="btn sm" data-action="lg-copyrep" data-id="${esc(x.id)}">העתקת הדו״ח</button><button type="button" class="btn sm ghost" data-action="lg-closerep">סגירה</button></div>
      <textarea class="input copybox" id="lgRepBox" hidden rows="6" readonly aria-label="דו״ח להעתקה"></textarea></div>`;
  }
  function bindLog() {
    if (!$('#logForm')) return;
    $('#logForm').addEventListener('submit', e => {
      e.preventDefault();
      const rec = { customer: $('#lgCust').value.trim(), model: $('#lgModel').value, modelName: (DATA.models[$('#lgModel').value] || {}).name, serial: $('#lgSerial').value.trim(), status: $('#lgStatus').value, symptoms: $('#lgSym').value.trim(), measurements: $('#lgMeas').value.trim(), replaced: $('#lgRep').value.trim(), notes: $('#lgNotes').value.trim() };
      if (editId) { RepairLog.update(editId, rec); UI.toast('הרשומה עודכנה'); } else { RepairLog.add(rec); UI.toast('נוסף ליומן'); }
      editId = null; render();
    });
    const file = $('#lgFile');
    if (file) file.addEventListener('change', () => {
      const f = file.files && file.files[0]; if (!f) return;
      const rd = new FileReader(); rd.onload = () => { $('#lgPaste').value = String(rd.result || ''); UI.toast('הקובץ נטען – לחצו ״ייבוא״'); }; if (f.size > RepairLog.MAX_BYTES) { UI.toast('הקובץ גדול מדי'); file.value = ''; return; } rd.readAsText(f);
    });
  }

  /* ---------- השוואה ותאימות ---------- */
  function cmpHTML() {
    const ids = Object.keys(DATA.models), m = M(), b = BR();
    const groups = {};
    ids.forEach(id => { const x = DATA.models[id], full = battRow(x.voltage).full.toFixed(1); (groups[full] = groups[full] || []).push(x.short); });
    const has = c => vehicleComps().includes(c);
    const alt = [
      ['בקר', [`${m.voltage}V`, m.controllerAmpsNum ? `עד ${m.controllerAmpsNum}A (כמו המקורי)` : 'זרם לפי תווית הבקר המקורי ❓', `פרוטוקול צג: ${m.displayProtocol ? m.displayProtocol.v : '❓'}`, 'חיישני Hall (או Sensorless עם התנעה פחות חלקה)'], m.displayProtocol ? m.displayProtocol.conf : 'unk'],
      ['מטען', [`${b.full.toFixed(1)}V בדיוק`, `מחבר: ${m.connectors && m.connectors.charge ? m.connectors.charge.v : '❓'}`, 'זרם 2–4A (עד 0.5C)'], m.connectors && m.connectors.charge ? m.connectors.charge.conf : 'unk'],
      ['צג', [`אותו פרוטוקול: ${m.displayProtocol ? m.displayProtocol.v : '❓'}`, `טווח מתח כולל ${m.voltage}V`, `מחבר: ${m.connectors && m.connectors.display ? m.connectors.display.v : '❓'}`], m.displayProtocol ? m.displayProtocol.conf : 'unk']
    ];
    if (has('throttle')) alt.push(['מצערת', ['Hall ליניארי 5V, 3 חוטים', 'אות 0.8–4.2V', 'אותו מחבר'], 'typ']);
    if (has('brakes')) alt.push(['חיישני בלם', ['אותה לוגיקה (NO/NC) כמו הבקר', '2 חוטים (או 3 ל-Hall)', 'אותו מחבר'], 'typ']);
    alt.push(['סוללה', [`${m.voltage}V (${b.s}S)`, m.controllerAmpsNum ? `BMS רציף ≥ ${m.controllerAmpsNum}A` : 'BMS רציף ≥ זרם הבקר ❓', 'אותו מחבר ומתקן', 'מארז שלם בלבד'], 'typ']);
    return `<div class="cmp-wrap"><table class="volt cmp"><caption class="sr-only">השוואת דגמים</caption>
      <thead><tr><th scope="col">דגם</th><th scope="col">מתח</th><th scope="col">Wh</th><th scope="col">מטען</th><th scope="col">בקר</th><th scope="col">מחבר טעינה</th><th scope="col">פרוטוקול צג</th></tr></thead>
      <tbody>${ids.map(id => { const x = DATA.models[id], br = battRow(x.voltage); return `<tr ${id === State.model ? 'aria-current="true"' : ''}>
        <td><button type="button" class="linkbtn" data-action="select-model" data-model="${id}"><bdi>${esc(x.short)}</bdi></button></td>
        <td class="nom">${x.voltage}V ${Conf.badge(x.dataConfidence.battery)}</td><td>${x.wh}</td><td>${br.full.toFixed(1)}V</td>
        <td>${x.controllerAmpsNum ? x.controllerAmpsNum + 'A' : '❓'}${x.controller.count > 1 ? ' ×2' : ''}</td>
        <td class="flagcell">${x.connectors && x.connectors.charge ? esc(x.connectors.charge.v) + ' ' + Conf.badge(x.connectors.charge.conf) : '❓'}</td>
        <td class="flagcell">${x.displayProtocol ? esc(x.displayProtocol.v) + ' ' + Conf.badge(x.displayProtocol.conf) : '❓'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="card stack"><h3>מטענים לפי מתח</h3><p class="lead" data-sx="s29">מטען מתאים רק כשמתח המלאה <b>ומחבר הטעינה</b> זהים. מחברים שסומנו ⚠️/❓ – לאמת לפני שימוש.</p>
        <dl class="specs">${Object.keys(groups).sort((a, c) => a - c).map(k => `<dt class="num">${k}V</dt><dd>${groups[k].map(esc).join(' · ')}</dd>`).join('')}</dl></div>
      <div class="card stack"><h3>רכיבים חלופיים תואמים ל-<bdi>${esc(m.short)}</bdi></h3>
        ${alt.map(([n, crit, c]) => `<div class="esc-row"><b>${n} ${Conf.badge(c)}</b><ul class="bul">${crit.map(x => `<li>${T(x)}</li>`).join('')}</ul></div>`).join('')}
        <div class="note warn">${ICON.warn}<span>${esc(DATA.meta.legalNote)}</span></div></div>`;
  }

  /* ---------- בדיקת מפרט ---------- */
  function specHTML() {
    const ids = Object.keys(DATA.models);
    const rows = ids.map(id => {
      const x = DATA.models[id], br = battRow(x.voltage), issues = [];
      const calc = Math.round(x.voltage * x.ah);
      if (Math.abs(calc - x.wh) / x.wh > 0.03) issues.push(['bad', `Wh=${x.wh} אבל V×Ah=${calc}`]); else issues.push(['ok', `V×Ah=${calc}≈${x.wh}Wh`]);
      if (!br) issues.push(['bad', 'מתח לא תואם לטבלת תאים']);
      const km = kmOf(x.range); if (km) { const whkm = x.wh / km; issues.push([whkm < 8 ? 'warn' : whkm > 40 ? 'warn' : 'ok', `${f1(whkm)}Wh/ק״מ לפי הטווח המוצהר${whkm < 8 ? ' – אופטימי' : ''}`]); }
      const unk = Object.values(x.dataConfidence).filter(c => c === 'unk').length;
      if (unk) issues.push(['warn', `${unk} שדות ❓ לא פורסמו`]);
      (x.specFlags || []).forEach(f => issues.push(['warn', `${f.field}: ${f.issue}`]));
      return { id, x, issues };
    });
    return `<p class="lead">בדיקה אוטומטית של כל 12 הדגמים: התאמת Wh ל-V×Ah, התאמת המתח למספר התאים, סבירות הטווח, ונתונים חסרים או סותרים.</p>
      <div class="stack">${rows.map(r => `<div class="card stack"><div class="spread"><b><bdi>${esc(r.x.short)}</bdi></b><span class="num foot">${r.x.voltage}V · ${r.x.ah}Ah · ${r.x.wh}Wh</span></div>
        <ul class="clean">${r.issues.map(i => `<li class="verdict ${i[0]}"><span aria-hidden="true">${i[0] === 'ok' ? '✅' : i[0] === 'bad' ? '⛔' : '⚠️'}</span><span>${T(i[1])}</span></li>`).join('')}</ul></div>`).join('')}</div>
      ${Conf.legendHTML()}`;
  }

  /* ---------- מצב סדנה ---------- */
  function shopHTML() {
    const on = Level.workshop();
    return `<div class="card stack"><h3>מצב סדנה</h3>
      <p class="lead">טקסט וכפתורים גדולים, כפתורי ״הקודם/הבא״ נצמדים לתחתית – נוח לעבודה ביד אחת, עם כפפות, ומטר מהמסך.</p>
      <button type="button" class="btn ${on ? '' : 'primary'} block" data-action="tl-shop">${on ? 'כיבוי מצב סדנה' : 'הפעלת מצב סדנה'}</button></div>
      <div class="card stack"><h3>טיפים לעבודה ביד אחת</h3><ul class="bul">
        <li>במובייל: משכו את הפאנל למעלה (חצי מסך) – המודל נשאר גלוי.</li>
        <li>באשף: כל שלב נפתח רק אחרי בדיקת אימות. הזינו קריאה והמשיכו.</li>
        <li>במצב ״מקצוען + מהיר״ ההסברים נעלמים ונשארים רק ערכים וכפתורים.</li>
        <li>מקשי מקלדת: חצים לסיבוב המודל, 0 לאיפוס מצלמה, Escape לסגירה.</li></ul></div>`;
  }

  function render() {
    if (sub === null) { sub = ProStore.get('toolsSub', 'calc'); if (!SUBS.some(s => s[0] === sub)) sub = 'calc'; }
    const body = sub === 'data' ? DataUI.html() : sub === 'calc' ? calcHTML() : sub === 'log' ? logHTML() : sub === 'cmp' ? cmpHTML() : sub === 'spec' ? specHTML() : sub === 'sim' ? MeterSim.html() : shopHTML();
    if (sub !== 'sim') MeterSim.detach();
    $('#modeView').innerHTML = `<div><p class="eyebrow">${ICON.tech} כלים · <bdi>${esc(M().short)}</bdi></p><h2>ארגז הכלים של הטכנאי</h2></div>${subtabs()}<div class="stack">${body}</div>`;
    if (sub === 'calc') { $$('#modeView input, #modeView select').forEach(i => i.addEventListener('input', updCalc)); updCalc(); }
    if (sub === 'log') bindLog();
    if (sub === 'data') DataUI.bind();
    if (sub === 'sim') MeterSim.bind(); else { Scene.select(null); Scene.highlightBundle(null); }
    if (printId) { const r = $('#lgReport'); if (r) r.scrollIntoView({ block: 'nearest' }); }
  }
  UI.on('tl-sub', el => { sub = el.dataset.sub; ProStore.set('toolsSub', sub); editId = null; printId = null; render(); $('#panelScroll').scrollTop = 0; });
  UI.on('tl-shop', () => { Level.setWorkshop(!Level.workshop()); render(); });
  UI.on('lg-edit', el => { editId = el.dataset.id; printId = null; render(); $('#panelScroll').scrollTop = 0; });
  UI.on('lg-cancel', () => { editId = null; render(); });
  UI.on('lg-del', el => { if (delArm === el.dataset.id) { RepairLog.remove(el.dataset.id); delArm = null; UI.toast('נמחק'); } else { delArm = el.dataset.id; setTimeout(() => { if (delArm === el.dataset.id) { delArm = null; if (State.mode === 'tools' && sub === 'log') render(); } }, 4000); } render(); });
  UI.on('lg-export', () => { const t = JSON.stringify({ app: 'wiring-lab', type: 'repair-log', version: 1, exported: new Date().toISOString(), items: RepairLog.all() }, null, 1); const box = $('#lgBox'); offerFile('wiring-lab-repair-log.json', t, box); });
  UI.on('lg-import', () => { const b = $('#lgImportBox'); b.hidden = !b.hidden; });
  UI.on('lg-doimport', () => {
    const errBox = $('#lgErr');
    const r = RepairLog.parseImport($('#lgPaste').value);
    if (!r.ok) { if (errBox) { errBox.hidden = false; errBox.textContent = r.errors.slice(0, 8).join('\n') + (r.errors.length > 8 ? `\n…ועוד ${r.errors.length - 8} שגיאות` : ''); } UI.toast('הייבוא נדחה – ראו פירוט'); return; }
    if (errBox) errBox.hidden = true;
    const n = RepairLog.replaceAll(r.items, $('#lgMerge').checked); UI.toast(`יובאו ${n} רשומות`); render();
  });
  UI.on('lg-report', el => { printId = el.dataset.id; render(); });
  UI.on('lg-closerep', () => { printId = null; render(); });
  UI.on('lg-copyrep', el => { const x = RepairLog.all().find(r => r.id === el.dataset.id); if (x) copyText(reportText(x), $('#lgRepBox')); });
  UI.on('lg-print', () => {
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { done(); }
    setTimeout(done, 3000);
  });
  function go(s) { sub = s; ProStore.set('toolsSub', s); editId = null; printId = null; if (State.mode === 'tools') { render(); $('#panelScroll').scrollTop = 0; } else UI.setMode('tools'); }
  return { render, go, restore() {}, onVehicle() { editId = null; } };
})();

/* =====================================================================
   p13 · WizardPlus – שדרוג אשף ההתקנה
   תנאים מקדימים, נקודות ״אל תעשה״, תאימות ומומנטי הידוק לכל תרחיש;
   בדיקת אימות בסוף כל שלב (מדידה מספרית / בחירה / אישור) – כפתור ״הבא״
   נפתח רק אחרי אימות. תרחישים חדשים (סוללה, צמיגים, רפידות) נוספו
   ל-DATA.wizard.scenarios ב-build ומסוננים לפי vehicleComps() כרגיל.
   ===================================================================== */
const WizardPlus = (() => {
  const passed = {};
  const W = () => DATA.pro.wizardExt || {};
  const bw = () => battRow(State.voltage);
  function nT(x) {
    if (typeof x === 'number') return x;
    const b = bw();
    const m = String(x).match(/^\{(V|full|empty)([+-]\d+(?:\.\d+)?)?\}$/);
    if (!m) return Number(x);
    const base = m[1] === 'V' ? b.nominal : m[1] === 'full' ? b.full : b.empty;
    return Math.round((base + (m[2] ? Number(m[2]) : 0)) * 10) / 10;
  }
  function spec(s) { return DATA.pro.wizardVerify[s.title] || { kind: 'check' }; }
  const key = (sc, i) => State.model + ':' + State.voltage + ':' + sc + ':' + i;

  function setupExtra(scenario) {
    const x = W()[scenario]; if (!x) return '';
    const tq = (x.torque || []).map(id => DATA.pro.torqueRef[id]).filter(Boolean);
    const hv = State.voltage >= DATA.pro.hvThreshold;
    return `<div class="card stack"><h3>לפני שמתחילים: ${esc(DATA.wizard.scenarios[scenario].name)}</h3>
      ${hv ? `<div class="note danger">${ICON.warn}<span><b>${State.voltage}V:</b> מתח מסוכן במגע. כל שלב עם ${Safety.liveBadge()} – רק טכנאי עם ציוד מבודד.</span></div>` : ''}
      <div class="sec"><h4>תנאים מקדימים</h4><ul class="bul">${x.prereqs.map(p => `<li>${T(p)}</li>`).join('')}</ul></div>
      <div class="sec" data-sx="s35"><h4>אל תעשו</h4><ul class="bul donts">${x.donts.map(p => `<li>${T(p)}</li>`).join('')}</ul></div>
      ${x.compat && x.compat.length ? `<div class="sec" data-sx="s20"><h4>בדיקת תאימות</h4><ul class="bul">${x.compat.map(p => `<li>${T(p)}</li>`).join('')}</ul></div>` : ''}
      ${tq.length ? `<div class="sec"><h4>מומנטי הידוק</h4><dl class="specs">${tq.map(t => `<dt>${esc(t.part)}</dt><dd class="num">${esc(t.nm)} ${Conf.badge(t.conf)}</dd>`).join('')}</dl></div>` : ''}
    </div>`;
  }
  function stepExtra(scenario, idx, s) {
    const v = spec(s), k = key(scenario, idx), ok = passed[k];
    const cap = !s.live && (s.comp === 'controller' || s.bundle === 'power' || s.bundle === 'phase');
    let input = '';
    if (v.kind === 'num' || v.kind === 'numFree') input = `<label class="field"><span class="lbl">${esc(tpl(v.label))}${v.unit ? ` (${v.unit})` : ''}</span><input class="input num" id="wvIn" inputmode="decimal" autocomplete="off"></label>`;
    else if (v.kind === 'num2') input = `<div class="num3 two"><label class="field"><span class="lbl">במנוחה (V)</span><input class="input num" id="wvIn" inputmode="decimal"></label><label class="field"><span class="lbl">בפתיחה מלאה (V)</span><input class="input num" id="wvIn2" inputmode="decimal"></label></div>`;
    else if (v.kind === 'choice') input = `<div class="choice-row" role="group" aria-label="${esc(v.label)}">${v.options.map((o, i) => `<button type="button" class="btn sm choice" data-wv="${i}" aria-pressed="false">${esc(o)}</button>`).join('')}</div>`;
    else input = `<label class="check" for="wvChk" data-sx="s28"><input type="checkbox" id="wvChk" data-sx="s36" ${ok ? 'checked' : ''}><span>ביצעתי ובדקתי: ${T(s.verify)}</span></label>`;
    const range = v.kind === 'num' ? `צפוי: ${nT(v.min)}–${nT(v.max)}${v.unit}` : v.kind === 'num2' ? `צפוי: ${v.ranges[0][0]}–${v.ranges[0][1]}V / ${v.ranges[1][0]}–${v.ranges[1][1]}V` : '';
    return `${cap ? `<div class="note warn">${ICON.warn}<span>לפני מגע בבקר או במחברי ההספק: המתינו 2 דקות אחרי ניתוק ובדקו שיש 0V (הקבלים שומרים מתח).</span></div>` : ''}
      <div class="verify-box" id="wvBox"><b>בדיקת אימות לפני המשך</b>
        ${v.hint ? `<span class="foot">${T(v.hint)}${range ? ' · ' + esc(range) : ''}</span>` : (range ? `<span class="foot">${esc(range)}</span>` : '')}
        ${input}<span class="vres" id="wvRes" aria-live="polite">${ok ? '✅ אומת' : ''}</span></div>`;
  }
  function bindStep(scenario, idx, s) {
    const v = spec(s), k = key(scenario, idx);
    const next = $('#modeView .navrow .btn.primary');
    const box = $('#wvBox'), res = $('#wvRes');
    const set = (ok, msg, fail) => {
      passed[k] = !!ok;
      if (next) next.disabled = !ok;
      if (res) res.innerHTML = msg || '';
      if (box) box.classList.toggle('fail', !!fail);
    };
    if (next) next.disabled = !passed[k];
    const parse = el => { const n = parseFloat(String(el && el.value || '').replace(',', '.')); return isFinite(n) ? n : null; };
    if (v.kind === 'num' || v.kind === 'numFree') {
      const inp = $('#wvIn');
      inp.addEventListener('input', () => {
        const n = parse(inp); if (n == null) { set(false, ''); return; }
        if (v.kind === 'numFree') { set(true, `✅ נרשם: ${n}${v.unit}. השוו למתח שכתוב על הפנס לפני חיבור.`); return; }
        const lo = nT(v.min), hi = nT(v.max);
        if (n < 0 && lo >= 0) { set(false, '⛔ ערך שלילי: החודים הפוכים – או קוטביות הפוכה במחבר. לא מחברים! בדקו שוב.', true); return; }
        if (n >= lo && n <= hi) set(true, `✅ ${n}${v.unit} בטווח (${lo}–${hi}${v.unit})`);
        else set(false, `⛔ ${n}${v.unit} מחוץ לטווח ${lo}–${hi}${v.unit}. לא ממשיכים – חזרו על השלב או <button type="button" class="linkbtn" data-action="goto-diag">עברו לאבחון</button>.`, true);
      });
    } else if (v.kind === 'num2') {
      const a = $('#wvIn'), b = $('#wvIn2');
      const chk = () => {
        const x = parse(a), y = parse(b); if (x == null || y == null) { set(false, ''); return; }
        const ok1 = x >= v.ranges[0][0] && x <= v.ranges[0][1], ok2 = y >= v.ranges[1][0] && y <= v.ranges[1][1];
        if (ok1 && ok2) set(true, '✅ אות המצערת תקין');
        else set(false, `⛔ ${!ok1 ? (x > v.ranges[0][1] ? 'אות גבוה במנוחה – סכנת האצה! נתקו ובדקו.' : 'אות נמוך במנוחה – בדקו 5V וחיבור.') : 'אות לא מגיע לפתיחה מלאה – מצערת או חיווט.'}`, true);
      };
      a.addEventListener('input', chk); b.addEventListener('input', chk);
    } else if (v.kind === 'choice') {
      $$('#wvBox [data-wv]').forEach(btn => btn.addEventListener('click', () => {
        $$('#wvBox [data-wv]').forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
        const i = Number(btn.dataset.wv);
        if (i === v.pass) set(true, '✅ אומת');
        else set(false, '⛔ לא עובר אימות. אל תמשיכו – תקנו או <button type="button" class="linkbtn" data-action="goto-diag">עברו לאבחון</button>.', true);
      }));
    } else {
      const c = $('#wvChk');
      c.addEventListener('change', () => set(c.checked, c.checked ? '✅ אומת' : ''));
    }
  }
  function reset() { Object.keys(passed).forEach(k => delete passed[k]); }
  return { setupExtra, stepExtra, bindStep, reset };
})();

/* =====================================================================
   p15 · DataUI – גיבוי, שחזור, נעילת PIN, מחוון שמירה, תזכורת גיבוי
   (לשונית כלים ← ״גיבוי ופרטיות״). כל טקסט של משתמש: esc() או textContent.
   ===================================================================== */
const DataUI = (() => {
  let pending = null;          // { data, notes, rows } – גיבוי שנקרא וממתין לאישור
  let lastBackupText = '', pwNeeded = false;
  const fmtTime = t => (t ? new Date(t).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'אף פעם');
  const days = t => (t ? Math.floor((Date.now() - t) / 864e5) : null);
  const BACKEND = { idb: 'IndexedDB – במכשיר הזה בלבד', ls: 'localStorage (IndexedDB לא זמין) – במכשיר הזה בלבד', mem: 'זיכרון זמני בלבד – ייעלם בסגירת הדף' };

  /* ---------- מחוון ״נשמר״ ---------- */
  function initIndicator() {
    const el = $('#saveState'); if (!el) return;
    const upd = s => {
      el.dataset.state = s.locked ? 'locked' : s.state;
      el.textContent = s.locked ? 'נעול' : s.state === 'saving' ? 'שומר…' : s.state === 'error' ? 'לא נשמר' : s.lastSaved ? 'נשמר' : (s.backend === 'mem' ? 'לא נשמר' : 'שמור מקומית');
      el.title = s.locked ? 'הנתונים האישיים מוצפנים. הזינו PIN בלשונית גיבוי ופרטיות.' : s.state === 'error' || s.backend === 'mem' ? 'האחסון המקומי לא זמין – צרו גיבוי כדי לא לאבד נתונים' : 'נשמר במכשיר ' + (s.lastSaved ? fmtTime(s.lastSaved) : '');
    };
    Persist.onChange(upd); upd(Persist.status());
  }

  /* ---------- הודעות עליונות (נעילה, תזכורת גיבוי) ---------- */
  function notice(id, text, actions) {
    const box = $('#notices'); if (!box) return;
    let n = document.getElementById(id);
    if (!n) { n = document.createElement('div'); n.id = id; n.className = 'notice'; box.appendChild(n); }
    n.textContent = '';
    const t = document.createElement('span'); t.className = 'grow'; t.textContent = text; n.appendChild(t);
    actions.forEach(([label, fn, cls]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); n.appendChild(b); });
  }
  const dropNotice = id => { const n = document.getElementById(id); if (n) n.remove(); };
  function refreshNotices() {
    if (Persist.isLocked()) notice('nt-lock', 'היומן והנתונים האישיים נעולים.', [['פתיחה עם PIN', () => Tools.go('data')]]);
    else dropNotice('nt-lock');
    const snooze = Number(ProStore.get('backupSnooze', 0));
    if (Persist.needsBackup() && Date.now() > snooze) {
      const d = days(Persist.status().lastBackup);
      notice('nt-backup', d === null ? 'עוד לא גיביתם את הנתונים. הם שמורים רק במכשיר הזה.' : `עברו ${d} ימים מהגיבוי האחרון.`, [['גבה עכשיו', () => Tools.go('data'), 'primary'], ['בעוד 3 ימים', () => { ProStore.set('backupSnooze', Date.now() + 3 * 864e5); dropNotice('nt-backup'); }, 'ghost']]);
    } else dropNotice('nt-backup');
  }

  /* ---------- לשונית ---------- */
  function lockCard() {
    if (!Vault.ok()) return `<div class="card stack"><h3>נעילת PIN</h3><p class="lead">הדפדפן לא תומך בהצפנה (Web Crypto). פתחו את האפליקציה בכתובת https.</p></div>`;
    if (Persist.isLocked()) return `<div class="card stack lock-card"><h3>פתחו את הנתונים</h3>
      <p class="lead">היומן, כרטיסי הכלים והפרויקטים מוצפנים במכשיר. הזינו את ה-PIN.</p>
      <form class="row" id="unlockForm" autocomplete="off"><label class="sr-only" for="pinIn">PIN</label><input class="input num pin" id="pinIn" type="password" inputmode="numeric" maxlength="12" autocomplete="off" required>
      <button type="submit" class="btn primary">פתח</button></form><p class="field-err" id="pinErr" role="alert" hidden></p>
      <p class="foot">שכחתם את ה-PIN? אין דרך לשחזר אותו – אפשר רק לשחזר מגיבוי או למחוק את כל הנתונים (למטה).</p></div>`;
    if (Persist.lockOn()) return `<div class="card stack"><h3>נעילת PIN פעילה</h3>
      <p class="lead">הנתונים האישיים מוצפנים (AES-GCM-256, PBKDF2 ${Vault.ITER.toLocaleString('he-IL')} איטרציות). נעילה אוטומטית אחרי 15 דקות בלי פעילות.</p>
      <div class="row"><button type="button" class="btn" data-action="dt-lock">נעל עכשיו</button></div>
      <form class="row" id="unlockOff" autocomplete="off"><label class="field grow"><span class="lbl">ביטול הנעילה – הזינו PIN</span><input class="input num pin" id="pinOff" type="password" inputmode="numeric" maxlength="12" required></label><button type="submit" class="btn ghost">בטל נעילה</button></form>
      <p class="field-err" id="pinErr" role="alert" hidden></p></div>`;
    return `<div class="card stack"><h3>נעילת PIN ליומן (לא חובה)</h3>
      <p class="lead">מצפין את היומן, כרטיסי הכלים, הפרויקטים והתמונות במכשיר. מומלץ אם יש במכשיר פרטי לקוחות.</p>
      <form class="tool-grid" id="lockForm" autocomplete="off">
        <label class="field"><span class="lbl">PIN (4–12 ספרות)</span><input class="input num pin" id="pinNew" type="password" inputmode="numeric" maxlength="12" required></label>
        <label class="field"><span class="lbl">שוב, לאימות</span><input class="input num pin" id="pinNew2" type="password" inputmode="numeric" maxlength="12" required></label>
        <button type="submit" class="btn primary">הפעל נעילה</button>
      </form><p class="field-err" id="pinErr" role="alert" hidden></p>
      <p class="foot">ה-PIN לא נשמר בשום מקום. שכחתם אותו – הנתונים המוצפנים אבודים. גבו לפני.</p></div>`;
  }
  function html() {
    const s = Persist.status(), locked = s.locked;
    return `<p class="lead">הכול נשמר רק במכשיר הזה. אין שרת, אין חשבון ואין שליחה החוצה.</p>
      <div class="card stack"><h3>מצב האחסון</h3>
        <dl class="specs"><dt>איפה</dt><dd>${esc(BACKEND[s.backend])}</dd><dt>נשמר לאחרונה</dt><dd class="num">${esc(fmtTime(s.lastSaved))}</dd>
        <dt>גיבוי אחרון</dt><dd class="num">${esc(fmtTime(s.lastBackup))}${s.lastBackup && days(s.lastBackup) >= 14 ? ' – הגיע הזמן לגבות' : ''}</dd><dt>נפח בשימוש</dt><dd class="num" id="dtUsage">—</dd></dl>
        ${s.backend !== 'idb' ? `<div class="note warn">${ICON.warn}<span>${s.backend === 'mem' ? 'הדפדפן חוסם אחסון (למשל מצב גלישה פרטית). צרו גיבוי לפני סגירת הדף.' : 'IndexedDB לא זמין – תמונות לא יישמרו אחרי סגירה.'}</span></div>` : ''}
        <button type="button" class="btn sm ghost" data-action="dt-persist">בקש מהדפדפן לא למחוק את הנתונים</button></div>
      ${lockCard()}
      <div class="card stack"><h3>גיבוי</h3>
        <p class="lead">קובץ JSON אחד עם כל הנתונים, גרסת סכמה ובדיקת שלמות (SHA-256).</p>
        <form class="tool-grid" id="bkForm" autocomplete="off">
          <label class="field"><span class="lbl">סיסמה להצפנת הקובץ (לא חובה)</span><input class="input" id="bkPw" type="password" maxlength="128" autocomplete="new-password"></label>
          <label class="field"><span class="lbl">הסיסמה שוב</span><input class="input" id="bkPw2" type="password" maxlength="128" autocomplete="new-password"></label>
          <button type="submit" class="btn primary" ${locked ? 'disabled' : ''}>צור גיבוי</button>
        </form>
        <p class="field-err" id="bkErr" role="alert" hidden></p>
        <div class="row" id="bkOut" hidden><button type="button" class="btn sm" data-action="dt-save">שמור קובץ</button><button type="button" class="btn sm" data-action="dt-share" hidden>שתף</button><button type="button" class="btn sm ghost" data-action="dt-copy">העתק</button></div>
        <textarea class="input copybox" id="bkBox" hidden rows="5" readonly aria-label="גיבוי להעתקה"></textarea></div>
      <div class="card stack"><h3>שחזור מגיבוי</h3>
        <div class="field"><label for="rsFile">קובץ גיבוי</label><input class="input" id="rsFile" type="file" accept="application/json,.json"></div>
        <div class="field"><label for="rsPaste">או הדביקו את התוכן</label><textarea class="input copybox" id="rsPaste" rows="3" maxlength="26214400"></textarea></div>
        <div class="field" id="rsPwRow" ${pwNeeded ? '' : 'hidden'}><label for="rsPw">סיסמת הגיבוי</label><input class="input" id="rsPw" type="password" maxlength="128" autocomplete="off"></div>
        <button type="button" class="btn" data-action="dt-read" ${locked ? 'disabled' : ''}>בדוק את הקובץ</button>
        <pre class="import-err" id="rsErr" hidden role="alert"></pre>
        <div id="rsPreview"></div></div>
      ${typeof Privacy !== 'undefined' ? Privacy.html() : ''}`;
  }
  function previewHTML(p) {
    return `<div class="stack preview">
      ${p.notes.length ? `<div class="note info">${ICON.info}<span>${p.notes.map(esc).join('<br>')}</span></div>` : ''}
      <table class="volt"><thead><tr><th scope="col">מה</th><th scope="col">חדש</th><th scope="col">שונה</th><th scope="col">זהה</th><th scope="col">יימחק בהחלפה</th></tr></thead>
      <tbody>${p.rows.map(r => `<tr><th scope="row">${esc(r.name)}</th><td class="num">${r.add}</td><td class="num">${r.chg}</td><td class="num">${r.same}</td><td class="num">${r.gone}</td></tr>`).join('')}</tbody></table>
      <fieldset class="stack plain"><legend class="lbl">איך לשחזר</legend>
        <label class="check"><input type="radio" name="rsMode" value="merge" checked><span><b>מיזוג</b> – מוסיף חדשים, מעדכן רשומות שהגיבוי חדש יותר בהן</span></label>
        <label class="check"><input type="radio" name="rsMode" value="replace"><span><b>החלפה</b> – מוחק את מה שיש במכשיר ושם את הגיבוי במקומו</span></label></fieldset>
      <label class="check" id="rsAckRow" hidden><input type="checkbox" id="rsAck"><span>הבנתי שנתונים שלא בגיבוי יימחקו מהמכשיר</span></label>
      <div class="row"><button type="button" class="btn primary" data-action="dt-apply">שחזר</button><button type="button" class="btn ghost" data-action="dt-cancel">ביטול</button></div></div>`;
  }
  const err = (id, msg) => { const e = $('#' + id); if (e) { e.hidden = !msg; e.textContent = msg || ''; } };
  function bind() {
    Persist.estimate().then(e => { const u = $('#dtUsage'); if (u && e) u.textContent = `${(e.usage / 1048576).toFixed(1)}MB מתוך ${(e.quota / 1048576 / 1024).toFixed(1)}GB`; });
    const lf = $('#lockForm');
    if (lf) lf.addEventListener('submit', async e => {
      e.preventDefault();
      const a = $('#pinNew').value, b = $('#pinNew2').value;
      if (!Persist.PIN_RE.test(a)) { err('pinErr', 'PIN של 4 עד 12 ספרות'); return; }
      if (a !== b) { err('pinErr', 'שני ה-PIN לא זהים'); return; }
      try { await Persist.enableLock(a); UI.toast('הנעילה פעילה – הנתונים מוצפנים'); rerender(); } catch (x) { err('pinErr', 'לא הצלחנו להפעיל נעילה: ' + x.message); }
    });
    const uf = $('#unlockForm');
    if (uf) uf.addEventListener('submit', async e => {
      e.preventDefault();
      try { await Persist.unlock($('#pinIn').value); UI.toast('נפתח'); refreshNotices(); rerender(); }
      catch (x) { err('pinErr', 'PIN שגוי'); $('#pinIn').value = ''; $('#pinIn').focus(); }
    });
    const of = $('#unlockOff');
    if (of) of.addEventListener('submit', async e => {
      e.preventDefault();
      try { await Persist.disableLock($('#pinOff').value); UI.toast('הנעילה בוטלה – הנתונים לא מוצפנים'); rerender(); }
      catch (x) { err('pinErr', 'PIN שגוי'); }
    });
    $('#bkForm').addEventListener('submit', async e => {
      e.preventDefault();
      const a = $('#bkPw').value, b = $('#bkPw2').value;
      if (a !== b) { err('bkErr', 'שתי הסיסמאות לא זהות'); return; }
      if (a && a.length < 8) { err('bkErr', 'סיסמה של 8 תווים לפחות'); return; }
      err('bkErr', '');
      try {
        lastBackupText = await Persist.backup(a || null);
        $('#bkOut').hidden = false;
        const sh = $('[data-action="dt-share"]'); if (sh) sh.hidden = !canShare();
        UI.toast(a ? 'נוצר גיבוי מוצפן' : 'נוצר גיבוי');
      } catch (x) { err('bkErr', x.message === 'locked' ? 'פתחו את הנעילה קודם' : 'יצירת הגיבוי נכשלה'); }
    });
    const rf = $('#rsFile');
    rf.addEventListener('change', () => {
      const f = rf.files && rf.files[0]; if (!f) return;
      if (f.size > 25 * 1048576) { err('rsErr', 'הקובץ גדול מ-25MB'); rf.value = ''; return; }
      const rd = new FileReader(); rd.onload = () => { $('#rsPaste').value = String(rd.result || ''); readNow(); }; rd.readAsText(f);
    });
    $$('input[name="rsMode"]').forEach(r => r.addEventListener('change', () => { const x = $('#rsAckRow'); if (x) x.hidden = r.value !== 'replace' || !r.checked; }));
    if (typeof Privacy !== 'undefined') Privacy.bind();
  }
  const fileName = () => `ev-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const canShare = () => { try { return !IN_FRAME && !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] })); } catch (e) { return false; } };
  async function readNow() {
    err('rsErr', ''); $('#rsPreview').innerHTML = '';
    try {
      const r = await Persist.readBackup($('#rsPaste').value, ($('#rsPw') || {}).value || '');
      pending = { data: r.data, notes: r.notes, rows: Persist.preview(r.data) };
      $('#rsPreview').innerHTML = previewHTML(pending);
      $$('input[name="rsMode"]').forEach(x => x.addEventListener('change', () => { $('#rsAckRow').hidden = $('input[name="rsMode"]:checked').value !== 'replace'; }));
    } catch (x) {
      if (x.needPassword) { pwNeeded = true; $('#rsPwRow').hidden = false; $('#rsPw').focus(); }
      err('rsErr', x instanceof Sec.ImportError ? x.message : 'קריאת הקובץ נכשלה');
    }
  }
  function rerender() { if (State.mode === 'tools') UI.Modes().tools.render(); refreshNotices(); }
  UI.on('dt-read', readNow);
  UI.on('dt-cancel', () => { pending = null; $('#rsPreview').innerHTML = ''; });
  UI.on('dt-apply', async () => {
    if (!pending) return;
    const mode = ($('input[name="rsMode"]:checked') || {}).value || 'merge';
    if (mode === 'replace' && !$('#rsAck').checked) { UI.toast('סמנו שהבנתם שנתונים יימחקו'); $('#rsAck').focus(); return; }
    const ok = await Persist.apply(pending.data, mode);
    pending = null; pwNeeded = false;
    UI.toast(ok ? (mode === 'replace' ? 'שוחזר (הוחלף)' : 'שוחזר (מוזג)') : 'השחזור לא נשמר – האחסון לא זמין');
    Level.apply(); rerender();
  });
  UI.on('dt-save', () => { offerFile(fileName(), lastBackupText, $('#bkBox')); Persist.markBackedUp(); refreshNotices(); });
  UI.on('dt-copy', () => { copyText(lastBackupText, $('#bkBox')); Persist.markBackedUp(); refreshNotices(); });
  UI.on('dt-share', async () => {
    try { await navigator.share({ files: [new File([lastBackupText], fileName(), { type: 'application/json' })], title: 'גיבוי מעבדת EV' }); Persist.markBackedUp(); refreshNotices(); }
    catch (e) { if (e && e.name !== 'AbortError') UI.toast('השיתוף נכשל – שמרו כקובץ'); }
  });
  UI.on('dt-lock', () => { Persist.lockNow(); UI.toast('ננעל'); rerender(); });
  UI.on('dt-persist', async () => { UI.toast(await Persist.persistRequest() ? 'הדפדפן לא ימחק את הנתונים אוטומטית' : 'הדפדפן לא אישר – גבו באופן קבוע'); });

  /** כרטיס לתצוגות שתלויות בנתונים נעולים */
  const lockedCard = what => `<div class="card stack"><h3>${esc(what)} נעול</h3><p class="lead">הנתונים מוצפנים במכשיר. פתחו עם PIN כדי לצפות ולשמור.</p><button type="button" class="btn primary" data-action="tl-sub" data-sub="data">פתיחה עם PIN</button></div>`;
  function init() {
    initIndicator(); refreshNotices();
    let last = '';
    Persist.onChange(s => { const k = s.locked + ':' + s.lastBackup; if (k !== last) { last = k; refreshNotices(); } });
  }
  return { html, bind, init, lockedCard, refreshNotices, notice, dropNotice };
})();

/* =====================================================================
   p14 · Boot Pro – טוען את האחסון המקומי, מאתחל את שכבת ה-Pro ואז את האתחול המקורי
   ===================================================================== */
const Boot = (() => {
  let done; const ready = new Promise(r => { done = r; });
  const safe = (name, fn) => { try { fn(); } catch (e) { console.error(name, e); } };
  function go() {
    safe('Level.init', () => Level.init());
    bootBase();
    safe('Glossary.init', () => Glossary.init());
    Level.apply();
    safe('DataUI.init', () => DataUI.init());
    (window.BootHooks || []).forEach(fn => safe('hook', fn));
    done();
  }
  Persist.init().then(go, go);
  return { ready };
})();
/** לבדיקות אוטומטיות: מחכה לסיום האתחול */
window.__testReady = () => Boot.ready;


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

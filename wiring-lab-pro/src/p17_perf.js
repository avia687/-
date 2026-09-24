/* =====================================================================
   p17 · Perf – ביצועים ו-PWA
   · Three.js נטען רק כשאזור התלת-ממד נראה, אחרי הציור הראשון (עם SRI).
   · ״חיסכון סוללה״: מכבה את התלת-ממד לגמרי – בלי טעינה ובלי לולאת ציור.
   · לולאת ה-rAF רצה רק כשהלשונית גלויה, אזור התלת-ממד על המסך והחיסכון כבוי.
   · ModelData: בגרסת ה-Web השדות הכבדים של כל דגם בקובץ נפרד (data/m-<id>.json),
     נטען לפי דרישה ונשמר לעבודה בלי רשת.
   · Service Worker והתקנה כאפליקציה.
   ===================================================================== */
const ModelData = (() => {
  const LAZY = DATA.lazyFields || [];
  const pending = {};
  const ready = id => !Sec.own(DATA.models, id) || !DATA.models[id]._lazy;
  function ensure(id) {
    if (ready(id)) return Promise.resolve();
    if (!pending[id]) {
      pending[id] = fetch('data/m-' + encodeURIComponent(id) + '.json')
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(t => {
          const o = Sec.parseJSON(t, 2 * 1024 * 1024), m = DATA.models[id];
          LAZY.forEach(k => { if (Sec.own(o, k)) m[k] = o[k]; });
          delete m._lazy;
        })
        .catch(e => { delete pending[id]; throw e; });
    }
    return pending[id];
  }
  /** טעינה ברקע של כל שאר הדגמים (אחרי שהממשק מוכן) */
  let allP = null;
  const all = () => allP || (allP = Promise.all(Object.keys(DATA.models).map(id => ensure(id).catch(() => null))));
  /** הדגם שיוצג באתחול – אותו היגיון כמו Store.apply */
  function initialId() {
    const s = Store.load();
    if (s && Sec.own(DATA.models, s.model)) return s.model;
    return s && s.vehicle === 'scooter' ? 'oxo' : DATA.defaultModel;
  }
  return { ensure, ready, all, initialId, lazy: () => LAZY.length > 0 };
})();

const Perf = (() => {
  const cfgEl = document.getElementById('three-src');
  const cfg = cfgEl ? JSON.parse(cfgEl.textContent) : null;
  let state = 'idle', visible = true, io = null;
  const defaultSaver = () => {
    try { if (navigator.connection && navigator.connection.saveData) return true; if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return true; } catch (e) { /* */ }
    return false;
  };
  const saver = () => { const v = ProStore.get('saver3d', null); return v === null ? defaultSaver() : !!v; };
  const shouldRender = () => state === 'ready' && !document.hidden && visible && !saver();

  function overlay(text, withBtn) {
    const L = $('#loader'); if (!L) return;
    L.classList.remove('done');
    $('#loaderText').textContent = text;
    const sp = $('.spin', L); if (sp) sp.hidden = !!withBtn || state !== 'loading';
    let b = $('#load3d');
    if (withBtn && !b) { b = document.createElement('button'); b.type = 'button'; b.id = 'load3d'; b.className = 'btn primary'; b.textContent = 'הצג מודל תלת-ממדי'; b.addEventListener('click', () => setSaver(false)); L.appendChild(b); }
    if (b) b.hidden = !withBtn;
  }
  const hideOverlay = () => { const L = $('#loader'); if (L) requestAnimationFrame(() => requestAnimationFrame(() => L.classList.add('done'))); };

  function load() {
    if (state === 'loading' || state === 'ready') return;
    if (!cfg) { fail(); return; }
    state = 'loading'; overlay('טוען את המודל התלת-ממדי…', false);
    const s = document.createElement('script');
    s.src = cfg.src; s.integrity = cfg.sri; s.async = true;
    if (/^https?:/.test(cfg.src)) { s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; }
    s.onload = start; s.onerror = fail;
    document.head.appendChild(s);
  }
  function start() {
    if (typeof THREE === 'undefined') { fail(); return; }
    try {
      Object.assign(Scene, makeScene());
      Scene.init($('#scene'), { onPick: UI.onPick, onHover: UI.onHover });
      Scene.build(State.vehicle);
      if (State.view === 'explode') Scene.setExplodeInstant(true);
      Scene.setCircuit();
      state = 'ready';
      Scene.start();
      UI.syncToolbar();
      const m = UI.Modes()[State.mode]; if (m && m.restore) m.restore();
      hideOverlay();
      document.body.classList.add('has3d');
    } catch (e) {
      state = 'failed';
      overlay('הדפדפן לא הצליח להפעיל תלת-ממד (WebGL). הלימוד, האשף והאבחון זמינים בפאנל.', false);
    }
  }
  function fail() {
    state = 'failed';
    overlay('המודל התלת-ממדי לא נטען. הלימוד, האשף והאבחון זמינים בפאנל.', false);
  }
  function setSaver(on) {
    ProStore.set('saver3d', !!on); syncBtn();
    if (on) { if (state === 'ready' || state === 'idle') overlay('התלת-ממד כבוי לחיסכון בסוללה. כל הפאנלים עובדים כרגיל.', true); }
    else if (state === 'ready') { hideOverlay(); Scene.wake(); }
    else load();
    UI.toast(on ? 'חיסכון סוללה: התלת-ממד כבוי' : 'התלת-ממד פועל');
  }
  function syncBtn() { const b = $('#saverBtn'); if (b) b.setAttribute('aria-pressed', String(saver())); }
  function wake() { if (shouldRender()) Scene.wake(); }
  /** נקרא במקום חלק התלת-ממד באתחול המקורי */
  function boot3D() {
    const stage = $('#stage');
    if (window.IntersectionObserver && stage) {
      io = new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible && state === 'idle' && !saver()) idle(load); wake(); });
      io.observe(stage);
    }
    document.addEventListener('visibilitychange', wake);
    const b = $('#saverBtn'); if (b) b.addEventListener('click', () => setSaver(!saver()));
    syncBtn();
    if (saver()) overlay('התלת-ממד כבוי לחיסכון בסוללה. כל הפאנלים עובדים כרגיל.', true);
    else if (!io) idle(load);
  }
  const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 200));

  /* ---------- Service Worker + התקנה ---------- */
  let installEvt = null;
  function initPWA() {
    if (!('serviceWorker' in navigator) || IN_FRAME || !/^https?:$/.test(location.protocol) || !document.querySelector('link[rel="manifest"]')) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      const offer = w => DataUI.notice('nt-update', 'גרסה חדשה של המעבדה מוכנה.', [['רענן עכשיו', () => w.postMessage({ type: 'skipWaiting' }), 'primary']]);
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
    }).catch(() => { /* בלי SW – האפליקציה עובדת רגיל */ });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !Perf.hadController) return; reloading = true; location.reload(); });
    Perf.hadController = !!navigator.serviceWorker.controller;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = $('#installBtn'); if (b) b.hidden = false; });
    window.addEventListener('appinstalled', () => { installEvt = null; UI.toast('המעבדה הותקנה'); });
  }
  const installHTML = () => `<button type="button" class="btn sm" id="installBtn" data-action="pw-install" ${installEvt ? '' : 'hidden'}>התקנה כאפליקציה</button>`;
  UI.on('pw-install', async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* */ } installEvt = null; const b = $('#installBtn'); if (b) b.hidden = true; });

  return { shouldRender, boot3D, load, setSaver, saver, state: () => state, initPWA, installHTML, hadController: false };
})();

(window.BootHooks = window.BootHooks || []).push(() => {
  Perf.initPWA();
  if (ModelData.lazy()) idleAll();
  function idleAll() { (window.requestIdleCallback || (f => setTimeout(f, 300)))(() => ModelData.all()); }
});

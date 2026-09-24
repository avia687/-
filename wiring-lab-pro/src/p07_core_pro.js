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
/** סימני מצב (SVG, בלי אימוג׳י) */
ICON.stop = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 2h8l6 6v8l-6 6H8l-6-6V8l6-6Zm3 5v7h2V7h-2Zm0 9v2h2v-2h-2Z"/></svg>';
ICON.batt = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="7" width="17" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 10.5v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
ICON.check = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m4 12.5 5 5L20 6.5"/></svg>';
ICON.cross = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>';
const MK = { ok: `<span class="mk ok">${ICON.check}</span>`, warn: `<span class="mk warn">${ICON.warn}</span>`, bad: `<span class="mk bad">${ICON.stop}</span>` };
function numT(x) { if (typeof x === 'number') return x; const n = Number(tplM(x)); return isFinite(n) ? n : null; }

/* ---------- אמינות נתונים ---------- */
const Conf = (() => {
  const LABEL_KEYS = { 'יצרן': 'brand', 'סוג': 'kind', 'סוללה': 'battery', 'מנוע': 'motor', 'בקר': 'controller', 'צמיגים': 'tires', 'בלמים': 'brakes', 'שיכוך': 'suspension', 'משקל': 'weight', 'טווח': 'range', 'מהירות': 'speed', 'טעינה': 'charging', 'צג': 'display', 'תאורה': 'lights', 'תוספות': 'extras' };
  const L = c => DATA.pro.confLegend[c] || DATA.pro.confLegend.unk;
  function badge(c) {
    const l = L(c);
    return `<span class="conf conf-${c}" title="${esc(l.name + ' – ' + l.desc)}">${esc(l.short || l.name)}</span>`;
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
      <details class="concept"><summary>מה אומרים תגי האמינות?</summary><div class="body">${legendHTML()}</div></details>`;
  }
  return { badge, badgeFor, legendHTML, modelExtraHTML };
})();

/* ---------- ערכת תצוגה: לפי המכשיר / כהה / בהירה / אור יום ---------- */
const Theme = (() => {
  const KEY = 'ev-lab.theme', OK = ['auto', 'dark', 'light', 'day'];
  const get = () => { let v = 'auto'; try { v = localStorage.getItem(KEY) || 'auto'; } catch (e) { /* */ } return OK.includes(v) ? v : 'auto'; };
  function apply(v) {
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    const s = document.getElementById('themeSel'); if (s) s.value = v;
    const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.content = (getComputedStyle(document.documentElement).getPropertyValue('--bg2') || '').trim() || '#16181b';
  }
  function set(v) { if (!OK.includes(v)) return; try { localStorage.setItem(KEY, v); } catch (e) { /* */ } ProStore.set('theme', v); apply(v); }
  function init() { const s = $('#themeSel'); if (s) s.addEventListener('change', () => { set(s.value); UI.toast(s.options[s.selectedIndex].text); }); apply(get()); }
  apply(get());
  return { init, set, get, OK };
})();
(window.BootHooks = window.BootHooks || []).push(() => Theme.init());

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
    return `${an ? `<div class="note info beg-only">${ICON.info}<span><b>במילים פשוטות:</b> ${esc(an)}</span></div>` : ''}
      ${tps.length ? `<div class="card stack"><div class="spread"><h3>נקודות בדיקה ברכיב</h3><button type="button" class="btn sm ghost" data-action="tp-all">כל הנקודות</button></div>${tpRows(tps)}</div>` : ''}
      ${cf.length ? `<div class="card stack"><h3>תקלות נפוצות בדגם הזה</h3><ul class="clean">${cf.map(f => `<li class="cf-row"><span>${esc(f.t)}</span><span class="cf-w" aria-label="משקל ${Math.round(f.w * 100)}%"><i style="width:${Math.round(f.w * 100)}%"></i></span></li>`).join('')}</ul><p class="foot">המשקל משפיע על ההסתברות ההתחלתית במנוע האבחון.</p></div>` : ''}`;
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

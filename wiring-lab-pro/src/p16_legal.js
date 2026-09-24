/* =====================================================================
   p16 · Legal + Consent + Privacy
   · Consent: הסכמה פעילה (תיבת סימון) לפני שימוש ראשון ולפני פעולות מסוכנות.
     נשמרים גרסת התנאים והתאריך בלבד, במכשיר (Persist 'consent').
   · Legal: חלון תנאי שימוש / פרטיות (מתבניות <template> בקובץ), הערות רגולציה.
   · Privacy: ייצוא כל הנתונים האישיים, ״מחק את כל הנתונים שלי״ עם אישור כפול.
   כל הטקסטים המשפטיים הם טיוטה לבדיקת עורך דין.
   ===================================================================== */
const Legal = (() => {
  const VERSION = '2026-09-24-draft1';
  const VERIFY = '<span class="verify-law">לאמת מול החוק העדכני</span>';
  let lastFocus = null;

  /* ---------- חלון (תנאים / פרטיות / הסכמה) ---------- */
  function dialog() {
    let d = $('#legalModal');
    if (d) return d;
    d = document.createElement('div');
    d.className = 'modal'; d.id = 'legalModal'; d.hidden = true;
    d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'legalTitle');
    d.innerHTML = '<div class="modal-card legal-card"><div class="spread"><h2 id="legalTitle" tabindex="-1"></h2><button type="button" class="close-x" data-legal-close aria-label="סגירה"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="legal-body" id="legalBody"></div><div class="legal-foot" id="legalFoot"></div></div>';
    $('#app').appendChild(d);
    d.addEventListener('click', e => { if (e.target.closest('[data-legal-close]') && !d.dataset.blocking) close(); });
    d.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !d.dataset.blocking) close();
      if (e.key === 'Tab') trap(d, e);
    });
    return d;
  }
  function trap(c, e) {
    const it = $$('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])', c).filter(x => x.offsetParent !== null);
    if (!it.length) return;
    const f = it[0], l = it[it.length - 1];
    if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); }
    else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
  }
  function open(title, bodyNode, footNode, blocking) {
    const d = dialog();
    lastFocus = document.activeElement;
    $('#legalTitle').textContent = title;
    const b = $('#legalBody'); b.textContent = ''; if (bodyNode) b.appendChild(bodyNode); b.scrollTop = 0;
    const f = $('#legalFoot'); f.textContent = ''; if (footNode) f.appendChild(footNode);
    if (blocking) d.dataset.blocking = '1'; else delete d.dataset.blocking;
    $('[data-legal-close]', d).hidden = !!blocking;
    d.hidden = false;
    $('#legalTitle').focus();
  }
  function close() {
    const d = $('#legalModal'); if (!d) return;
    d.hidden = true; delete d.dataset.blocking;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }
  const doc = which => { const t = document.getElementById('tpl-' + which); return t ? t.content.cloneNode(true) : document.createTextNode('המסמך לא נמצא.'); };
  function show(which) { open(which === 'terms' ? 'תנאי שימוש' : 'מדיניות פרטיות', doc(which), null, false); }

  /* ---------- הערת רגולציה לדגם ---------- */
  const num = s => { const m = String(s || '').match(/(\d{2,5})\s*W/); return m ? Number(m[1]) : null; };
  const kmh = s => { const m = String(s || '').match(/(\d{2,3})\s*קמ״ש/g); return m ? Math.max(...m.map(x => parseInt(x, 10))) : null; };
  function modelNote(m) {
    const w = num(m.motor && m.motor.nominal), v = kmh(m.speed);
    const over = (v && v > 25) || (m.cat === 'ebike' && w && w > 250);
    return `<div class="note ${over ? 'warn' : 'info'} law-note">${over ? ICON.warn : ICON.info}<span><b>רגולציה בישראל</b> ${VERIFY}<br>
      ${m.cat === 'ebike'
        ? 'אופניים עם מנוע עזר: סיוע עד 25 קמ״ש ומנוע בהספק נומינלי עד 250W, עם אישור תקן. גיל מינימום וחובת קסדה לפי התקנות.'
        : 'קורקינט חשמלי: מהירות מרבית 25 קמ״ש. גיל מינימום, קסדה ומקום רכיבה לפי התקנות.'}
      ${over ? `<br>המפרט שפורסם לדגם (${esc([w ? w + 'W' : '', v ? v + ' קמ״ש' : ''].filter(Boolean).join(' · '))}) חורג מהמגבלות. ייתכן שזו גרסה שלא מיועדת לדרך ציבורית – בדקו את התווית והאישור של הכלי שלכם.` : ''}
      שינוי שעוקף מגבלה עלול לשנות את סיווג הכלי ולבטל ביטוח.</span></div>`;
  }
  const privateUse = () => `<div class="note warn private-use">${ICON.warn}<span><b>לשימוש בשטח פרטי ולמטרות לימוד.</b> כלי שנבנה או שונה עלול לא לעמוד בדרישות לרכיבה בדרך ציבורית ${VERIFY}.</span></div>`;

  /* ---------- קישורים בתחתית ---------- */
  function init() {
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('[data-legal]');
      if (a) { e.preventDefault(); show(a.dataset.legal); }
    });
  }
  return { VERSION, VERIFY, open, close, show, doc, modelNote, privateUse, init, trap };
})();

const Consent = (() => {
  const ACTIONS = {
    battery: { t: 'עבודה על סוללה', d: 'מחליפים מארז שלם בלבד. לא פותחים מארז, לא מתקנים תאים ולא עוקפים BMS. סוללת ליתיום פגועה עלולה להתלקח גם אחרי שעות.' },
    hv: { t: 'עבודה על מתח מעל 60V', d: 'מתח DC מעל 60V מסוכן במגע. עובדים עם ציוד מבודד, מודדים לפני מגע, ולא עובדים לבד. אם אין לכם הכשרה – פנו לטכנאי.' },
    buildPack: { t: 'בניית סוללה', d: 'למתקדמים בלבד: ריתוך נקודתי (לא הלחמה), נתיך לכל ענף, BMS מתאים, איזון תאים וטעינה ראשונה בפיקוח על משטח לא דליק. טעות אחת מספיקה לשריפה.' },
    speed: { t: 'הגדרות מהירות והספק', d: 'שינוי מגבלת מהירות או הספק, או קוטר גלגל לא נכון כדי לעקוף מגבלה, עלול להיות אסור בדרך ציבורית ולבטל ביטוח. מגדירים רק את הערכים האמיתיים של הכלי.' }
  };
  const session = new Set();
  const data = () => Persist.get('consent');
  const hasTerms = () => { const t = data().terms; return !!(t && t.v === Legal.VERSION); };
  function record(key) {
    const c = Object.assign({}, data());
    const now = new Date().toISOString();
    if (key === 'terms') c.terms = { v: Legal.VERSION, at: now };
    else { c.actions = Object.assign({}, c.actions); const prev = c.actions[key]; c.actions[key] = { v: Legal.VERSION, at: now, n: (prev && prev.n || 0) + 1 }; }
    Persist.set('consent', c);
  }
  /** חלון הסכמה – מחזיר Promise<boolean> */
  function ask(title, bodyNode, label, blocking) {
    return new Promise(res => {
      const foot = document.createElement('div'); foot.className = 'stack';
      const lab = document.createElement('label'); lab.className = 'check consent-check';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'consentChk';
      const sp = document.createElement('span'); sp.textContent = label;
      lab.append(cb, sp);
      const row = document.createElement('div'); row.className = 'row';
      const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn primary'; ok.textContent = 'המשך'; ok.disabled = true;
      row.appendChild(ok);
      if (!blocking) { const no = document.createElement('button'); no.type = 'button'; no.className = 'btn ghost'; no.textContent = 'ביטול'; no.addEventListener('click', () => { Legal.close(); res(false); }); row.appendChild(no); }
      foot.append(lab, row);
      cb.addEventListener('change', () => { ok.disabled = !cb.checked; });
      ok.addEventListener('click', () => { if (!cb.checked) return; Legal.close(); res(true); });
      Legal.open(title, bodyNode, foot, blocking);
      const d = $('#legalModal');
      const onClose = new MutationObserver(() => { if (d.hidden) { onClose.disconnect(); res(false); } });
      onClose.observe(d, { attributes: true, attributeFilter: ['hidden'] });
    });
  }
  /** לפני שימוש ראשון (או אחרי עדכון גרסת התנאים) */
  async function gateTerms() {
    if (hasTerms()) return true;
    const body = document.createElement('div'); body.className = 'stack';
    body.innerHTML = `<p class="lead">לפני שמתחילים – שלושה דברים:</p>
      <ol class="consent-list"><li><b>זה כלי לימוד ועזר</b>, לא תחליף לטכנאי מוסמך. חלק מהנתונים משוערים ומסומנים כך.</li>
      <li><b>סוללות ומתח גבוה מסוכנים.</b> לא פותחים סוללות ולא עוקפים מגבלות מהירות או הספק.</li>
      <li><b>הנתונים נשארים אצלכם.</b> אין שרת ואין מעקב – הכול נשמר במכשיר.</li></ol>
      <p class="foot">קראו את <a href="terms.html" data-legal-inline="terms">תנאי השימוש</a> ואת <a href="privacy.html" data-legal-inline="privacy">מדיניות הפרטיות</a> (טיוטה, גרסה ${esc(Legal.VERSION)}).</p>
      <div class="legal-inline" id="legalInline" hidden></div>`;
    body.addEventListener('click', e => {
      const a = e.target.closest('[data-legal-inline]'); if (!a) return;
      e.preventDefault(); e.stopPropagation();
      const box = $('#legalInline', body); box.textContent = ''; box.appendChild(Legal.doc(a.dataset.legalInline)); box.hidden = false; box.scrollIntoView({ block: 'start' });
    });
    const ok = await ask('ברוכים הבאים למעבדת EV', body, 'קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות', true);
    if (ok) record('terms');
    return ok;
  }
  /** לפני פעולה מסוכנת. מחזיר true אם אושר (או אושר כבר בסשן הזה) */
  async function confirm(keys) {
    keys = [].concat(keys).filter(k => ACTIONS[k] && !session.has(k));
    if (!keys.length) return true;
    const body = document.createElement('div'); body.className = 'stack';
    body.innerHTML = keys.map(k => `<div class="note danger">${ICON.warn}<span><b>${esc(ACTIONS[k].t)}.</b> ${esc(ACTIONS[k].d)}</span></div>`).join('') +
      `<p class="foot">${Legal.VERIFY} · האישור נשמר במכשיר עם תאריך וגרסת התנאים.</p>`;
    const ok = await ask('לפני שממשיכים', body, 'הבנתי את הסיכון ואני אחראי/ת לעבודה', false);
    if (ok) keys.forEach(k => { session.add(k); record(k); });
    return ok;
  }
  /** יירוט לחיצות על פעולות מסוכנות (לפני שהמטפל המקורי רץ) */
  function needsFor(el) {
    const a = el.dataset.action, k = [];
    if (a === 'wz-start') {
      const sc = ($('input[name="wzS"]:checked') || {}).value;
      if (sc === 'battery') k.push('battery');
      if (sc === 'display' || sc === 'controller') k.push('speed');
      if (Number(State.voltage) >= DATA.pro.hvThreshold) k.push('hv');
    }
    if ((a === 'dp-open' || a === 'tp-meas' || a === 'tp-go') && M().voltage >= DATA.pro.hvThreshold) k.push('hv');
    if (el.dataset.consent) el.dataset.consent.split(',').forEach(x => k.push(x));
    return k.filter(x => !session.has(x));
  }
  function init() {
    window.addEventListener('click', e => {
      const el = e.target.closest && e.target.closest('[data-action], [data-consent]');
      if (!el || el.disabled) return;
      const k = needsFor(el);
      if (!k.length) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      confirm(k).then(ok => { if (ok && document.contains(el)) el.click(); });
    }, true);
  }
  /** אישור מראש לסשן הנוכחי בלבד (למשל טכנאי מוסמך שכבר אישר) – לא נשמר */
  const preapprove = keys => [].concat(keys).forEach(k => { if (ACTIONS[k]) session.add(k); });
  return { init, gateTerms, confirm, hasTerms, ACTIONS, record, data, preapprove };
})();

const Privacy = (() => {
  let wipeStep = 0;
  function html() {
    return `<div class="card stack" id="privacyCard"><h3>הנתונים שלך</h3>
      <p class="lead">אין שרת ואין מעקב. אפשר לראות, לייצא ולמחוק הכול. <a href="privacy.html" data-legal="privacy">מדיניות הפרטיות</a> · <a href="terms.html" data-legal="terms">תנאי שימוש</a></p>
      <div class="row"><button type="button" class="btn" data-action="pv-export">ייצוא כל הנתונים שלי</button></div>
      <textarea class="input copybox" id="pvBox" hidden rows="5" readonly aria-label="כל הנתונים להעתקה"></textarea>
      <div class="danger-zone stack"><h4>מחק את כל הנתונים שלי</h4>
        <p class="foot">מוחק את היומן, כרטיסי הכלים, התמונות, הפרויקטים, ההעדפות, ההסכמות והמטמון של האפליקציה במכשיר הזה. אי אפשר לבטל.</p>
        <div id="pvWipe">${wipeHTML()}</div></div></div>`;
  }
  function wipeHTML() {
    if (wipeStep === 0) return '<button type="button" class="btn danger" data-action="pv-wipe1">מחק את כל הנתונים שלי</button>';
    if (wipeStep === 1) return `<div class="stack"><label class="check"><input type="checkbox" id="pvAck1"><span>הבנתי שהכול יימחק ואין דרך לשחזר בלי קובץ גיבוי</span></label>
      <div class="row"><button type="button" class="btn danger" data-action="pv-wipe2" disabled id="pvGo1">המשך</button><button type="button" class="btn ghost" data-action="pv-cancel">ביטול</button></div></div>`;
    return `<div class="stack"><label class="field"><span class="lbl">לאישור סופי הקלידו: מחק</span><input class="input" id="pvWord" maxlength="10" autocomplete="off"></label>
      <div class="row"><button type="button" class="btn danger" data-action="pv-wipe3" disabled id="pvGo2">מחק עכשיו</button><button type="button" class="btn ghost" data-action="pv-cancel">ביטול</button></div></div>`;
  }
  function renderWipe() {
    const w = $('#pvWipe'); if (!w) return;
    w.innerHTML = wipeHTML();
    const a = $('#pvAck1'); if (a) a.addEventListener('change', () => { $('#pvGo1').disabled = !a.checked; });
    const t = $('#pvWord'); if (t) { t.addEventListener('input', () => { $('#pvGo2').disabled = t.value.trim() !== 'מחק'; }); t.focus(); }
  }
  function bind() { wipeStep = 0; renderWipe(); }
  async function exportAll() {
    if (Persist.isLocked()) { UI.toast('פתחו את הנעילה קודם'); Tools.go('data'); return; }
    await Persist.flush();
    const photos = {};
    for (const id of await Persist.blobIds()) {
      const b = await Persist.getBlob(id);
      if (b) photos[id] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(b); });
    }
    let ui = null; try { ui = JSON.parse(localStorage.getItem('wiring-lab.v1')); } catch (e) { /* */ }
    const out = { app: 'ev-lab', type: 'personal-data-export', created: new Date().toISOString(), note: 'כל המידע שהאפליקציה שומרת עליך במכשיר הזה.', storage: Persist.backend(), data: Persist.snapshot(), photos, uiState: ui };
    offerFile(`ev-lab-my-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 1), $('#pvBox'));
  }
  async function wipe() {
    await Persist.wipe();
    try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'wipe' }); } catch (e) { /* */ }
    UI.toast('כל הנתונים נמחקו');
    setTimeout(() => location.reload(), 400);
  }
  UI.on('pv-export', exportAll);
  UI.on('pv-wipe1', () => { wipeStep = 1; renderWipe(); });
  UI.on('pv-wipe2', () => { if ($('#pvAck1') && $('#pvAck1').checked) { wipeStep = 2; renderWipe(); } });
  UI.on('pv-wipe3', () => { if ($('#pvWord') && $('#pvWord').value.trim() === 'מחק') wipe(); });
  UI.on('pv-cancel', () => { wipeStep = 0; renderWipe(); });
  return { html, bind, exportAll, wipe };
})();

(window.BootHooks = window.BootHooks || []).push(() => { Legal.init(); Consent.init(); Consent.gateTerms(); });

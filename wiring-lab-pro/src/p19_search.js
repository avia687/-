/* =====================================================================
   p19 · Search + Ask – חיפוש גלובלי ו״שאל את המערכת״
   · שדה אחד בראש המסך (קיצור: /). מחפש סימפטומים, סיבות, קודי שגיאה, מונחים,
     נקודות בדיקה, רכיבים, תרחישי אשף, דגמים וכלים – ומוביל ישר למסך הנכון.
     ״לא טוען״ ← אבחון עם הסימפטום ״לא נטען״ מסומן.
   · בלי תוצאה (או ״לא מצאתי״): הסלמה – סיכום מסודר לטכנאי (דגם, סימפטומים,
     מדידות, שאלה) להעתקה/שיתוף, נשמר ב-Persist('escalations').
   ===================================================================== */
const Search = (() => {
  const NIQQUD = /[֑-ׇ]/g;
  const norm = s => String(s || '').toLowerCase().replace(NIQQUD, '').replace(/[״"'׳`.,:;!?()[\]{}\/\\|–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const PREFIX = /^(ו|ה|ב|ל|מ|ש|כ|וה|וב|ול|שה|שב|של|מה|כש)(?=[א-ת]{3,})/;
  const stem = t => t.replace(PREFIX, '');
  // מילים נרדפות – שפת רחוב ← מונחי המעבדה
  const SYN = {
    'טוען': ['נטען', 'טעינה', 'מטען'], 'טעינה': ['נטען', 'מטען'], 'נדלק': ['דולק', 'הדלקה'], 'דולק': ['נדלק'], 'מת': ['נדלק', 'פרוקה'],
    'נוסע': ['הנעה', 'מניע'], 'זז': ['הנעה', 'מניע'], 'מושך': ['הנעה', 'מניע'], 'נכבה': ['ניתוק', 'נדלק'], 'נופל': ['ניתוק'], 'קופץ': ['ניתוק', 'לסירוגין'],
    'מתחמם': ['חום'], 'שרוף': ['ריח', 'חום'], 'נשרף': ['ריח', 'חום'], 'מריח': ['ריח', 'חום'], 'מסריח': ['ריח', 'חום'], 'חם': ['חום'], 'שורף': ['ריח', 'חום'], 'ריח': ['חום'], 'עשן': ['חום', 'ריח'],
    'מגמגם': ['רועד', 'מגמגם'], 'רועד': ['מגמגם'], 'רעש': ['מגמגם', 'רועד'], 'קוד': ['שגיאה'], 'error': ['שגיאה', 'קוד'], 'err': ['שגיאה', 'קוד'],
    'טווח': ['טווח'], 'קילומטרים': ['טווח'], 'מחזיק': ['טווח'], 'בטריה': ['סוללה'], 'בטרייה': ['סוללה'], 'מצבר': ['סוללה'],
    'גז': ['מצערת'], 'ברקס': ['בלם', 'בלמים'], 'מסך': ['צג'], 'תצוגה': ['צג'], 'פנס': ['תאורה'], 'אור': ['תאורה'],
    'לפעמים': ['לסירוגין'], 'מדי': ['לסירוגין'], 'גלגל': ['גלגל', 'מנוע'], 'מנוע': ['מנוע']
  };
  let index = null;
  function tokensOf(s) { return norm(s).split(' ').filter(Boolean).map(stem); }
  function add(list, type, title, sub, text, go, pri) { list.push({ type, title, sub, hay: ' ' + tokensOf(title + ' ' + (text || '')).join(' ') + ' ', go, pri }); }
  function build() {
    const L = [], has = c => vehicleComps().includes(c);
    DATA.pro.bayesSymptoms.forEach(s => add(L, 'תקלה', s.name, 'אבחון לפי מדידות', `${s.pro} ${s.id}`, () => goSymptom(s.id), 10));
    DATA.pro.causes.filter(c => !c.requires || c.requires.every(has)).forEach(c => add(L, 'סיבה', c.name, c.pro, (c.comps || []).join(' '), () => goCause(c.id), 6));
    DATA.errorCodes.codes.forEach(c => add(L, 'קוד', `${c.c} – ${c.t}`, (DATA.errorCodes.brands.find(b => b.id === c.b) || { name: c.b }).name, `${c.c} ${c.d} ${c.b} קוד שגיאה error`, () => goCode(c.c), 8));
    DATA.pro.glossary.forEach(g => add(L, 'מונח', g.t.join(' · '), g.beg.slice(0, 70), g.beg, () => goTerm(g.t[0]), 4));
    (M().testPoints || []).forEach(tp => add(L, 'נקודת בדיקה', tp.name, tp.expect, `${tp.comp} ${tp.mode} מדידה`, () => goTP(tp.id), 5));
    vehicleComps().forEach(id => { const c = DATA.components[id]; if (c) add(L, 'רכיב', c.name, 'פתח במודל', `${id} ${c.short || ''}`, () => UI.showComp(id), 5); });
    Object.entries(DATA.wizard.scenarios).forEach(([id, s]) => add(L, 'אשף', s.name, 'אשף התקנה', `התקנה החלפה ${id}`, () => goWizard(id), 4));
    Object.entries(DATA.models).forEach(([id, m]) => add(L, 'דגם', m.name, `${m.voltage}V`, `${m.short} ${m.brand || ''}`, () => UI.setModel(id), 3));
    [['calc', 'מחשבונים: טווח, טעינה, צניחה, הספק', 'חישוב מחשבון טווח טעינה'], ['log', 'יומן תיקונים', 'יומן לקוח תיקון רשומה'], ['vehicles', 'כרטיסי כלי ותזכורות תחזוקה', 'כרטיס כלי לקוח תחזוקה תזכורת בריאות סוללה'], ['quote', 'הצעת מחיר לתיקון', 'מחיר הצעה תעריף עלות'], ['data', 'גיבוי, שחזור ופרטיות', 'גיבוי שחזור מחיקה פרטיות PIN נעילה'], ['shop', 'מצב סדנה וקריינות', 'סדנה קול הקראה ידיים']]
      .forEach(([s, t, k]) => add(L, 'כלי', t, 'כלים', k, () => Tools.go(s), 3));
    add(L, 'כלי', 'בנה בעצמך – ערכת המרה', 'תכנון, חישוב, חיווט, הרכבה', 'בנייה המרה ערכה סוללה בניית XsYp', () => UI.setMode('build'), 3);
    add(L, 'כלי', 'כרטיסיות חזרה', 'לימוד', 'כרטיסיות חזרה שינון מבחן', () => { UI.setMode('learn'); const b = $('[data-action="learn-sub"][data-sub="cards"]'); if (b) b.click(); }, 3);
    return L;
  }
  function query(q) {
    if (!index || index.model !== State.model) { index = build(); index.model = State.model; }
    const raw = norm(q).split(' ').filter(t => t.length > 1 || /\d/.test(t));
    if (!raw.length) return [];
    const qt = raw.map(r => ({ r, s: stem(r) }));
    const scored = [];
    for (const it of index) {
      let score = 0, hits = 0;
      for (const { r, s: t } of qt) {
        const num = (r.match(/^(?:e|er|err|error)?0*(\d{1,4})$/) || [])[1];
        const alts = [...new Set([r, t].concat(SYN[r] || [], SYN[t] || [], num ? [num, '0' + num] : []))];
        const exact = alts.some(a => it.hay.includes(' ' + a + ' ')), part = exact || alts.some(a => a.length > 1 && it.hay.includes(a));
        if (exact) { score += 3; hits++; } else if (part) { score += 1.5; hits++; }
        else if (r === 'לא') score += 0; else score -= 1;
      }
      const need = qt.filter(x => x.r !== 'לא').length;
      if (hits >= Math.max(1, need - (need >= 3 ? 1 : 0))) scored.push({ it, s: score + it.pri * 0.15 });
    }
    return scored.sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.it);
  }

  /* ---------- ניווט ---------- */
  function goSymptom(id) { DiagPro.selectSymptom(id); UI.setMode('diag'); const b = $('[data-action="dg-sub"][data-sub="adv"]'); if (b) b.click(); $('#panelScroll').scrollTop = 0; }
  function goCause(id) {
    const lik = DATA.pro.symptomLik || {};
    let best = null, bv = 0;
    Object.keys(lik).forEach(s => { const v = lik[s][id] || 0; if (v > bv) { bv = v; best = s; } });
    if (best) goSymptom(best); else { UI.setMode('diag'); }
    setTimeout(() => { const el = $(`[data-action="dp-cause"][data-c="${id}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); } }, 50);
  }
  function goCode(code) {
    UI.setMode('diag'); const b = $('[data-action="dg-sub"][data-sub="codes"]'); if (b) b.click();
    const i = $('#codeSearch'); if (i) { i.value = code; i.dispatchEvent(new Event('input')); }
  }
  function goTerm(t) { ProStore.set('gq', t); UI.setMode('learn'); const b = $('[data-action="learn-sub"][data-sub="glossary"]'); if (b) b.click(); }
  function goTP(id) { UI.setMode('diag'); const b = $('[data-action="dg-sub"][data-sub="tp"]'); if (b) b.click(); DiagPro.openTP(id); }
  function goWizard(id) { UI.setMode('wizard'); const r = $(`input[name="wzS"][value="${id}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change')); r.scrollIntoView({ block: 'center' }); } else UI.toast('התרחיש לא זמין לדגם הזה'); }

  /* ---------- ממשק ---------- */
  let results = [], active = -1;
  function render(q) {
    const box = $('#gsList'), inp = $('#gSearch');
    results = q.trim() ? query(q) : [];
    active = results.length ? 0 : -1;
    if (!q.trim()) { box.hidden = true; inp.setAttribute('aria-expanded', 'false'); return; }
    box.innerHTML = results.map((r, i) => `<li role="option" id="gs-${i}" data-i="${i}" aria-selected="${i === active}"><span class="gs-type">${esc(r.type)}</span><span class="gs-t">${esc(r.title)}</span>${r.sub ? `<span class="gs-sub">${esc(r.sub)}</span>` : ''}</li>`).join('') +
      `<li role="option" id="gs-ask" data-i="ask" class="gs-ask" aria-selected="${!results.length}"><span class="gs-type">שאל</span><span class="gs-t">${results.length ? 'לא מצאתי – הכן סיכום לטכנאי' : 'לא מצאתי. הכן סיכום לטכנאי'}</span><span class="gs-sub">״${esc(q.trim().slice(0, 60))}״</span></li>`;
    box.hidden = false; inp.setAttribute('aria-expanded', 'true');
    inp.setAttribute('aria-activedescendant', results.length ? 'gs-0' : 'gs-ask');
  }
  function choose(i) {
    const inp = $('#gSearch'), q = inp.value;
    close();
    if (i === 'ask' || i == null || !results[i]) { Ask.open(q); return; }
    results[i].go();
  }
  function close() { const b = $('#gsList'); if (b) b.hidden = true; const i = $('#gSearch'); if (i) { i.setAttribute('aria-expanded', 'false'); i.removeAttribute('aria-activedescendant'); } }
  function move(d) {
    const n = results.length + 1; if (!n) return;
    active = ((active < 0 ? (results.length ? 0 : n - 1) : active) + d + n) % n;
    $$('#gsList [role="option"]').forEach((li, k) => li.setAttribute('aria-selected', String(k === active)));
    const id = active === results.length ? 'gs-ask' : 'gs-' + active;
    $('#gSearch').setAttribute('aria-activedescendant', id);
    const el = document.getElementById(id); if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function init() {
    const inp = $('#gSearch'); if (!inp) return;
    inp.addEventListener('input', () => render(inp.value));
    inp.addEventListener('focus', () => { if (inp.value.trim()) render(inp.value); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (inp.value.trim()) choose(active === results.length ? 'ask' : active); }
      else if (e.key === 'Escape') { close(); }
    });
    $('#gsList').addEventListener('mousedown', e => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); choose(li.dataset.i === 'ask' ? 'ask' : Number(li.dataset.i)); } });
    document.addEventListener('click', e => { if (!e.target.closest('.gsearch')) close(); });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); inp.focus(); inp.select(); }
    });
    UI.on && document.addEventListener('change', e => { if (e.target && e.target.id === 'modelSelect') index = null; });
  }
  return { init, query, norm, goSymptom };
})();

/* ---------- ״לא מצאתי״ → סיכום לטכנאי ---------- */
const Ask = (() => {
  let lastText = '';
  function summary(q, detail) {
    const m = M(), e = DiagPro.evidence(), S = DATA.pro.bayesSymptoms, ms = DATA.pro.measurements;
    const sym = e.sym.map(id => (S.find(x => x.id === id) || { name: id }).name);
    const meas = Object.entries(e.meas).map(([id, v]) => `${(ms.find(x => x.id === id) || { name: id }).name}: ${Array.isArray(v) ? v.join(' / ') : v}`);
    return `סיכום לטכנאי – מעבדת EV\nתאריך: ${new Date().toLocaleString('he-IL')}\nכלי: ${m.name} · ${m.voltage}V${m.controllerAmpsNum ? ` · בקר ${m.controllerAmpsNum}A` : ''}\n` +
      `השאלה: ${q || '—'}\n${detail ? `פירוט: ${detail}\n` : ''}סימפטומים שסומנו: ${sym.join(', ') || 'לא סומנו'}\nמדידות שבוצעו: ${meas.join(' · ') || 'לא בוצעו'}\n` +
      `הערה: החיפוש במערכת לא מצא תשובה – נדרשת בדיקה של טכנאי.\n${DATA.meta.disclaimer}`;
  }
  function open(q) {
    const body = document.createElement('div'); body.className = 'stack';
    body.innerHTML = `<p class="lead">לא מצאנו תשובה במערכת. נכין סיכום מסודר לטכנאי: הכלי, מה סימנת ומה מדדת.</p>
      <div class="field"><label for="askQ">מה הבעיה?</label><input class="input" id="askQ" maxlength="200" value="${esc(q || '')}"></div>
      <div class="field"><label for="askD">עוד פרטים (לא חובה)</label><textarea class="input" id="askD" rows="3" maxlength="1000" placeholder="מתי זה קורה, מה כבר ניסית, קולות, ריח"></textarea></div>
      <pre class="ask-out" id="askOut" aria-live="polite"></pre>
      <textarea class="input copybox" id="askBox" hidden rows="6" readonly aria-label="סיכום להעתקה"></textarea>`;
    const foot = document.createElement('div'); foot.className = 'row';
    const mk = (t, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = t; b.addEventListener('click', fn); foot.appendChild(b); return b; };
    const upd = () => { lastText = summary(Sec.str($('#askQ').value.trim(), 200), Sec.str($('#askD').value.trim(), 1000)); $('#askOut').textContent = lastText; };
    mk('העתק סיכום', 'primary', () => { upd(); copyText(lastText, $('#askBox')); save(); });
    if (navigator.share && !IN_FRAME) mk('שתף', '', async () => { upd(); try { await navigator.share({ title: 'סיכום לטכנאי', text: lastText }); save(); } catch (e) { /* בוטל */ } });
    mk('עבור לאבחון', 'ghost', () => { Legal.close(); UI.setMode('diag'); });
    Legal.open('שאל את המערכת', body, foot, false);
    ['#askQ', '#askD'].forEach(s => $(s).addEventListener('input', upd)); upd();
  }
  function save() {
    if (Persist.isLocked()) return;
    const list = Persist.get('escalations');
    list.unshift({ id: 'e' + Date.now().toString(36), at: new Date().toISOString(), model: State.model, text: lastText.slice(0, 4000) });
    Persist.set('escalations', list.slice(0, 200));
  }
  return { open, summary };
})();

(window.BootHooks = window.BootHooks || []).push(() => {
  Search.init();
  // ״לא מצאתי״ באבחון מוביל גם הוא לסיכום לטכנאי
  UI.on('ask-open', () => Ask.open(''));
});

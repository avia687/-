/* =====================================================================
   p21 · Vehicles + Reminders + Quote
   · כרטיס כלי ללקוח: היסטוריית תיקונים, מדידות לאורך זמן, גרף בריאות סוללה
     (צניחת מתח תחת עומס – Sag), תזכורות תחזוקה לפי ק״מ או זמן.
   · הצעת מחיר: תעריף הטכנאי × שעות עבודה + חלקים (מחיר שהטכנאי מזין – אין מחירים מומצאים).
   הכול ב-Persist (vehicles, reminders, quotes) – מוצפן כשיש PIN.
   ===================================================================== */
const Vehicles = (() => {
  let openId = null;
  const PRESETS = [['בדיקת בלמים ורפידות', 1000, 90], ['לחץ אוויר בצמיגים', 0, 14], ['ניקוי ושימון שרשרת', 300, 30], ['בדיקת מחברים וחיווט', 2000, 180], ['בדיקת בריאות סוללה (Sag)', 1500, 180], ['הידוק ברגים במומנט', 1000, 180]];
  const all = () => Persist.get('vehicles');
  const byId = id => all().find(v => v.id === id) || null;
  const today = () => new Date().toISOString().slice(0, 10);
  const days = (a, b) => Math.floor((new Date(b) - new Date(a)) / 864e5);
  const label = v => v.label || (DATA.models[v.model] || {}).name || 'כלי';
  function kmOf(v) {
    const logKm = RepairLog.all().filter(x => x.vehicleId === v.id && typeof x.km === 'number').map(x => x.km);
    const sagKm = (v.sag || []).filter(x => typeof x.km === 'number').map(x => x.km);
    return Math.max(0, Number(v.km) || 0, ...logKm, ...sagKm);
  }
  function save(list) { return Persist.set('vehicles', list); }
  function upsert(v) { const list = all().filter(x => x.id !== v.id); list.unshift(v); save(list); }
  const sagPct = s => (s.rest > 0 ? Math.round((s.rest - s.load) / s.rest * 1000) / 10 : null);
  const mOhm = s => (s.amps > 0 ? Math.round((s.rest - s.load) / s.amps * 1000) : null);

  /* ---------- תזכורות ---------- */
  const rem = () => Persist.get('reminders');
  function dueOf(r, v) {
    const km = kmOf(v), out = [];
    if (r.everyKm > 0) { const left = (r.lastKm || 0) + r.everyKm - km; out.push({ kind: 'km', left, due: left <= 0, soon: left > 0 && left <= r.everyKm * 0.1 }); }
    if (r.everyDays > 0) { const left = r.everyDays - days(r.lastDate || v.created.slice(0, 10), today()); out.push({ kind: 'd', left, due: left <= 0, soon: left > 0 && left <= 7 }); }
    return { due: out.some(x => x.due), soon: out.some(x => x.soon), parts: out };
  }
  function dueList() {
    if (Persist.isLocked()) return [];
    return rem().map(r => { const v = byId(r.vehicleId); return v ? { r, v, d: dueOf(r, v) } : null; }).filter(x => x && x.d.due);
  }
  function notify() {
    const n = dueList().length;
    if (n) DataUI.notice('nt-maint', `${n} תזכורות תחזוקה הגיעו למועד.`, [['הצג', () => Tools.go('vehicles'), 'primary']]);
    else DataUI.dropNotice('nt-maint');
  }

  /* ---------- גרף בריאות סוללה (SVG) ---------- */
  function graph(sag) {
    const pts = sag.map(s => ({ d: s.date, y: sagPct(s) })).filter(p => p.y != null).sort((a, b) => (a.d < b.d ? -1 : 1));
    if (pts.length < 2) return '<p class="foot">הגרף יופיע אחרי שתי מדידות לפחות.</p>';
    const W = 360, H = 170, P = 30, ymax = Math.max(25, ...pts.map(p => p.y) ) * 1.1;
    const t0 = new Date(pts[0].d).getTime(), t1 = Math.max(t0 + 864e5, new Date(pts[pts.length - 1].d).getTime());
    const X = d => P + (new Date(d).getTime() - t0) / (t1 - t0) * (W - P * 1.5), Y = v => H - P + 4 - v / ymax * (H - P * 1.4);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
    const band = (v, cls, t) => `<line class="${cls}" x1="${P}" x2="${W - P / 2}" y1="${Y(v)}" y2="${Y(v)}"/><text class="gl" x="${W - P / 2}" y="${Y(v) - 3}" text-anchor="end">${t}</text>`;
    return `<figure class="sag-graph"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="צניחת מתח לאורך זמן: ${pts.map(p => `${p.d} ${p.y}%`).join(', ')}">
      ${band(10, 'g-ok', '10% – תקין')}${band(20, 'g-bad', '20% – לבדיקה')}
      <line class="ax" x1="${P}" x2="${P}" y1="8" y2="${H - P + 4}"/><line class="ax" x1="${P}" x2="${W - P / 2}" y1="${H - P + 4}" y2="${H - P + 4}"/>
      <path class="gline" d="${line}"/>${pts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4"/><text class="gv" x="${X(p.d).toFixed(1)}" y="${(Y(p.y) - 8).toFixed(1)}" text-anchor="middle">${p.y}%</text>`).join('')}
      <text class="gl" x="${P}" y="${H - 6}">${esc(pts[0].d)}</text><text class="gl" x="${W - P / 2}" y="${H - 6}" text-anchor="end">${esc(pts[pts.length - 1].d)}</text></svg>
      <figcaption class="foot">צניחת מתח (Sag) תחת עומס, באחוזים. עלייה לאורך זמן = הזדקנות סוללה או מחבר עם התנגדות. ספים טיפוסיים (״טיפוסי״).</figcaption></figure>`;
  }

  /* ---------- תצוגות ---------- */
  function listHTML() {
    const L = all(), mOpts = Object.keys(DATA.models).map(id => `<option value="${id}" ${id === State.model ? 'selected' : ''}>${esc(DATA.models[id].short)}</option>`).join('');
    return `<p class="lead">כרטיס לכל כלי: היסטוריה, מדידות לאורך זמן ותזכורות תחזוקה. נשמר רק במכשיר.</p>
      <form class="card stack" id="vhForm" autocomplete="off"><h3>כלי חדש</h3><div class="tool-grid">
        <div class="field"><label for="vhLabel">כינוי (לא חובה)</label><input class="input" id="vhLabel" maxlength="80" placeholder="למשל: אופניים אדומים"></div>
        <div class="field"><label for="vhModel">דגם</label><select class="input" id="vhModel">${mOpts}</select></div>
        <div class="field"><label for="vhSerial">מספר סידורי (לא חובה)</label><input class="input" id="vhSerial" maxlength="60"></div>
        <div class="field"><label for="vhKm">ק״מ נוכחי</label><input class="input num" id="vhKm" type="number" inputmode="decimal" min="0" max="1000000" value="0"></div></div>
        <label class="check"><input type="checkbox" id="vhPresets" checked><span>הוסף תזכורות תחזוקה בסיסיות</span></label>
        <button type="submit" class="btn primary">צור כרטיס</button></form>
      ${L.length ? `<div class="stack">${L.map(v => { const due = rem().filter(r => r.vehicleId === v.id && dueOf(r, v).due).length, s = (v.sag || []).slice(-1)[0];
        return `<div class="card veh-row"><div class="spread"><b>${esc(label(v))}</b>${due ? `<span class="due-tag">${due} לביצוע</span>` : ''}</div>
          <span class="foot num"><bdi>${esc((DATA.models[v.model] || {}).short || '')}</bdi>${v.serial ? ' · מס״ד ' + esc(v.serial) : ''} · ${kmOf(v).toLocaleString('he-IL')} ק״מ${s ? ` · Sag אחרון ${sagPct(s)}%` : ''}</span>
          <div class="row"><button type="button" class="btn sm" data-action="vh-open" data-id="${esc(v.id)}">פתח כרטיס</button></div></div>`; }).join('')}</div>` : ''}`;
  }
  function cardHTML(v) {
    const logs = RepairLog.all().filter(x => x.vehicleId === v.id);
    const R = rem().filter(r => r.vehicleId === v.id);
    const sag = (v.sag || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    return `<button type="button" class="back linkbtn" data-action="vh-back">${ICON.prev} כל הכלים</button>
      <div class="card stack"><div class="spread"><h3>${esc(label(v))}</h3><span class="num kmv">${kmOf(v).toLocaleString('he-IL')} ק״מ</span></div>
        <span class="foot"><bdi>${esc((DATA.models[v.model] || {}).name || '')}</bdi>${v.serial ? ' · מס״ד ' + esc(v.serial) : ''} · נפתח ${esc(v.created.slice(0, 10))}</span>
        <div class="row"><button type="button" class="btn sm primary" data-action="vh-newlog" data-id="${esc(v.id)}">תיקון חדש לכלי</button><button type="button" class="btn sm" data-action="vh-quote" data-id="${esc(v.id)}">הצעת מחיר</button><button type="button" class="btn sm ghost" data-action="vh-del" data-id="${esc(v.id)}">מחק כרטיס</button></div></div>
      <div class="card stack"><h3>תזכורות תחזוקה</h3>
        ${R.length ? `<ul class="clean rem-list">${R.map(r => { const d = dueOf(r, v); return `<li class="rem ${d.due ? 'due' : d.soon ? 'soon' : ''}"><span><b>${esc(r.task)}</b><br><span class="foot num">${d.parts.map(p => p.kind === 'km' ? (p.left <= 0 ? `עבר ב-${-p.left} ק״מ` : `בעוד ${p.left} ק״מ`) : (p.left <= 0 ? `עבר ב-${-p.left} ימים` : `בעוד ${p.left} ימים`)).join(' · ')}</span></span>
          <span class="row"><button type="button" class="btn sm ${d.due ? 'primary' : ''}" data-action="rm-done" data-id="${esc(r.id)}">בוצע</button><button type="button" class="btn sm ghost" data-action="rm-del" data-id="${esc(r.id)}" aria-label="מחק תזכורת">מחק</button></span></li>`; }).join('')}</ul>` : '<p class="foot">אין תזכורות.</p>'}
        <form class="tool-grid" id="rmForm" autocomplete="off">
          <div class="field"><label for="rmTask">משימה</label><input class="input" id="rmTask" maxlength="80" list="rmPresets" required><datalist id="rmPresets">${PRESETS.map(p => `<option value="${esc(p[0])}">`).join('')}</datalist></div>
          <div class="field"><label for="rmKm">כל (ק״מ)</label><input class="input num" id="rmKm" type="number" min="0" max="100000" inputmode="numeric"></div>
          <div class="field"><label for="rmDays">או כל (ימים)</label><input class="input num" id="rmDays" type="number" min="0" max="3650" inputmode="numeric"></div>
          <button type="submit" class="btn">הוסף תזכורת</button></form></div>
      <div class="card stack"><h3>בריאות סוללה</h3>${graph(sag)}
        ${sag.length ? `<div class="tbl-wrap"><table class="volt"><thead><tr><th scope="col">תאריך</th><th scope="col">ק״מ</th><th scope="col">מנוחה</th><th scope="col">עומס</th><th scope="col">Sag</th><th scope="col">התנגדות</th></tr></thead><tbody>${sag.slice().reverse().map(s => `<tr><td class="num">${esc(s.date)}</td><td class="num">${s.km ?? '—'}</td><td class="num">${s.rest}V</td><td class="num">${s.load}V</td><td class="num">${sagPct(s)}%</td><td class="num">${mOhm(s) != null ? mOhm(s) + 'mΩ' : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
        <form class="tool-grid" id="sgForm" autocomplete="off">
          <div class="field"><label for="sgRest">מתח במנוחה (V)</label><input class="input num" id="sgRest" type="number" step="0.1" min="10" max="120" inputmode="decimal" required></div>
          <div class="field"><label for="sgLoad">תחת עומס (V)</label><input class="input num" id="sgLoad" type="number" step="0.1" min="5" max="120" inputmode="decimal" required></div>
          <div class="field"><label for="sgA">זרם (A, לא חובה)</label><input class="input num" id="sgA" type="number" step="0.5" min="0" max="200" inputmode="decimal"></div>
          <div class="field"><label for="sgKm">ק״מ (לא חובה)</label><input class="input num" id="sgKm" type="number" min="0" max="1000000" inputmode="numeric"></div>
          <button type="submit" class="btn">שמור מדידה</button></form></div>
      <div class="card stack"><h3>היסטוריית תיקונים (${logs.length})</h3>
        ${logs.length ? `<ol class="timeline">${logs.map(x => `<li><span class="num foot">${esc(x.date)}${typeof x.km === 'number' ? ` · ${x.km} ק״מ` : ''}</span><b>${esc(x.symptoms || 'תיקון')}</b>${x.replaced ? `<span>הוחלף: ${esc(x.replaced)}</span>` : ''}${typeof x.price === 'number' ? `<span class="num">₪${x.price.toLocaleString('he-IL')}</span>` : ''}<span class="status">${esc(x.status)}</span></li>`).join('')}</ol>` : '<p class="foot">עוד אין תיקונים לכלי הזה.</p>'}</div>`;
  }
  function html() {
    if (Persist.isLocked()) return DataUI.lockedCard('כרטיסי הכלים');
    const v = openId && byId(openId);
    return v ? cardHTML(v) : listHTML();
  }
  function bind() {
    const f = $('#vhForm');
    if (f) f.addEventListener('submit', e => {
      e.preventDefault();
      const model = Sec.own(DATA.models, $('#vhModel').value) ? $('#vhModel').value : State.model;
      const v = { id: 'v' + Date.now().toString(36), label: Sec.str($('#vhLabel').value.trim(), 80), model, serial: Sec.str($('#vhSerial').value.trim(), 60), km: Sec.num($('#vhKm').value, 0, 1e6) || 0, created: new Date().toISOString(), sag: [] };
      upsert(v);
      if ($('#vhPresets').checked) Persist.set('reminders', rem().concat(PRESETS.map(([task, km, d], i) => ({ id: 'r' + Date.now().toString(36) + i, vehicleId: v.id, task, everyKm: km, everyDays: d, lastKm: v.km, lastDate: today() }))));
      openId = v.id; UI.toast('נוצר כרטיס'); rerender();
    });
    const rf = $('#rmForm');
    if (rf) rf.addEventListener('submit', e => {
      e.preventDefault();
      const v = byId(openId), km = Sec.num($('#rmKm').value, 0, 1e5) || 0, d = Sec.num($('#rmDays').value, 0, 3650) || 0;
      if (!km && !d) { Sec.fieldMsg($('#rmKm'), 'הזן ק״מ או ימים'); return; }
      Persist.set('reminders', rem().concat([{ id: 'r' + Date.now().toString(36), vehicleId: v.id, task: Sec.str($('#rmTask').value.trim(), 80) || 'תחזוקה', everyKm: km, everyDays: d, lastKm: kmOf(v), lastDate: today() }]));
      rerender();
    });
    const sf = $('#sgForm');
    if (sf) sf.addEventListener('submit', e => {
      e.preventDefault();
      const rest = Sec.num($('#sgRest').value, 10, 120), load = Sec.num($('#sgLoad').value, 5, 120);
      if (rest === null || load === null || load > rest) { Sec.fieldMsg($('#sgLoad'), 'מתח בעומס חייב להיות נמוך מהמתח במנוחה'); return; }
      const v = byId(openId); const s = { date: today(), rest, load, amps: Sec.num($('#sgA').value, 0.1, 200), km: Sec.num($('#sgKm').value, 0, 1e6) };
      v.sag = (v.sag || []).concat([s]).slice(-200); upsert(v);
      const pct = sagPct(s); UI.toast(`Sag ${pct}% – ${pct < 10 ? 'תקין' : pct < 20 ? 'גבוה, עקוב' : 'חמור – בדוק סוללה ומחברים'}`); rerender();
    });
  }
  function rerender() { if (State.mode === 'tools') UI.Modes().tools.render(); notify(); }
  UI.on('vh-open', el => { openId = el.dataset.id; rerender(); $('#panelScroll').scrollTop = 0; });
  UI.on('vh-back', () => { openId = null; rerender(); });
  UI.on('vh-del', el => {
    if (el.dataset.arm !== '1') { el.dataset.arm = '1'; el.textContent = 'לחץ שוב למחיקה'; setTimeout(() => { el.dataset.arm = ''; el.textContent = 'מחק כרטיס'; }, 4000); return; }
    save(all().filter(v => v.id !== el.dataset.id)); Persist.set('reminders', rem().filter(r => r.vehicleId !== el.dataset.id)); openId = null; UI.toast('הכרטיס נמחק (התיקונים נשארו ביומן)'); rerender();
  });
  UI.on('rm-done', el => { const list = rem(), r = list.find(x => x.id === el.dataset.id); if (!r) return; const v = byId(r.vehicleId); r.lastKm = v ? kmOf(v) : r.lastKm; r.lastDate = today(); Persist.set('reminders', list); UI.toast('סומן כבוצע'); rerender(); });
  UI.on('rm-del', el => { Persist.set('reminders', rem().filter(x => x.id !== el.dataset.id)); rerender(); });
  UI.on('vh-newlog', el => { const v = byId(el.dataset.id); if (v) Tools.newLogFor(v); });
  UI.on('vh-quote', el => { Quote.forVehicle(el.dataset.id); });
  return { html, bind, all, byId, kmOf, dueList, notify, sagPct, label, open: id => { openId = id; } };
})();

const Quote = (() => {
  const HOURS = { 1: 0.5, 2: 1, 3: 1.5, 4: 2.5, 5: 4 };
  let q = null;
  const fresh = () => ({ id: 'q' + Date.now().toString(36), vehicleId: '', model: State.model, cause: DiagPro.topCause ? (DiagPro.topCause() || '') : '', hours: null, lines: [], vat: true, note: '' });
  const cause = () => DATA.pro.causes.find(c => c.id === q.cause) || null;
  const rate = () => Sec.num(ProStore.get('rate', ''), 0, 10000);
  const VAT = 0.18;
  function setCause(id) {
    q.cause = id; const c = cause();
    q.hours = c ? HOURS[c.diff] || 1 : null;
    q.lines = c ? (c.parts || []).map(p => ({ t: Sec.str(p, 120), price: null })) : [];
  }
  function totals() {
    const r = rate() || 0, labor = (q.hours || 0) * r, parts = q.lines.reduce((s, l) => s + (l.price || 0), 0), net = labor + parts;
    return { r, labor, parts, net, vat: q.vat ? net * VAT : 0, total: net * (q.vat ? 1 + VAT : 1), missing: q.lines.filter(l => l.price == null).length };
  }
  const money = n => '₪' + (Math.round(n * 100) / 100).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  function html() {
    if (Persist.isLocked()) return DataUI.lockedCard('הצעות המחיר');
    if (!q) { q = fresh(); if (q.cause) setCause(q.cause); }
    const t = totals(), c = cause(), veh = Vehicles.all();
    const causes = DATA.pro.causes.filter(x => !x.requires || x.requires.every(k => vehicleComps().includes(k)));
    return `<p class="lead">הצעת מחיר לפי התעריף שלך. שעות העבודה הן הערכה לפי רמת הקושי – ערוך לפי הניסיון שלך. מחירי חלקים – אתה מזין.</p>
      <div class="card stack"><div class="tool-grid">
        <div class="field"><label for="qtRate">תעריף לשעה (₪)</label><input class="input num" id="qtRate" type="number" min="0" max="10000" inputmode="decimal" value="${esc(rate() ?? '')}"></div>
        <div class="field"><label for="qtVeh">כלי (לא חובה)</label><select class="input" id="qtVeh"><option value="">בלי כרטיס</option>${veh.map(v => `<option value="${esc(v.id)}" ${q.vehicleId === v.id ? 'selected' : ''}>${esc(Vehicles.label(v))}</option>`).join('')}</select></div></div>
        <div class="field"><label for="qtCause">תיקון</label><select class="input" id="qtCause"><option value="">בחר תקלה</option>${causes.map(x => `<option value="${x.id}" ${q.cause === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        ${c ? `<p class="foot">קושי ${c.diff}/5 · ${c.tech ? 'דורש טכנאי' : 'אפשר לבד'} · זמן: ${esc(c.time)}</p>` : ''}
        <div class="field"><label for="qtHours">שעות עבודה ${Conf.badge('typ')}</label><input class="input num" id="qtHours" type="number" step="0.25" min="0" max="100" inputmode="decimal" value="${q.hours ?? ''}"></div>
        <fieldset class="stack plain"><legend class="lbl">חלקים</legend>
          ${q.lines.map((l, i) => `<div class="qt-line"><input class="input" data-qt="t" data-i="${i}" maxlength="120" value="${esc(l.t)}" aria-label="חלק ${i + 1}"><input class="input num" data-qt="p" data-i="${i}" type="number" min="0" max="100000" inputmode="decimal" placeholder="מחיר ₪" value="${l.price ?? ''}" aria-label="מחיר חלק ${i + 1}"><button type="button" class="btn sm ghost" data-action="qt-rm" data-i="${i}" aria-label="הסר שורה">הסר</button></div>`).join('')}
          <button type="button" class="btn sm" data-action="qt-add">הוסף חלק</button></fieldset>
        <label class="check"><input type="checkbox" id="qtVat" ${q.vat ? 'checked' : ''}><span>כולל מע״מ 18% <span class="verify-law">לאמת את השיעור העדכני</span></span></label>
        <div class="field"><label for="qtNote">הערה ללקוח</label><textarea class="input" id="qtNote" rows="2" maxlength="600">${esc(q.note)}</textarea></div></div>
      <div class="card stack print-area" id="qtOut"><h3>הצעת מחיר</h3>
        <dl class="specs"><dt>עבודה</dt><dd class="num">${q.hours ?? 0} ש׳ × ${money(t.r)} = ${money(t.labor)}</dd><dt>חלקים</dt><dd class="num">${money(t.parts)}${t.missing ? ` <span class="foot">(${t.missing} ללא מחיר)</span>` : ''}</dd>
        ${q.vat ? `<dt>מע״מ</dt><dd class="num">${money(t.vat)}</dd>` : ''}<dt>סה״כ</dt><dd class="num total">${money(t.total)}</dd></dl>
        ${!t.r ? `<div class="note warn">${ICON.warn}<span>הזן תעריף לשעה.</span></div>` : ''}</div>
      <div class="row"><button type="button" class="btn primary" data-action="qt-save">שמור הצעה</button><button type="button" class="btn" data-action="qt-copy">העתק</button>${IN_FRAME ? '' : '<button type="button" class="btn ghost" data-action="qt-print">הדפס</button>'}<button type="button" class="btn ghost" data-action="qt-new">הצעה חדשה</button></div>
      <textarea class="input copybox" id="qtBox" hidden rows="6" readonly aria-label="הצעת מחיר להעתקה"></textarea>`;
  }
  function text() {
    const t = totals(), c = cause(), v = q.vehicleId && Vehicles.byId(q.vehicleId);
    return `הצעת מחיר – ${new Date().toLocaleDateString('he-IL')}\n${v ? 'כלי: ' + Vehicles.label(v) + '\n' : ''}תיקון: ${c ? c.name : '—'}\nעבודה: ${q.hours ?? 0} ש׳ × ${money(t.r)} = ${money(t.labor)}\n` +
      q.lines.map(l => `חלק: ${l.t} – ${l.price != null ? money(l.price) : 'לפי מחיר ספק'}`).join('\n') + `\n${q.vat ? `מע״מ: ${money(t.vat)}\n` : ''}סה״כ: ${money(t.total)}\n${q.note ? q.note + '\n' : ''}ההצעה בתוקף 14 יום. המחיר הסופי לפי ממצאי הבדיקה.`;
  }
  function bind() {
    const on = (s, ev, fn) => { const e = $(s); if (e) e.addEventListener(ev, fn); };
    on('#qtRate', 'change', e => { const n = Sec.num(e.target.value, 0, 10000); ProStore.set('rate', n == null ? '' : n); rerender(); });
    on('#qtVeh', 'change', e => { q.vehicleId = Sec.isId(e.target.value) ? e.target.value : ''; });
    on('#qtCause', 'change', e => { setCause(e.target.value); rerender(); });
    on('#qtHours', 'change', e => { q.hours = Sec.num(e.target.value, 0, 100); rerender(); });
    on('#qtVat', 'change', e => { q.vat = e.target.checked; rerender(); });
    on('#qtNote', 'change', e => { q.note = Sec.str(e.target.value, 600); });
    $$('[data-qt]').forEach(i => i.addEventListener('change', () => { const l = q.lines[Number(i.dataset.i)]; if (!l) return; if (i.dataset.qt === 't') l.t = Sec.str(i.value, 120); else { l.price = Sec.num(i.value, 0, 1e5); rerender(); } }));
  }
  function rerender() { if (State.mode === 'tools') UI.Modes().tools.render(); }
  UI.on('qt-add', () => { q.lines.push({ t: '', price: null }); rerender(); });
  UI.on('qt-rm', el => { q.lines.splice(Number(el.dataset.i), 1); rerender(); });
  UI.on('qt-new', () => { q = fresh(); if (q.cause) setCause(q.cause); rerender(); });
  UI.on('qt-copy', () => copyText(text(), $('#qtBox')));
  UI.on('qt-save', () => {
    if (Persist.isLocked()) return;
    const t = totals(), list = Persist.get('quotes').filter(x => x.id !== q.id);
    list.unshift({ id: q.id, at: new Date().toISOString(), vehicleId: q.vehicleId, cause: q.cause, hours: q.hours, lines: q.lines, vat: q.vat, total: Math.round(t.total * 100) / 100, text: text() });
    Persist.set('quotes', list.slice(0, 500)); UI.toast('ההצעה נשמרה');
  });
  UI.on('qt-print', () => { document.body.classList.add('printing'); const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); try { window.print(); } catch (e) { done(); } setTimeout(done, 3000); });
  function forVehicle(id) { q = fresh(); q.vehicleId = id; const v = Vehicles.byId(id); if (v) q.model = v.model; if (q.cause) setCause(q.cause); Tools.go('quote'); }
  return { html, bind, forVehicle, totals: () => totals(), text: () => text(), setCause: id => { if (!q) q = fresh(); setCause(id); } };
})();

(window.BootHooks = window.BootHooks || []).push(() => { Vehicles.notify(); let lk = null; Persist.onChange(s => { if (s.locked !== lk) { lk = s.locked; Vehicles.notify(); } }); });

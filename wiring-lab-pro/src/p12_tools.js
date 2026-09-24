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
        <p class="lead" style="font-size:13.5px">מזינים את נתוני הסוללה המוצעת ומשווים לדגם. מארז שלם בלבד – לא בונים ולא פותחים סוללות.</p>
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
          <div class="field"><label for="lgCust">לקוח (לא חובה)</label><input class="input" id="lgCust" maxlength="120" autocomplete="off" value="${v('customer')}" ${r && r.anon ? 'disabled' : ''}></div>
          <div class="field"><label for="lgPhone">טלפון (לא חובה)</label><input class="input" id="lgPhone" type="tel" inputmode="tel" maxlength="30" autocomplete="off" value="${v('phone')}" ${r && r.anon ? 'disabled' : ''}></div>
          <div class="field"><label for="lgModel">דגם</label><select class="input" id="lgModel">${mOpts}</select></div>
          <div class="field"><label for="lgSerial">מספר סידורי</label><input class="input" id="lgSerial" maxlength="60" value="${v('serial')}"></div>
          <div class="field"><label for="lgStatus">סטטוס</label><select class="input" id="lgStatus">${['פתוח', 'בטיפול', 'ממתין לחלק', 'הסתיים'].map(s => `<option ${((r && r.status) || 'פתוח') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        </div>
        <label class="check" for="lgAnon"><input type="checkbox" id="lgAnon" ${r && r.anon ? 'checked' : ''}><span>לקוח אנונימי – בלי שם וטלפון</span></label>
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
          <label class="check" for="lgMerge" style="border-color:var(--line)"><input type="checkbox" id="lgMerge" checked style="accent-color:var(--accent)"><span>מיזוג עם הרשומות הקיימות (בלי למחוק)</span></label>
          <pre class="import-err" id="lgErr" hidden role="alert"></pre>
          <button type="button" class="btn primary" data-action="lg-doimport">ייבוא</button></div>
        ${items.length ? items.map(x => `<div class="card log-item">
          <div class="spread"><b>${esc(x.anon ? 'לקוח אנונימי' : (x.customer || 'ללא שם'))} · <bdi>${esc((DATA.models[x.model] || {}).short || x.modelName)}</bdi></b><span class="status">${esc(x.status)}</span></div>
          <span class="meta num">${esc(x.date)}${x.serial ? ' · מס״ד ' + esc(x.serial) : ''}</span>
          ${x.symptoms ? `<span>${esc(x.symptoms)}</span>` : ''}${x.measurements ? `<span class="foot">${esc(x.measurements)}</span>` : ''}${x.replaced ? `<span>הוחלף: ${esc(x.replaced)}</span>` : ''}${x.notes ? `<span class="foot">${esc(x.notes)}</span>` : ''}
          <div class="row"><button type="button" class="btn sm" data-action="lg-edit" data-id="${esc(x.id)}">עריכה</button><button type="button" class="btn sm ghost" data-action="lg-report" data-id="${esc(x.id)}">דו״ח ללקוח</button><button type="button" class="btn sm ghost" data-action="lg-del" data-id="${esc(x.id)}">${delArm === x.id ? 'לחצו שוב למחיקה' : 'מחיקה'}</button></div>
        </div>`).join('') : '<p class="lead">אין רשומות עדיין. אפשר גם לשמור תוצאת אבחון ישירות מלשונית האבחון.</p>'}
      </div>
      ${printId ? reportHTML(items.find(x => x.id === printId)) : ''}`;
  }
  function reportText(x) {
    const mm = DATA.models[x.model] || {};
    return `דו״ח תיקון – מעבדת החיווט\nתאריך: ${x.date}\nלקוח: ${x.anon ? 'לקוח אנונימי' : x.customer}${x.phone ? ' · ' + x.phone : ''}\nכלי: ${mm.name || x.modelName}${x.serial ? ' · מס״ד ' + x.serial : ''}\nתלונה: ${x.symptoms}\nמדידות: ${x.measurements}\nהוחלף: ${x.replaced}\nהערות: ${x.notes}\nסטטוס: ${x.status}\n\n${DATA.meta.disclaimer}`;
  }
  function reportHTML(x) {
    if (!x) return '';
    const mm = DATA.models[x.model] || {};
    return `<div class="card stack print-area" id="lgReport"><h3>דו״ח תיקון ללקוח</h3>
      <dl class="specs"><dt>תאריך</dt><dd class="num">${esc(x.date)}</dd><dt>לקוח</dt><dd>${esc(x.anon ? 'לקוח אנונימי' : x.customer)}${x.phone ? ' · <bdi>' + esc(x.phone) + '</bdi>' : ''}</dd><dt>כלי</dt><dd><bdi>${esc(mm.name || x.modelName)}</bdi>${x.serial ? ' · מס״ד ' + esc(x.serial) : ''}</dd>
      <dt>תלונה</dt><dd>${esc(x.symptoms)}</dd><dt>מדידות</dt><dd>${esc(x.measurements)}</dd><dt>הוחלף</dt><dd>${esc(x.replaced)}</dd><dt>הערות</dt><dd>${esc(x.notes)}</dd><dt>סטטוס</dt><dd>${esc(x.status)}</dd></dl>
      <p class="foot">${esc(DATA.meta.disclaimer)}</p>
      <div class="row">${IN_FRAME ? '' : '<button type="button" class="btn sm primary" data-action="lg-print">הדפסה</button>'}<button type="button" class="btn sm" data-action="lg-copyrep" data-id="${esc(x.id)}">העתקת הדו״ח</button><button type="button" class="btn sm ghost" data-action="lg-closerep">סגירה</button></div>
      <textarea class="input copybox" id="lgRepBox" hidden rows="6" readonly aria-label="דו״ח להעתקה"></textarea></div>`;
  }
  function bindLog() {
    if (!$('#logForm')) return;
    const an = $('#lgAnon');
    an.addEventListener('change', () => { ['#lgCust', '#lgPhone'].forEach(s => { const e = $(s); e.disabled = an.checked; if (an.checked) e.value = ''; }); });
    $('#logForm').addEventListener('submit', e => {
      e.preventDefault();
      const anon = $('#lgAnon').checked, phone = anon ? '' : Sec.str($('#lgPhone').value.trim(), 30);
      if (phone && !/^[0-9+()\- ]{6,30}$/.test(phone)) { Sec.fieldMsg($('#lgPhone'), 'ספרות, רווח, + ( ) - בלבד'); $('#lgPhone').focus(); return; }
      const rec = { anon, phone, customer: anon ? '' : Sec.str($('#lgCust').value.trim(), 120), model: $('#lgModel').value, modelName: (DATA.models[$('#lgModel').value] || {}).name, serial: $('#lgSerial').value.trim(), status: $('#lgStatus').value, symptoms: $('#lgSym').value.trim(), measurements: $('#lgMeas').value.trim(), replaced: $('#lgRep').value.trim(), notes: $('#lgNotes').value.trim() };
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
      <div class="card stack"><h3>מטענים לפי מתח</h3><p class="lead" style="font-size:13.5px">מטען מתאים רק כשמתח המלאה <b>ומחבר הטעינה</b> זהים. מחברים שסומנו ⚠️/❓ – לאמת לפני שימוש.</p>
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

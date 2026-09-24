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
      <div class="sec" style="--c:var(--danger)"><h4>אל תעשו</h4><ul class="bul donts">${x.donts.map(p => `<li>${T(p)}</li>`).join('')}</ul></div>
      ${x.compat && x.compat.length ? `<div class="sec" style="--c:var(--warn)"><h4>בדיקת תאימות</h4><ul class="bul">${x.compat.map(p => `<li>${T(p)}</li>`).join('')}</ul></div>` : ''}
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
    else input = `<label class="check" for="wvChk" style="border-color:rgba(61,220,132,.4)"><input type="checkbox" id="wvChk" style="accent-color:var(--ok)" ${ok ? 'checked' : ''}><span>ביצעתי ובדקתי: ${T(s.verify)}</span></label>`;
    const range = v.kind === 'num' ? `צפוי: ${nT(v.min)}–${nT(v.max)}${v.unit}` : v.kind === 'num2' ? `צפוי: ${v.ranges[0][0]}–${v.ranges[0][1]}V / ${v.ranges[1][0]}–${v.ranges[1][1]}V` : '';
    return `${cap ? `<div class="note warn">${ICON.warn}<span>לפני מגע בבקר או במחברי ההספק: המתינו 2 דקות אחרי ניתוק ובדקו שיש 0V (הקבלים שומרים מתח).</span></div>` : ''}
      <div class="verify-box" id="wvBox"><b>בדיקת אימות לפני המשך</b>
        ${v.hint ? `<span class="foot">${T(v.hint)}${range ? ' · ' + esc(range) : ''}</span>` : (range ? `<span class="foot">${esc(range)}</span>` : '')}
        ${input}<span class="vres" id="wvRes" aria-live="polite">${ok ? MK.ok + 'אומת' : ''}</span></div>`;
  }
  function bindStep(scenario, idx, s) {
    const v = spec(s), k = key(scenario, idx);
    const next = $('#modeView .navrow .btn.primary');
    const box = $('#wvBox'), res = $('#wvRes');
    const set = (ok, msg, fail) => {
      passed[k] = !!ok;
      if (next) next.disabled = !ok;
      if (res) res.innerHTML = msg ? (ok ? MK.ok : fail ? MK.bad : '') + msg : '';
      if (box) box.classList.toggle('fail', !!fail);
    };
    if (next) next.disabled = !passed[k];
    const parse = el => { const n = parseFloat(String(el && el.value || '').replace(',', '.')); return isFinite(n) ? n : null; };
    if (v.kind === 'num' || v.kind === 'numFree') {
      const inp = $('#wvIn');
      inp.addEventListener('input', () => {
        const n = parse(inp); if (n == null) { set(false, ''); return; }
        if (v.kind === 'numFree') { set(true, `נרשם: ${n}${v.unit}. השוו למתח שכתוב על הפנס לפני חיבור.`); return; }
        const lo = nT(v.min), hi = nT(v.max);
        if (n < 0 && lo >= 0) { set(false, 'ערך שלילי: החודים הפוכים – או קוטביות הפוכה במחבר. לא מחברים! בדקו שוב.', true); return; }
        if (n >= lo && n <= hi) set(true, `${n}${v.unit} בטווח (${lo}–${hi}${v.unit})`);
        else set(false, `${n}${v.unit} מחוץ לטווח ${lo}–${hi}${v.unit}. לא ממשיכים – חזרו על השלב או <button type="button" class="linkbtn" data-action="goto-diag">עברו לאבחון</button>.`, true);
      });
    } else if (v.kind === 'num2') {
      const a = $('#wvIn'), b = $('#wvIn2');
      const chk = () => {
        const x = parse(a), y = parse(b); if (x == null || y == null) { set(false, ''); return; }
        const ok1 = x >= v.ranges[0][0] && x <= v.ranges[0][1], ok2 = y >= v.ranges[1][0] && y <= v.ranges[1][1];
        if (ok1 && ok2) set(true, 'אות המצערת תקין');
        else set(false, `${!ok1 ? (x > v.ranges[0][1] ? 'אות גבוה במנוחה – סכנת האצה! נתקו ובדקו.' : 'אות נמוך במנוחה – בדקו 5V וחיבור.') : 'אות לא מגיע לפתיחה מלאה – מצערת או חיווט.'}`, true);
      };
      a.addEventListener('input', chk); b.addEventListener('input', chk);
    } else if (v.kind === 'choice') {
      $$('#wvBox [data-wv]').forEach(btn => btn.addEventListener('click', () => {
        $$('#wvBox [data-wv]').forEach(x => x.setAttribute('aria-pressed', String(x === btn)));
        const i = Number(btn.dataset.wv);
        if (i === v.pass) set(true, 'אומת');
        else set(false, 'לא עובר אימות. אל תמשיכו – תקנו או <button type="button" class="linkbtn" data-action="goto-diag">עברו לאבחון</button>.', true);
      }));
    } else {
      const c = $('#wvChk');
      c.addEventListener('change', () => set(c.checked, c.checked ? 'אומת' : ''));
    }
  }
  function reset() { Object.keys(passed).forEach(k => delete passed[k]); }
  return { setupExtra, stepExtra, bindStep, reset };
})();

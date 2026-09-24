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

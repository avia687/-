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
        <span class="pname">${esc(x.c.name)}${x.c.stop === 'battery' ? ' <span class="tag-stop" title="דורש מומחה סוללות">${ICON.batt}<span class="sr-only">דורש מומחה סוללות</span></span>' : x.c.stop === 'noride' ? ' <span class="tag-stop" title="לא לרכוב עד תיקון">${ICON.stop}<span class="sr-only">לא לרכוב עד תיקון</span></span>' : ''}<small class="pro-only">${esc(x.c.pro)}</small></span>
        <span class="pp num">${pct(x.p)}%</span>
        <span class="pbar" aria-hidden="true"><i style="width:${Math.max(2, x.p * 100)}%"></i></span>
      </button></li>`).join('')}</ol>
      <p class="foot">${evCount() ? `מבוסס על ${evCount()} ראיות. ` : 'עדיין אין ראיות – ההסתברויות לפי שכיחות בדגם. '}האחוזים הם הערכה, לא אבחנה.</p>`;
  }
  function nextHTML(post) {
    const s = E.suggest(ev, post);
    if (!s.length) return evCount() ? '<p class="lead">אין מדידה נוספת שתשנה משמעותית את התמונה. אפשר לעבור לסיכום.</p>' : '';
    return `<div class="next-list">${s.map((x, i) => `<button type="button" class="next-m" data-action="dp-open" data-m="${x.m.id}">
      <span class="nm">${i === 0 ? '<span class="best-tag">הכי כדאי</span>' : ''}${esc(x.m.name)}</span>${x.m.live ? Safety.liveBadge() : ''}
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
      <div class="note info beg-only">${ICON.info}<span>בחרו מה קורה (אפשר כמה סימפטומים), והזינו מדידות. המערכת משווה לערכים התקינים של <bdi>${esc(M().short)}</bdi> ומעדכנת את הסבירות של כל סיבה בזמן אמת. ״הכי כדאי״ = המדידה שהכי כדאי לעשות עכשיו.</span></div>
      ${hvBanner()}
      <div class="stack"><h3>מה קורה? <small class="lead">(אפשר לבחור כמה)</small></h3>
        <div class="sym-chips" role="group" aria-label="סימפטומים">${E.symptoms().map(s => `<button type="button" class="chip symchip" data-action="dp-sym" data-s="${s.id}" aria-pressed="${ev.sym.has(s.id)}" style="--c:#00e5ff"><span aria-hidden="true">${esc(s.glyph)}</span> ${esc(s.name)}<small class="pro-only">&nbsp;· ${esc(s.pro)}</small></button>`).join('')}</div></div>
      ${heat ? `<div class="note danger">${ICON.warn}<span><b>חום או ריח:</b> אם יש עשן, ריח שרוף, סוללה חמה מאוד או נפוחה – עוצרים עכשיו. <button type="button" class="btn sm danger" data-action="dp-hazard" data-h="smell">יש סימן סכנה</button></span></div>` : ''}
      <div class="card stack"><div class="spread"><h3>סיבות אפשריות</h3><span class="lead" style="font-size:13px">חיות</span></div><div id="dpProbs" aria-live="polite">${probsHTML(post)}</div></div>
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
      <div class="card stack" style="border-color:rgba(61,220,132,.4)"><h3>בדיקת אימות אחרי התיקון</h3><p class="verify">${TM(c.verify.text)}</p>
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
      <div class="card stack"><h3>מה עוד למדוד</h3>${s.length ? s.map(x => `<div class="esc-row"><b>${esc(x.m.name)}</b> ${x.m.live ? Safety.liveBadge() : ''}<p class="lead" style="font-size:13.5px">${T(x.m.how)}</p><p class="num foot">צפוי: ${TM(x.m.expect)}</p><button type="button" class="btn sm" data-action="dp-open" data-m="${x.m.id}">למדידה</button></div>`).join('') : '<p class="lead">עשיתם את כל המדידות הזמינות. עברו ללשונית ״לסירוגין״ ל-Wiggle Test ולבדיקות עומס, חום ולחות.</p>'}</div>
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
        <div class="sym-chips" role="group" aria-label="תנאים">${DATA.pro.interConditions.map(ic => `<button type="button" class="chip" data-action="dp-inter" data-ic="${ic.id}" aria-pressed="${ev.inter.has(ic.id)}" style="--c:#ff9f1a">${esc(ic.name)}</button>`).join('')}</div></div>
      <div class="card stack"><h3>Wiggle Test – מקטע אחר מקטע</h3>
        <div class="note warn">${ICON.warn}<span>גלגל ההנעה באוויר, ידיים ובגדים רחוקים מהגלגל. מערכת דולקת, צג דולק ומצערת קלה (או PAS בסיבוב ביד). מנענעים בעדינות כל כבל – בעיקר ליד מחברים, צירי קיפול, יציאת הכבל מהציר וסיבוב הכידון.</span></div>
        <ul class="clean wig-list">${bs.map(b => { const c = circuitById(b.circuit); const r = ev.wig[b.id]; return `<li>
          <button type="button" class="linkbtn" data-action="dp-wfocus" data-b="${b.id}"><span class="sw" style="--c:${c ? c.color : '#888'}"></span> ${esc(b.label)}</button>
          <span class="row" role="group" aria-label="${esc(b.label)}"><button type="button" class="btn sm choice" data-action="dp-wig" data-b="${b.id}" data-r="ok" aria-pressed="${r === 'ok'}">יציב</button><button type="button" class="btn sm choice bad" data-action="dp-wig" data-b="${b.id}" data-r="cut" aria-pressed="${r === 'cut'}">גורם לניתוק</button></span></li>`; }).join('')}</ul></div>
      <div class="card stack"><h3>בדיקות נוספות</h3>
        <div class="esc-row"><b>בדיקת עומס</b><p class="lead" style="font-size:13.5px">מדידת צניחת מתח בהאצה – חושפת סוללה חלשה ומחבר עם התנגדות.</p><button type="button" class="btn sm" data-action="dp-open" data-m="m_sag">למדידה</button></div>
        <div class="esc-row"><b>בדיקת חום</b><p class="lead" style="font-size:13.5px">אחרי 10–15 דקות נסיעה: איפה מורגש חום? מחבר חם = התנגדות מגע.</p><button type="button" class="btn sm" data-action="dp-open" data-m="m_hot">למדידה</button></div>
        <div class="esc-row"><b>בדיקת לחות</b><p class="lead" style="font-size:13.5px">ייבוש 24 שעות במקום חם ויבש, ואז ניסיון חוזר. אם זה עזר – סמנו את התנאי ״ייבוש פתר זמנית״ למעלה.</p></div>
      </div>
      <div class="card stack"><h3>יומן אירועים</h3><p class="lead" style="font-size:13.5px">כל פעם שזה קורה – רשמו: תאריך, שעה, טמפרטורה, מצב סוללה, מה עשיתם באותו רגע, ומה הצג הראה.</p>
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
        <div class="kv"><span>זרם בקר ${Conf.badge(ex.controllerAmps ? ex.controllerAmps.conf : 'unk')}</span><b class="num">${ex.controllerAmps && ex.controllerAmps.v ? ex.controllerAmps.v + 'A' : 'לא ידוע'}</b></div>
      </div>
      <div class="stack">${tps.map(tp => `<div class="card tp-card ${tpSel === tp.id ? 'sel' : ''}" id="tp-${tp.id}">
        <div class="spread"><h3>${esc(tp.name)}</h3><span>${tp.live ? Safety.liveBadge() : ''} ${Conf.badge(tp.conf)}</span></div>
        <p class="pro-only foot"><span class="mode">${esc(tp.mode)}</span> · אדום: ${esc(tp.red)} · שחור: ${esc(tp.black)}</p>
        <p class="beg-only">חוד אדום: ${esc(tp.red)} · חוד שחור: ${esc(tp.black)}</p>
        <div class="lcd num">${TM(tp.expect)}</div>
        ${tp.bad ? `<p class="lead" style="font-size:13.5px"><b>ערך חריג:</b> ${T(tp.bad)}</p>` : ''}
        <div class="row"><button type="button" class="btn sm" data-action="tp-show" data-tp="${tp.id}">הצג ב-3D</button>${tp.meas && E.measById(tp.meas) && E.measOK(E.measById(tp.meas)) ? `<button type="button" class="btn sm ghost" data-action="tp-meas" data-m="${tp.meas}">הזנת קריאה לאבחון</button>` : ''}</div>
      </div>`).join('')}</div>
      ${m.hallSequence ? `<div class="card stack"><div class="spread"><h3>רצף Hall תקין</h3>${Conf.badge(m.hallSequence.conf)}</div>
        <p class="lead" style="font-size:13.5px">${esc(m.hallSequence.note)}</p>
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
      <p class="lead" style="font-size:14px">${T(ec.note)}</p>
      ${fams.length ? `<div class="row">${fams.map(f => { const b = DATA.errorCodes.brands.find(x => x.id === f); return `<button type="button" class="btn sm" data-action="dg-brand" data-b="${f}">הצג קודי ${esc(b ? b.name : f)}</button>`; }).join('')}</div>` : '<p class="foot">אין קודים מאומתים לדגם הזה במאגר. לא ממציאים קודים – בדקו במדריך הצג.</p>'}</div>`;
  }
  function codeConf(c) { return Conf.badge((DATA.pro.codeConfidence || {})[c.b] || 'unk'); }

  return { subtabs, handles, html, bind, highlight, reset, modelCodesCard, codeConf, openTP, reportText };
})();

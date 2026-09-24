/* =====================================================================
   p18 · Builder – אשף ״בנה בעצמך״ (לשונית ״בנה בעצמך״)
   מטרה ← חישוב (עם ״למה״ לכל ערך) ← רכיבים מהקטלוג ← תאימות ← דיאגרמת חיווט (SVG)
   ← מדריך הרכבה עם נקודות ״עצור ומדוד״ ← סיכום, רשימת קניות ושמירה.
   · הקטלוג (components.json): רכיבים גנריים בלבד, מחירים כטווח לקטגוריה עם תאריך
     וסימון ״לא מאומת״. מתעדכן מקובץ אחד (בגרסת ה-Web נטען מחדש מהשרת אם חדש יותר).
   · סוללה: ברירת המחדל מארז מוכן עם BMS. בניית מארז – ״מתקדם בלבד״, עם הסכמה.
   · מסומן ״לשימוש בשטח פרטי / לימודי״. במטרה ״דרך ציבורית״ – מגבלות 250W ו-25 קמ״ש.
   ===================================================================== */
const Builder = (() => {
  let CAT = JSON.parse(document.getElementById('components-data').textContent);
  const STEPS = [['goal', 'מטרה'], ['calc', 'חישוב'], ['parts', 'רכיבים'], ['check', 'תאימות'], ['wiring', 'חיווט'], ['guide', 'הרכבה'], ['summary', 'סיכום']];
  const S_OF = { 36: 10, 48: 13, 52: 14 };
  const REQ = ['motor', 'controller', 'battery', 'charger', 'protection', 'wiring'];
  const OPT = ['display', 'throttle', 'pas', 'brakeSensors'];
  let p = null, step = 'goal', gIdx = 0, wireSel = null;
  const newProject = () => ({
    id: 'p' + Date.now().toString(36), name: 'פרויקט המרה', created: new Date().toISOString(), updated: '',
    goal: { use: 'road', riderKg: 80, rangeKm: 40, terrain: 'mixed', speedKmh: 25, voltage: 36, packMode: 'ready' },
    sel: { motor: 'mot_rear_250_36', controller: 'ctl_36_15', battery: 'bat_36_14', charger: 'chg_42_2', display: 'dsp_led', throttle: '', pas: 'pas_12', brakeSensors: 'brk_pair', protection: 'breaker_dc', wiring: 'wire_kit' },
    guide: {}
  });
  const item = id => CAT.items.find(x => x.id === id) || null;
  const itemsOf = cat => CAT.items.filter(x => x.cat === cat);
  const r1 = x => Math.round(x * 10) / 10;
  const cell = () => CAT.cell18650;

  /* ---------- חישוב הנדסי: כל ערך עם ״למה״ ---------- */
  function calc() {
    const g = p.goal, V = Number(g.voltage), S = S_OF[V], c0 = { flat: 9, mixed: 12, hilly: 16 }[g.terrain] || 12;
    const whKm = r1(Math.max(6, c0 * (g.riderKg + 25) / 105));
    const needWh = Math.round(g.rangeKm * whKm * 1.2);
    const needAh = r1(needWh / V);
    const P = Math.max(1, Math.ceil(needAh / cell().ah));
    const mot = item(p.sel.motor), ctl = item(p.sel.controller), bat = item(p.sel.battery);
    const ctlA = ctl ? ctl.spec.amps : null;
    const batMaxA = g.packMode === 'build' ? P * cell().maxA : (bat ? bat.spec.bmsA : null);
    const batAh = g.packMode === 'build' ? P * cell().ah : (bat ? bat.spec.ah : null);
    const cRate = ctlA && batAh ? r1(ctlA / batAh) : null;
    const wg = CAT.wireGauge.rows.find(r => ctlA && ctlA <= r.maxA) || CAT.wireGauge.rows[CAT.wireGauge.rows.length - 1];
    const fuse = ctlA ? CAT.fuseSizes.find(f => f >= ctlA * 1.25) || CAT.fuseSizes[CAT.fuseSizes.length - 1] : null;
    const batWh = batAh ? Math.round(batAh * V) : null;
    const rangeEst = batWh ? Math.round(batWh * 0.8 / whKm) : null;
    const peakW = ctlA ? Math.round(ctlA * V) : null;
    const speed = g.use === 'road' ? 25 : (mot ? (mot.spec.wNom <= 250 ? 27 : mot.spec.wNom <= 500 ? 32 : 40) : null);
    const full = r1(S * cell().vFull), empty = r1(S * cell().vEmpty);
    return {
      V, S, P, whKm, needWh, needAh, ctlA, batMaxA, batAh, cRate, wg, fuse, batWh, rangeEst, peakW, speed, full, empty,
      rows: [
        ['מתח מערכת', `${V}V (${S}S)`, `${S} תאים בטור × 3.6V נומינלי. ${V === 36 ? '36V: פשוט וזול, מספיק ל-250W.' : 'מתח גבוה יותר = פחות זרם לאותו הספק, כבלים דקים יותר וחום נמוך יותר.'} טעון מלא ${full}V, ריק ${empty}V.`],
        ['צריכה משוערת', `${whKm} Wh/ק״מ`, `בסיס ${c0} Wh/ק״מ לשטח ${({ flat: 'מישורי', mixed: 'מעורב', hilly: 'הררי' })[g.terrain]}, מותאם למשקל רוכב+אופניים (${g.riderKg + 25} ק״ג). הערכה טיפוסית – לא מדידה.`],
        ['אנרגיה נדרשת', `${needWh} Wh`, `${g.rangeKm} ק״מ × ${whKm} Wh/ק״מ × 1.2 (מרווח 20% להזדקנות, קור ורוח).`],
        ['קיבולת נדרשת', `${needAh} Ah`, `${needWh} Wh ÷ ${V}V.`],
        ['תצורת תאים', `${S}S${P}P`, `P = ${needAh}Ah ÷ ${cell().ah}Ah לתא (18650 טיפוסי), מעוגל למעלה. ${S * P} תאים, כ-${r1(S * P * cell().weightKg)} ק״ג תאים.`],
        ['זרם מרבי (בקר)', ctlA ? `${ctlA} A` : '—', ctlA ? `לפי הבקר שבחרתם. הספק שיא ≈ ${ctlA}A × ${V}V = ${peakW}W.` : 'בחרו בקר.'],
        ['זרם שהסוללה מספקת', batMaxA ? `${batMaxA} A` : '—', g.packMode === 'build' ? `${P} ענפים × ${cell().maxA}A לתא (טיפוסי). בפועל – לפי גיליון הנתונים של התא.` : 'לפי זרם ה-BMS של המארז. חייב להיות ≥ זרם הבקר.'],
        ['C-rate', cRate != null ? `${cRate}C` : '—', cRate != null ? `${ctlA}A ÷ ${batAh}Ah. ${cRate <= 1 ? 'נמוך – הסוללה לא מתאמצת.' : cRate <= 2 ? 'סביר לתאי אנרגיה.' : 'גבוה – חום והזדקנות מהירה. הגדילו קיבולת או הקטינו זרם.'}` : ''],
        ['חתך כבל ההספק', `${wg.awg} AWG (${wg.mm2} מ״מ²)`, `לזרם עד ${wg.maxA}A. ${CAT.wireGauge.note}.`],
        ['נתיך / מפסק', fuse ? `${fuse} A` : '—', fuse ? `הגודל התקני הראשון שמעל ${ctlA}A × 1.25. מגן על הכבל מקצר – לא על הבקר.` : ''],
        ['טווח משוער', rangeEst ? `${rangeEst} ק״מ` : '—', batWh ? `${batWh}Wh × 80% שמיש ÷ ${whKm} Wh/ק״מ.` : ''],
        ['מהירות', speed ? `${speed} קמ״ש` : '—', g.use === 'road' ? 'בדרך ציבורית הסיוע מוגבל ל-25 קמ״ש (לאמת מול החוק העדכני).' : 'הערכה טיפוסית לפי הספק המנוע, קוטר גלגל ומתח. בשטח פרטי בלבד.']
      ]
    };
  }

  /* ---------- בדיקת תאימות ---------- */
  function checks() {
    const c = calc(), g = p.goal, out = [];
    const mot = item(p.sel.motor), ctl = item(p.sel.controller), bat = item(p.sel.battery), chg = item(p.sel.charger), prot = item(p.sel.protection), dsp = item(p.sel.display), thr = item(p.sel.throttle);
    const add = (lvl, t, why) => out.push({ lvl, t, why });
    REQ.forEach(k => { if (!item(p.sel[k]) && !(k === 'battery' && g.packMode === 'build')) add('bad', `חסר: ${CAT.categories[k].name}`, 'רכיב חובה למערכת.'); });
    if (bat && g.packMode === 'ready') bat.spec.voltage === c.V ? add('ok', `סוללה ${bat.spec.voltage}V = מתח המערכת`, '') : add('bad', `סוללה ${bat.spec.voltage}V ≠ מערכת ${c.V}V`, 'מתח לא תואם שורף בקר או לא מפעיל אותו.');
    if (ctl) ctl.spec.voltage.includes(c.V) ? add('ok', `בקר תומך ב-${c.V}V`, `ניתוק מתח נמוך (LVC) ${ctl.spec.lvc}V – מעל ${c.empty}V של סוללה ריקה.`) : add('bad', `בקר לא תומך ב-${c.V}V`, `הבקר מיועד ל-${ctl.spec.voltage.join('/')}V.`);
    if (mot) mot.spec.voltage.includes(c.V) ? add('ok', `מנוע מתוכנן ל-${c.V}V`, '') : add('warn', `מנוע מתוכנן ל-${mot.spec.voltage.join('/')}V, המערכת ${c.V}V`, 'מתח גבוה מהמתוכנן מעלה מהירות וחום; נמוך – מאבד מהירות.');
    if (chg) chg.spec.forV === c.V ? add('ok', `מטען ${chg.spec.vOut}V מתאים ל-${c.V}V`, '') : add('bad', `מטען ${chg.spec.vOut}V לא מתאים ל-${c.V}V`, 'מטען במתח לא נכון עלול לגרום לשריפה.');
    if (c.ctlA && c.batMaxA) c.batMaxA >= c.ctlA ? add('ok', `הסוללה מספקת ${c.batMaxA}A ≥ בקר ${c.ctlA}A`, '') : add('bad', `הסוללה מספקת ${c.batMaxA}A < בקר ${c.ctlA}A`, 'ה-BMS ינתק תחת עומס, או שהתאים יתחממו.');
    if (c.cRate != null && c.cRate > 2) add('warn', `C-rate גבוה (${c.cRate}C)`, 'בחרו קיבולת גדולה יותר או בקר חלש יותר.');
    if (mot && c.peakW) c.peakW <= mot.spec.wPeak * 1.3 ? add('ok', `הספק שיא ${c.peakW}W מתאים למנוע`, '') : add('warn', `הבקר יכול לדחוף ${c.peakW}W – מעל שיא המנוע ${mot.spec.wPeak}W`, 'המנוע יתחמם; בחרו בקר חלש יותר.');
    if (prot && c.fuse) {
      const vOk = prot.spec.maxV >= c.full, sz = prot.spec.sizes.includes(c.fuse) || prot.spec.sizes.some(s => s >= c.fuse);
      vOk ? add('ok', `${prot.name}: דירוג ${prot.spec.maxV}V ≥ ${c.full}V`, '') : add('bad', `${prot.name}: דירוג ${prot.spec.maxV}V נמוך ממתח מלא ${c.full}V`, 'נתיך במתח נמוך מדי לא מפסיק קשת DC. בחרו מפסק DC מתאים.');
      if (!sz) add('warn', `אין גודל ${c.fuse}A ב${prot.name}`, '');
    }
    if (mot && mot.spec.pos === 'front') add('warn', 'מנוע קדמי: Torque arm חובה ומזלג פלדה', 'מזלג אלומיניום/קרבון עלול להישבר.');
    if (dsp) add('warn', 'צג ובקר – קונים כערכה אחת', 'אין תקן אחיד לפרוטוקול הצג (לא ידוע עד שהיצרן מפרסם).');
    if (g.use === 'road') {
      const legal = mot && mot.legalRoad && mot.spec.wNom <= 250;
      legal ? add('ok', 'מנוע 250W נומינלי – בגבולות האופניים החשמליים', 'לאמת מול החוק העדכני: גם אישור תקן ותווית.') : add('bad', 'המנוע לא מתאים לדרך ציבורית', 'מעל 250W נומינלי. לאמת מול החוק העדכני.');
      if (thr) add('warn', 'מצערת', 'בדקו את החוק העדכני לגבי מצערת באופניים חשמליים.');
    } else add('warn', 'לשימוש בשטח פרטי בלבד', 'הכלי לא מיועד לדרך ציבורית.');
    if (g.packMode === 'build') add('warn', 'בניית מארז – מתקדם בלבד', 'ריתוך נקודתי, נתיכים, איזון ופיקוח על טעינה ראשונה. ברירת המחדל המומלצת: מארז מוכן עם BMS.');
    return out;
  }

  /* ---------- דיאגרמת חיווט (SVG) ---------- */
  function wires() {
    const c = calc(), W = [];
    const add = (id, from, to, color, label, info) => W.push({ id, from, to, color, label, info });
    add('bplus', 'bat', 'prot', '#e53935', `+ · ${c.wg.awg}AWG`, `חיובי מהסוללה לנתיך/מפסק. אדום, ${c.wg.awg} AWG, מחבר ${(item(p.sel.battery) || { spec: { conn: 'xt60' } }).spec.conn.toUpperCase()}. זרם עד ${c.ctlA}A.`);
    add('pctl', 'prot', 'ctl', '#e53935', `+ · ${c.fuse}A`, `מהנתיך (${c.fuse}A) לכניסת הבקר. אדום, ${c.wg.awg} AWG.`);
    add('bminus', 'bat', 'ctl', '#222', `− · ${c.wg.awg}AWG`, `שלילי מהסוללה לבקר. שחור, ${c.wg.awg} AWG. לא עובר דרך הנתיך.`);
    add('phase', 'ctl', 'mot', '#f2c200', '3 פאזות', `שלוש פאזות: צהוב, ירוק, כחול. ${c.wg.awg} AWG, מחברי Bullet. סדר לא נכון – המנוע רועד או מסתובב הפוך.`);
    add('hall', 'mot', 'ctl', '#2e7d32', 'Hall · 5 חוטים', 'חיישני Hall: אדום 5V, שחור GND, צהוב/ירוק/כחול אותות. חוטים דקים, מחבר Julet. לא לחבר עם ההספק מחובר.');
    if (item(p.sel.display)) add('disp', 'ctl', 'dsp', '#1e88e5', 'צג · 5 פינים', 'V+ (מתח סוללה), GND, חוט הדלקה, TX, RX. מחבר Julet 5 פינים (טיפוסי – לפי הערכה).');
    if (item(p.sel.throttle)) add('thr', 'ctl', 'thr', '#8e24aa', 'מצערת · 3', '5V (אדום), GND (שחור), אות (ירוק) 0.8–4.2V.');
    if (item(p.sel.pas)) add('pas', 'ctl', 'pas', '#00897b', 'PAS · 3', '5V, GND, אות פולסים.');
    if (item(p.sel.brakeSensors)) add('brk', 'ctl', 'brk', '#6d4c41', 'בלמים · 2×2', 'חיישן לכל ידית. לחיצה = ניתוק הנעה מיידי. חובה.');
    add('chg', 'chg', 'bat', '#555', 'טעינה', `מטען ${(item(p.sel.charger) || { spec: { vOut: c.full } }).spec.vOut}V לשקע הטעינה בסוללה. לא דרך הבקר.`);
    return W;
  }
  function svgHTML() {
    // פריסה אנכית שמתאימה לרוחב הפאנל: מקור ← הגנה ← בקר ← מנוע וחיישנים
    const N = { bat: [95, 50, 'סוללה'], chg: [305, 50, 'מטען'], prot: [95, 170, 'נתיך / מפסק'], dsp: [305, 170, 'צג'], ctl: [200, 300, 'בקר'], mot: [95, 430, 'מנוע'], thr: [305, 430, 'מצערת'], brk: [95, 550, 'חיישני בלם'], pas: [305, 550, 'PAS'] };
    const present = new Set(['bat', 'prot', 'chg', 'ctl', 'mot']);
    const W = wires(); W.forEach(w => { present.add(w.from); present.add(w.to); });
    const HW = 58, HH = 22;
    const box = id => { const [x, y, t] = N[id]; return `<g class="bd-node" data-node="${id}"><rect x="${x - HW}" y="${y - HH}" width="${HW * 2}" height="${HH * 2}" rx="4"/><text x="${x}" y="${y + 5}" text-anchor="middle">${esc(t)}</text></g>`; };
    const off = { bplus: -10, bminus: 10, hall: 12, phase: -12 };
    const edge = (a, b) => { const [x1, y1] = N[a], [x2, y2] = N[b]; const dx = x2 - x1, dy = y2 - y1; return Math.abs(dy) >= Math.abs(dx) * 0.6 ? [x1, y1 + Math.sign(dy) * HH, 'v'] : [x1 + Math.sign(dx) * HW, y1, 'h']; };
    const line = w => {
      const o = off[w.id] || 0;
      let [x1, y1, k1] = edge(w.from, w.to), [x2, y2, k2] = edge(w.to, w.from);
      if (k1 === 'v') x1 += o; else y1 += o; if (k2 === 'v') x2 += o; else y2 += o;
      const c1 = k1 === 'v' ? `${x1} ${(y1 + y2) / 2}` : `${(x1 + x2) / 2} ${y1}`, c2 = k2 === 'v' ? `${x2} ${(y1 + y2) / 2}` : `${(x1 + x2) / 2} ${y2}`;
      const d = `M${x1} ${y1} C${c1} ${c2} ${x2} ${y2}`;
      const lp = { phase: 0.3, hall: 0.22, brk: 0.8, pas: 0.8, thr: 0.8 }[w.id] || 0.5;
      const mx = x1 + (x2 - x1) * lp + (k1 === 'v' && x1 === x2 ? 6 : 0), my = y1 + (y2 - y1) * lp;
      const casing = /^#(1|2)/.test(w.color) ? `<path class="casing" d="${d}"/>` : '';
      return `<g class="bd-wire${wireSel === w.id ? ' sel' : ''}" data-wire="${w.id}" tabindex="0" role="button" aria-label="${esc(w.label + ': ' + w.info)}">${casing}<path class="core" d="${d}" stroke="${w.color}"/><path class="hit" d="${d}"/><text x="${mx}" y="${my}" text-anchor="${k1 === 'v' && x1 === x2 ? 'start' : 'middle'}" dy="-4">${esc(w.label)}</text></g>`;
    };
    const cur = W.find(w => w.id === wireSel);
    return `<div class="bd-wrap" data-noterm><svg class="bd" viewBox="0 0 400 590" role="group" aria-label="דיאגרמת חיווט – בחרו כבל לפרטים">${W.map(line).join('')}${[...present].map(box).join('')}</svg></div>
      <div class="out-box" id="bdInfo" aria-live="polite">${cur ? `<b>${esc(cur.label)}</b><span>${esc(cur.info)}</span>` : '<span>בחר כבל בדיאגרמה כדי לראות צבע, חתך, מחבר וזרם.</span>'}</div>`;
  }
  /* ---------- מדריך הרכבה: עצור ומדוד ---------- */
  function guide() {
    const c = calc(), mot = item(p.sel.motor);
    return [
      { t: 'בדוק את השלדה והמזלג', do: ['ודא שהנשירה (Dropout) מתאימה לרוחב ציר המנוע.', mot && mot.spec.pos === 'front' ? 'מנוע קדמי: מזלג פלדה בלבד ו-Torque arm.' : 'מנוע אחורי: בדוק מקום לקסטה ולמעביר.', 'בדוק בלמים לפני כל שינוי – הם יעצרו כלי כבד ומהיר יותר.'], m: { kind: 'check', label: 'השלדה והבלמים תקינים ומתאימים' }, comp: 'motor' },
      { t: 'התקן את המנוע', do: ['התקן גלגל, Torque arm ואומי ציר במומנט לפי היצרן.', 'כבל המנוע יוצא כלפי מטה, עם לולאת טפטוף.'], m: { kind: 'num', label: 'התנגדות בין שתי פאזות (Ω)', min: 0.05, max: 1.5, unit: 'Ω', why: 'מודדים לפני חיבור לבקר. OL = חוט קרוע; 0 מוחלט = קצר.' }, comp: 'motor' },
      { t: 'בדוק בידוד המנוע לגוף', do: ['מולטימטר במצב רציפות: כל פאזה מול הציר.'], m: { kind: 'check', label: 'אין רציפות בין אף פאזה לציר' }, comp: 'motor' },
      { t: 'מקם את הבקר', do: ['במקום מאוורר, מוגן ממים ומבוץ, מחברים כלפי מטה.', 'קבע ברצועות – בלי מתח על הכבלים.'], m: null, comp: 'controller' },
      { t: 'חבר מנוע ובקר (בלי סוללה)', do: ['פאזות: צבע לצבע. Hall: מחבר Julet עד הסוף.', 'בודד כל מחבר Bullet בשרוול מתכווץ.'], m: { kind: 'check', label: 'כל חיבורי הפאזה מבודדים, אין נחושת גלויה' }, comp: 'controller' },
      { t: 'חווט נתיך ומחבר סוללה – עדיין לא מחברים', do: [`כבל ${c.wg.awg} AWG, נתיך/מפסק ${c.fuse}A קרוב ככל האפשר לסוללה.`, 'אדום ל-+, שחור ל-−, בדוק פעמיים.'], m: { kind: 'num', label: 'מתח הסוללה במחבר (V)', min: c.empty, max: c.full + 0.3, unit: 'V', why: `חייב להיות חיובי ובין ${c.empty} ל-${c.full}V. מספר שלילי = קוטביות הפוכה – לא מחברים.` }, comp: 'battery' },
      { t: 'חבר צג, מצערת, PAS וחיישני בלם', do: ['כל מחבר לפי הסימון בבקר. לא לכפות מחבר.', 'חיישני בלם – חובה, גם אם מוותרים על מצערת.'], m: null, comp: 'display' },
      { t: 'הדלקה ראשונה – גלגל באוויר', do: ['הרם את הגלגל. חבר סוללה, הדלק צג.', 'מדוד 5V במחבר המצערת/PAS.'], m: { kind: 'num', label: 'אספקת 5V לחיישנים (V)', min: 4.7, max: 5.3, unit: 'V', why: 'נמוך מ-4.7V = קצר באחד החיישנים או בעיה בבקר. נתק ובדוק.' }, comp: 'controller' },
      { t: 'בדוק את מתח כניסת הבקר', do: ['מדוד בכניסת הבקר עם הצג דולק.'], m: { kind: 'num', label: 'מתח בכניסת הבקר (V)', min: c.empty, max: c.full + 0.3, unit: 'V', why: 'צריך להיות כמו מתח הסוללה (±0.5V). הפרש גדול = התנגדות בנתיך או במחבר.' }, comp: 'controller' },
      { t: 'בדוק ניתוק בבלם', do: ['סובב את הגלגל בסיוע נמוך ולחץ על כל ידית בלם.'], m: { kind: 'check', label: 'כל ידית מנתקת את ההנעה מיד' }, comp: 'brakes' },
      { t: 'נסיעת מבחן קצרה בשטח פרטי', do: ['5 דקות בסיוע נמוך. עצור ובדוק חום בבקר, במנוע ובמחברים.', 'חם מאוד למגע = נתק ובדוק חתך כבלים ומחברים.'], m: { kind: 'check', label: 'אין התחממות חריגה, אין ריח, אין רעשים' }, comp: 'motor' }
    ];
  }

  /* ---------- מחיר ומשקל ---------- */
  function totals() {
    const cats = new Set();
    Object.entries(p.sel).forEach(([k, v]) => { if (v && item(v) && !(k === 'battery' && p.goal.packMode === 'build')) cats.add(k); });
    if (p.goal.packMode === 'build') cats.add('packParts');
    let min = 0, max = 0, unverified = 0;
    const lines = [...cats].map(k => {
      const cat = CAT.categories[k], pr = cat.price, it = k === 'packParts' ? null : item(p.sel[k]);
      min += pr.min; max += pr.max; if (!pr.verified) unverified++;
      return { cat: cat.name, item: it ? it.name : (k === 'packParts' ? `${calc().S}S${calc().P}P – ${calc().S * calc().P} תאים + BMS ${calc().S}S` : ''), qty: 1, min: pr.min, max: pr.max, verified: !!pr.verified, updatedAt: pr.updatedAt, source: pr.source, conf: it ? it.conf : 'unk' };
    });
    const c = calc();
    let kg = 1.0;
    ['motor', 'battery'].forEach(k => { const it = item(p.sel[k]); if (it && it.spec.weightKg && !(k === 'battery' && p.goal.packMode === 'build')) kg += it.spec.weightKg; });
    if (p.goal.packMode === 'build') kg += c.S * c.P * cell().weightKg * 1.25;
    return { lines, min, max, unverified, kg: r1(kg) };
  }
  const money = n => '₪' + Math.round(n).toLocaleString('he-IL');

  /* ---------- תצוגות ---------- */
  const confB = c => Conf.badge(c || 'typ');
  function goalHTML() {
    const g = p.goal;
    const opt = (name, v, t, d) => `<label class="check"><input type="radio" name="${name}" value="${v}" ${String(g[name === 'bgUse' ? 'use' : name === 'bgTer' ? 'terrain' : name === 'bgV' ? 'voltage' : 'packMode']) === String(v) ? 'checked' : ''}><span><b>${t}</b>${d ? ` – ${d}` : ''}</span></label>`;
    return `<div class="card stack"><h3>לאן רוכבים?</h3>
        ${opt('bgUse', 'road', 'דרך ציבורית', 'אופניים חשמליים: 250W נומינלי, סיוע עד 25 קמ״ש, תקן')}
        ${opt('bgUse', 'private', 'שטח פרטי / לימודי בלבד', 'בלי מגבלות הדרך – ובלי היתר לרכוב בכביש')}
        ${Legal.modelNote({ cat: 'ebike', motor: { nominal: '' }, speed: '' })}</div>
      <div class="card stack"><h3>מה צריך</h3><div class="tool-grid">
        <div class="field"><label for="bgRange">טווח רצוי (ק״מ)</label><input class="input num" id="bgRange" type="number" inputmode="decimal" min="5" max="200" value="${g.rangeKm}"></div>
        <div class="field"><label for="bgKg">משקל רוכב (ק״ג)</label><input class="input num" id="bgKg" type="number" inputmode="decimal" min="30" max="160" value="${g.riderKg}"></div>
      </div>
        <fieldset class="stack plain"><legend class="lbl">שטח</legend>${opt('bgTer', 'flat', 'מישורי', '')}${opt('bgTer', 'mixed', 'מעורב', '')}${opt('bgTer', 'hilly', 'הררי', '')}</fieldset>
        <fieldset class="stack plain"><legend class="lbl">מתח מערכת</legend>${opt('bgV', 36, '36V', 'פשוט, מספיק ל-250W')}${opt('bgV', 48, '48V', 'פחות זרם, יותר מקום לעליות')}${opt('bgV', 52, '52V', 'שטח פרטי – הספק גבוה')}</fieldset></div>
      <div class="card stack"><h3>סוללה</h3>
        ${opt('bgPack', 'ready', 'מארז מוכן עם BMS (מומלץ)', 'עם תעודת תקן, מחבר ומטען תואמים')}
        ${opt('bgPack', 'build', 'בניית מארז – מתקדם בלבד', 'ריתוך נקודתי, נתיכים, איזון, טעינה ראשונה בפיקוח')}
        ${g.packMode === 'build' ? packHTML() : ''}</div>`;
  }
  function packHTML() {
    const c = calc();
    return `<div class="note danger">${ICON.warn}<span><b>מתקדם בלבד.</b> בניית מארז ליתיום דורשת הכשרה, ציוד ופיקוח. טעות אחת מספיקה לשריפה שלא נכבית במים.</span></div>
      <ul class="bul">
        <li>ריתוך נקודתי בלבד – לא מלחימים ישירות לתאים.</li>
        <li>תאים מאותו דגם ואותה סדרה, במתח זהה (הפרש עד 0.05V) לפני חיבור.</li>
        <li>נתיך לכל ענף או חוט נתיך, ונתיך ראשי.</li>
        <li>BMS ל-${c.S}S, בזרם ≥ ${c.ctlA || '—'}A, עם איזון.</li>
        <li>בידוד: טבעות בידוד על הקטבים, שכבת Fish paper, שרוול מתכווץ חיצוני.</li>
        <li>מדידת מתח כל קבוצה מקבילית לפני סגירה.</li>
        <li>טעינה ראשונה בפיקוח רציף, בחוץ, על משטח לא דליק, עם מטען תואם.</li>
      </ul>`;
  }
  function calcHTML() {
    const c = calc();
    return `<div class="card stack"><h3>החישוב</h3><p class="foot">כל שורה – ערך ולמה. ערכים טיפוסיים לחישוב, לא מדידה.</p>
      <dl class="calc-why">${c.rows.map(([k, v, why]) => `<div class="cw"><dt>${esc(k)}</dt><dd><b class="num">${esc(v)}</b><span class="why"><b>למה:</b> ${esc(why)}</span></dd></div>`).join('')}</dl></div>`;
  }
  function partsHTML() {
    const cats = REQ.concat(OPT).filter(k => !(k === 'battery' && p.goal.packMode === 'build'));
    return `<p class="lead">רכיבים גנריים לפי מפרט – בלי דגמים וספקים. המחיר הוא טווח לקטגוריה.</p>
      ${cats.map(k => { const cat = CAT.categories[k], pr = cat.price; return `<div class="card stack"><div class="spread"><h3>${esc(cat.name)}${OPT.includes(k) ? ' <small class="foot">(לא חובה)</small>' : ''}</h3><span class="num price">${money(pr.min)}–${money(pr.max)}</span></div>
        <label class="sr-only" for="bp-${k}">${esc(cat.name)}</label><select class="input" id="bp-${k}" data-cat="${k}">${OPT.includes(k) ? '<option value="">בלי</option>' : ''}${itemsOf(k).map(x => `<option value="${x.id}" ${p.sel[k] === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        ${(() => { const it = item(p.sel[k]); return it ? `<p class="foot">${confB(it.conf)} ${it.note ? esc(it.note) : ''}</p>` : ''; })()}
        <p class="foot price-meta">${pr.verified ? 'מחיר מאומת' : 'הערכה – לא מאומת'} · עודכן ${esc(pr.updatedAt)} · ${esc(CAT.sourceTypes[pr.source] || pr.source)}</p></div>`; }).join('')}`;
  }
  function checkHTML() {
    const L = checks(), bad = L.filter(x => x.lvl === 'bad').length, warn = L.filter(x => x.lvl === 'warn').length;
    return `<div class="card stack"><h3>${bad ? MK.bad + `${bad} בעיות חוסמות` : warn ? MK.warn + `תואם, עם ${warn} דברים לבדוק` : MK.ok + 'הכול תואם'}</h3>
      <ul class="clean chk-list">${L.map(x => `<li class="verdict ${x.lvl}">${x.lvl === 'ok' ? MK.ok : x.lvl === 'bad' ? MK.bad : MK.warn}<span><b>${esc(x.t)}</b>${x.why ? `<br><span class="foot">${esc(x.why)}</span>` : ''}</span></li>`).join('')}</ul></div>`;
  }
  function guideHTML() {
    const G = guide(), s = G[gIdx], k = 'g' + gIdx, done = !!p.guide[k];
    const verify = s.m ? (s.m.kind === 'num'
      ? `<label class="field"><span class="lbl">${esc(s.m.label)} · צפוי ${s.m.min}–${s.m.max}${esc(s.m.unit)}</span><input class="input num" id="bgMeas" inputmode="decimal" autocomplete="off" value="${p.guide[k] != null && p.guide[k] !== true ? esc(p.guide[k]) : ''}"></label><p class="foot">${esc(s.m.why)}</p>`
      : `<label class="check"><input type="checkbox" id="bgChk" ${done ? 'checked' : ''}><span>${esc(s.m.label)}</span></label>`) : '<p class="foot">אין מדידה בשלב הזה.</p>';
    return `${Legal.privateUse()}
      <div class="progress" aria-hidden="true"><i data-sw="${(gIdx + 1) / G.length * 100}"></i></div>
      <div class="card stack"><p class="eyebrow num">שלב ${gIdx + 1} מתוך ${G.length}</p><h3>${esc(s.t)}</h3><ul class="bul">${s.do.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
        ${s.m ? `<div class="verify-box" id="bgBox"><b>עצור ומדוד</b>${verify}<span class="vres" id="bgRes" aria-live="polite">${done ? MK.ok + 'אומת' : ''}</span></div>` : ''}</div>
      <div class="navrow row"><button type="button" class="btn" data-action="bg-g" data-i="${gIdx - 1}" ${gIdx ? '' : 'disabled'}>הקודם</button>
        <button type="button" class="btn primary" data-action="bg-g" data-i="${gIdx + 1}" id="bgNext" ${!s.m || done ? '' : 'disabled'}>${gIdx === G.length - 1 ? 'סיים' : 'הבא'}</button></div>`;
  }
  function summaryHTML() {
    const c = calc(), t = totals(), L = checks(), bad = L.some(x => x.lvl === 'bad');
    return `${Legal.privateUse()}
      <div class="card stack print-area" id="bgSummary"><h3>${esc(p.name)}</h3>
        <div class="kv-grid"><div class="kv"><span>עלות משוערת</span><b>${money(t.min)}–${money(t.max)}</b></div><div class="kv"><span>משקל תוספת</span><b>${t.kg} ק״ג</b></div>
          <div class="kv"><span>טווח משוער</span><b>${c.rangeEst ?? '—'} ק״מ</b></div><div class="kv"><span>מהירות</span><b>${c.speed ?? '—'} קמ״ש</b></div>
          <div class="kv"><span>מערכת</span><b>${c.V}V ${c.ctlA ?? '—'}A</b></div><div class="kv"><span>תאימות</span><b>${bad ? 'יש חסימות' : 'תקין'}</b></div></div>
        ${t.unverified ? `<div class="note warn">${ICON.warn}<span>${t.unverified} מחירים הם הערכה לא מאומתת. אמתו מול ספק לפני קנייה.</span></div>` : ''}
        <div class="tbl-wrap"><table class="volt"><caption class="sr-only">רשימת קניות</caption><thead><tr><th scope="col">קטגוריה</th><th scope="col">פריט</th><th scope="col">טווח מחיר</th><th scope="col">מקור</th></tr></thead>
        <tbody>${t.lines.map(l => `<tr><th scope="row">${esc(l.cat)}</th><td>${esc(l.item)}</td><td class="num">${money(l.min)}–${money(l.max)}</td><td>${l.verified ? 'מאומת' : 'לא מאומת'} · ${esc(l.updatedAt)}</td></tr>`).join('')}</tbody></table></div>
        <p class="foot">${esc(CAT._doc.split('.')[0])}. מחירים עודכנו ${esc(CAT.updatedAt)}.</p></div>
      <div class="field"><label for="bgName">שם הפרויקט</label><input class="input" id="bgName" maxlength="80" value="${esc(p.name)}"></div>
      <div class="row"><button type="button" class="btn primary" data-action="bg-save">שמור פרויקט</button><button type="button" class="btn" data-action="bg-log">שמור ליומן</button>
        <button type="button" class="btn" data-action="bg-export">ייצא רשימת קניות</button>${IN_FRAME ? '' : '<button type="button" class="btn ghost" data-action="bg-print">הדפס</button>'}</div>
      <textarea class="input copybox" id="bgBox2" hidden rows="6" readonly aria-label="רשימת קניות להעתקה"></textarea>
      ${projectsHTML()}`;
  }
  function projectsHTML() {
    if (Persist.isLocked()) return DataUI.lockedCard('הפרויקטים');
    const list = Persist.get('projects');
    return list.length ? `<div class="card stack"><h3>הפרויקטים שלי (${list.length})</h3><ul class="clean">${list.map(x => `<li class="spread"><span><b>${esc(x.name)}</b> <span class="foot num">${esc((x.updated || x.created || '').slice(0, 10))}</span></span><span class="row"><button type="button" class="btn sm" data-action="bg-open" data-id="${esc(x.id)}">פתח</button><button type="button" class="btn sm ghost" data-action="bg-del" data-id="${esc(x.id)}">מחק</button></span></li>`).join('')}</ul></div>` : '';
  }

  function render() {
    if (!p) p = newProject();
    const body = step === 'goal' ? goalHTML() : step === 'calc' ? calcHTML() : step === 'parts' ? partsHTML() : step === 'check' ? checkHTML() : step === 'wiring' ? svgHTML() : step === 'guide' ? guideHTML() : summaryHTML();
    $('#modeView').innerHTML = `<div><p class="eyebrow">בנה בעצמך · ערכת המרה לאופניים</p><h2>תכנן, חשב, הרכב</h2></div>
      ${Legal.privateUse()}
      <div class="subtabs" role="tablist" aria-label="שלבי הבנייה">${STEPS.map(([id, n], i) => `<button type="button" role="tab" aria-selected="${step === id}" data-action="bg-step" data-s="${id}"><span class="num">${i + 1}</span> ${n}</button>`).join('')}</div>
      <div class="stack">${body}</div>
      ${step !== 'guide' ? `<div class="navrow row">${STEPS.findIndex(s => s[0] === step) > 0 ? '<button type="button" class="btn" data-action="bg-prev">הקודם</button>' : ''}${step !== 'summary' ? '<button type="button" class="btn primary" data-action="bg-next">הבא</button>' : ''}</div>` : ''}`;
    bind(); highlight();
  }
  function touch() { p.updated = new Date().toISOString(); }
  function bind() {
    $$('#modeView input[type="radio"]').forEach(r => r.addEventListener('change', async () => {
      const g = p.goal;
      if (r.name === 'bgUse') g.use = r.value;
      if (r.name === 'bgTer') g.terrain = r.value;
      if (r.name === 'bgV') { g.voltage = Number(r.value); autoPick(); }
      if (r.name === 'bgPack') {
        if (r.value === 'build' && !(await Consent.confirm('buildPack'))) { render(); return; }
        g.packMode = r.value;
      }
      if (g.use === 'road' && g.voltage === 52) { g.voltage = 48; autoPick(); UI.toast('בדרך ציבורית – 36V או 48V עם מנוע 250W'); }
      touch(); render();
    }));
    [['#bgRange', 'rangeKm', 5, 200], ['#bgKg', 'riderKg', 30, 160]].forEach(([s, k, lo, hi]) => { const e = $(s); if (e) e.addEventListener('change', () => { const n = Sec.num(e.value, lo, hi); if (n !== null) { p.goal[k] = n; touch(); } }); });
    $$('#modeView select[data-cat]').forEach(sel => sel.addEventListener('change', () => { if (sel.value && !item(sel.value)) return; p.sel[sel.dataset.cat] = sel.value; touch(); render(); }));
    $$('#modeView [data-wire]').forEach(g => {
      const pick = () => { wireSel = g.dataset.wire; render(); const x = $(`[data-wire="${wireSel}"]`); if (x) x.focus(); };
      g.addEventListener('click', pick); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    const G = step === 'guide' ? guide()[gIdx] : null;
    if (G && G.m) {
      const k = 'g' + gIdx, next = $('#bgNext'), res = $('#bgRes');
      const set = (ok, msg, fail) => { p.guide[k] = ok ? (p.guide[k] === undefined || p.guide[k] === false ? true : p.guide[k]) : false; next.disabled = !ok; res.innerHTML = msg ? (ok ? MK.ok : fail ? MK.bad : '') + msg : ''; };
      if (G.m.kind === 'num') {
        const i = $('#bgMeas');
        i.addEventListener('input', () => {
          const n = Sec.num(i.value); if (n === null) { set(false, ''); return; }
          if (n < 0) { set(false, 'ערך שלילי: קוטביות הפוכה. אל תחבר – תקן ובדוק שוב.', true); return; }
          if (n >= G.m.min && n <= G.m.max) { set(true, `${n}${G.m.unit} בטווח. אפשר להמשיך.`); p.guide[k] = String(n); }
          else set(false, `${n}${G.m.unit} מחוץ לטווח ${G.m.min}–${G.m.max}${G.m.unit}. עצור ובדוק לפני שממשיכים.`, true);
        });
      } else { const c = $('#bgChk'); c.addEventListener('change', () => set(c.checked, c.checked ? 'אומת' : '')); }
    }
    const nm = $('#bgName'); if (nm) nm.addEventListener('change', () => { p.name = Sec.str(nm.value.trim(), 80) || 'פרויקט המרה'; touch(); });
  }
  /** בחירה אוטומטית של רכיבים תואמים אחרי שינוי מתח */
  function autoPick() {
    const V = p.goal.voltage, road = p.goal.use === 'road';
    const pick = (cat, ok) => { const cur = item(p.sel[cat]); if (cur && ok(cur)) return; const x = itemsOf(cat).find(ok); if (x) p.sel[cat] = x.id; };
    pick('motor', x => x.spec.voltage.includes(V) && (!road || x.legalRoad));
    pick('controller', x => x.spec.voltage.includes(V));
    pick('battery', x => x.spec.voltage === V);
    pick('charger', x => x.spec.forV === V);
  }
  const COMP_OF = { motor: 'motor', controller: 'controller', battery: 'battery', display: 'display', brakes: 'brakes' };
  function highlight() {
    const G = step === 'guide' ? guide()[gIdx] : null;
    const id = G ? COMP_OF[G.comp] : step === 'wiring' ? 'controller' : null;
    Scene.select(id && State.vehicle === 'ebike' && Scene.hasComp(id) ? id : null, !!id);
    Scene.highlightBundle(null);
  }
  function shoppingText() {
    const t = totals(), c = calc();
    return `רשימת קניות – ${p.name}\nמעבדת EV · ${new Date().toLocaleDateString('he-IL')}\nמערכת: ${c.V}V, בקר ${c.ctlA}A, כבל ${c.wg.awg}AWG, נתיך ${c.fuse}A\n\n` +
      t.lines.map(l => `- ${l.cat}: ${l.item} | ₪${l.min}–₪${l.max} (${l.verified ? 'מאומת' : 'הערכה, לא מאומת'}, ${l.updatedAt})`).join('\n') +
      `\n\nסה״כ משוער: ₪${t.min}–₪${t.max}\nלשימוש בשטח פרטי / לימודי. מחירים – לאמת מול ספק.`;
  }
  function save() {
    if (Persist.isLocked()) { UI.toast('פתח את הנעילה כדי לשמור'); return false; }
    touch();
    const list = Persist.get('projects').filter(x => x.id !== p.id);
    list.unshift(JSON.parse(JSON.stringify(p)));
    return Persist.set('projects', list.slice(0, 200));
  }
  UI.on('bg-step', el => { step = el.dataset.s; render(); $('#panelScroll').scrollTop = 0; });
  UI.on('bg-next', () => { const i = STEPS.findIndex(s => s[0] === step); step = STEPS[Math.min(STEPS.length - 1, i + 1)][0]; render(); $('#panelScroll').scrollTop = 0; });
  UI.on('bg-prev', () => { const i = STEPS.findIndex(s => s[0] === step); step = STEPS[Math.max(0, i - 1)][0]; render(); $('#panelScroll').scrollTop = 0; });
  UI.on('bg-g', el => { const n = Number(el.dataset.i), G = guide(); if (n >= G.length) { step = 'summary'; UI.toast('ההרכבה הושלמה'); } else gIdx = Math.max(0, n); render(); });
  UI.on('bg-save', () => { if (save()) { UI.toast('הפרויקט נשמר'); render(); } });
  UI.on('bg-log', () => {
    if (!save()) return;
    const c = calc(), t = totals();
    RepairLog.add({ model: '', modelName: 'בנה בעצמך: ' + p.name, symptoms: 'פרויקט בנייה', measurements: Object.entries(p.guide).filter(([, v]) => typeof v === 'string').map(([k, v]) => `${guide()[Number(k.slice(1))].m.label}: ${v}`).join(' · '), replaced: t.lines.map(l => l.item).join(', '), notes: `${c.V}V ${c.ctlA}A · עלות משוערת ₪${t.min}–₪${t.max} · לשימוש בשטח פרטי / לימודי`, status: 'בטיפול' });
    UI.toast('נשמר ליומן');
  });
  UI.on('bg-export', () => offerFile(`shopping-list-${p.id}.txt`, shoppingText(), $('#bgBox2')));
  UI.on('bg-print', () => { document.body.classList.add('printing'); const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); try { window.print(); } catch (e) { done(); } setTimeout(done, 3000); });
  UI.on('bg-open', el => { const x = Persist.get('projects').find(y => y.id === el.dataset.id); if (x) { p = JSON.parse(JSON.stringify(x)); step = 'summary'; gIdx = 0; render(); } });
  UI.on('bg-del', el => { Persist.set('projects', Persist.get('projects').filter(x => x.id !== el.dataset.id)); UI.toast('נמחק'); render(); });

  /** עדכון קטלוג מקובץ components.json בשרת (Web בלבד), אם חדש יותר ועובר בדיקה */
  function refreshCatalog() {
    if (!/^https?:$/.test(location.protocol) || IN_FRAME) return;
    fetch('components.json', { cache: 'no-cache' }).then(r => (r.ok ? r.text() : null)).then(t => {
      if (!t) return;
      const o = Sec.parseJSON(t, 1024 * 1024);
      if (o && o.schema === 1 && Array.isArray(o.items) && o.categories && typeof o.updatedAt === 'string' && o.updatedAt > CAT.updatedAt && o.items.every(x => Sec.isId(x.id) && Sec.own(o.categories, x.cat))) CAT = o;
    }).catch(() => { /* נשארים עם הקטלוג המוטמע */ });
  }
  return { render, restore: highlight, onVehicle() {}, calc: () => calc(), checks: () => checks(), totals: () => totals(), guide: () => guide(), refreshCatalog, catalog: () => CAT, project: () => p, reset() { p = newProject(); step = 'goal'; gIdx = 0; } };
})();
(window.BootHooks = window.BootHooks || []).push(() => Builder.refreshCatalog());

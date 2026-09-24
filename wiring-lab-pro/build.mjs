// build.mjs – בונה את מעבדת החיווט Pro מהקובץ המקורי (src/base.html) + הרחבות.
// שימוש: node build.mjs [--stage=N]
//   dist/index.html    – קובץ עצמאי לפתיחה ישירה בדפדפן
//   dist/artifact.html – אותו תוכן בלי מעטפת (לפרסום כ-Artifact)
//   dist/models.json   – 12 הדגמים כולל כל השדות המורחבים
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = p => path.join(ROOT, 'src', p);
const read = p => fs.readFileSync(SRC(p), 'utf8');
const stageArg = (process.argv.find(a => a.startsWith('--stage=')) || '').split('=')[1];
const STAGE = stageArg ? Number(stageArg) : 99;

let html = read('base.html');

/* ---------- 1. נתונים ---------- */
const OPEN = '<script type="application/json" id="lab-data">';
const i0 = html.indexOf(OPEN), i1 = html.indexOf('</script>', i0);
if (i0 < 0 || i1 < 0) throw new Error('lab-data block not found');
const DATA = JSON.parse(html.slice(i0 + OPEN.length, i1));
const pro = JSON.parse(read('pro-data.json'));
const ext = JSON.parse(read('models-ext.json'));

// תרחישי אשף חדשים
Object.assign(DATA.wizard.scenarios, pro.newScenarios);
delete pro.newScenarios;
DATA.pro = pro;

const battRow = v => DATA.batteryTable.find(b => b.nominal === Number(v));
const r1 = x => Math.round(x * 10) / 10;

function confFromText(t) {
  const s = String(t == null ? '' : t);
  if (!s || s.includes('לא פורסם')) return 'unk';
  if (/משוער|לפי המשווק|לפי המשווקים|טיפוסי/.test(s)) return 'typ';
  return 'ok';
}
function dataConfidence(m, over) {
  const dc = {
    brand: 'ok', kind: 'ok',
    battery: confFromText(`${m.voltage} ${m.ah}`),
    motor: m.motor.nominal.includes('לא פורסם') ? 'unk' : (m.motor.peak.includes('לא פורסם') ? 'typ' : 'ok'),
    controller: m.controller.amps.includes('לא פורסם') ? 'unk' : confFromText(m.controller.amps + ' ' + m.controller.loc),
    tires: confFromText(m.tires), brakes: confFromText(m.brakes), suspension: confFromText(m.suspension),
    weight: confFromText(m.weight), range: confFromText(m.range), speed: 'ok', charging: confFromText(m.charging),
    display: confFromText(m.display), lights: confFromText(m.lights), extras: confFromText(m.extras)
  };
  return Object.assign(dc, over || {});
}

/** נקודות בדיקה לכל דגם – נגזרות מהפריסה ומ-omit, עם ערכים מחושבים ממתח הסוללה */
function testPoints(id, m) {
  const layout = DATA.layouts[m.layout];
  const comps = layout.components.filter(c => !(m.omit || []).includes(c));
  const has = c => comps.includes(c);
  const b = battRow(m.voltage), E = r1(b.empty), F = r1(b.full);
  const dual = has('motorFront');
  const T = [];
  T.push({ id: 'tp_batt', comp: 'battery', bundle: 'power', name: 'מתח הסוללה ביציאה', mode: 'DC V · 200V', red: '+ במחבר ההספק (צד הסוללה)', black: '− באותו מחבר', live: true, unit: 'V', min: E, max: F, expect: `${E}–${F}V`, bad: '0V: מפתח כבוי / BMS ניתק / נתיך. נמוך מ-' + E + 'V: סוללה פרוקה. מעל ' + F + 'V: מטען או סוללה לא תואמים.', meas: 'm_batt', conf: 'ok' });
  T.push({ id: 'tp_ctrl_in', comp: 'controller', bundle: 'power', name: dual ? 'מתח בכניסת הבקר הקדמי' : 'מתח בכניסת הבקר', mode: 'DC V · 200V', red: 'אדום עבה בכניסת הבקר (Back-probe)', black: 'שחור עבה בכניסת הבקר', live: true, unit: 'V', min: E, max: F, expect: 'כמו מתח הסוללה (±0.5V)', bad: 'נמוך מהסוללה ב-0.5V ומעלה: התנגדות במחבר ההספק או בנתיך. 0V: נתק בקו ההספק.', meas: 'm_ctrl_in', conf: 'ok' });
  if (dual) T.push({ id: 'tp_ctrlR_in', comp: 'controllerRear', bundle: 'powerR', name: 'מתח בכניסת הבקר האחורי', mode: 'DC V · 200V', red: 'אדום בכניסת הבקר האחורי', black: 'שחור בכניסת הבקר האחורי', live: true, unit: 'V', min: E, max: F, expect: 'כמו מתח הסוללה (±0.5V)', bad: '0V: מחבר או נתיך של הבקר האחורי.', conf: 'ok' });
  T.push({ id: 'tp_cap', comp: 'controller', bundle: 'power', name: 'פריקת קבלים לפני מגע', mode: 'DC V · 200V', red: '+ בצד הבקר של מחבר ההספק', black: '− בצד הבקר', live: false, unit: 'V', min: 0, max: 2, expect: 'פחות מ-2V אחרי 2 דקות', bad: 'מתח שנשאר גבוה: הקבלים לא נפרקו – ממתינים ובודקים שוב, לא נוגעים.', conf: 'typ' });
  if (has('chargePort')) {
    if (ext[id] && ext[id].builtInCharger) T.push({ id: 'tp_charge', comp: 'chargePort', bundle: 'charge', name: 'שקע טעינה (מטען מובנה – AC)', mode: '—', red: '—', black: '—', live: false, unit: '', expect: 'אין מדידת DC בשקע – זה חשמל ביתי', bad: 'לא פותחים את הפלטפורמה כשהקורקינט מחובר לחשמל. תקלת טעינה – לשירות.', conf: 'ok' });
    else T.push({ id: 'tp_charge', comp: 'chargePort', bundle: 'charge', name: 'מתח המטען בלי עומס', mode: 'DC V · 200V', red: '+ בתקע המטען', black: '− בתקע המטען', live: true, unit: 'V', min: r1(F - 1.2), max: r1(F + 1.2), expect: `≈ ${F}V (±1V)`, bad: '0V או נמוך: מטען תקול. גבוה: מטען לא מתאים – לא לטעון!', meas: 'm_charger', conf: 'ok' });
  }
  if (has('display')) {
    T.push({ id: 'tp_disp_v', comp: 'display', bundle: 'display', name: 'V+ במחבר הצג', mode: 'DC V · 200V', red: 'פין V+ (לרוב אדום)', black: 'פין GND (לרוב שחור)', live: true, unit: 'V', min: E, max: F, expect: 'כמו מתח הסוללה', bad: '0V: כבל הצג/מחבר/יציאת הבקר.', meas: 'm_disp', conf: 'typ' });
    T.push({ id: 'tp_disp_k', comp: 'display', bundle: 'display', name: 'חוט ההדלקה (Power Lock)', mode: 'DC V · 200V', red: 'חוט ההדלקה (לרוב כחול)', black: 'GND', live: true, unit: 'V', expect: 'כבוי: 0V · דולק: כמו מתח הסוללה', bad: 'אין מתח כשהצג ״דולק״: צג/כפתור/חוט הדלקה.', conf: 'typ' });
  }
  if (has('throttle')) {
    T.push({ id: 'tp_thr_5v', comp: 'throttle', bundle: 'throttle', name: 'אספקת 5V למצערת', mode: 'DC V · 20V', red: 'אדום במחבר המצערת', black: 'שחור', live: true, unit: 'V', min: 4.8, max: 5.2, expect: '4.8–5.2V', bad: 'נמוך/0V: קצר באחד החיישנים או ספק 5V בבקר.', meas: 'm_5v', conf: 'typ' });
    T.push({ id: 'tp_thr_sig', comp: 'throttle', bundle: 'throttle', name: 'אות המצערת', mode: 'DC V · 20V', red: 'ירוק (אות)', black: 'שחור', live: true, unit: 'V', expect: 'כ-0.8V במנוחה ← 3.4–4.3V בפתיחה מלאה', bad: 'מעל 1.2V במנוחה: מצערת תקועה – סכנת האצה. לא עולה: מצערת תקולה.', meas: 'm_thr_rest', conf: 'typ' });
  } else T.push({ id: 'tp_5v', comp: 'pas', bundle: 'pas', name: 'אספקת 5V לחיישנים (במחבר ה-PAS)', mode: 'DC V · 20V', red: 'אדום במחבר ה-PAS', black: 'שחור', live: true, unit: 'V', min: 4.8, max: 5.2, expect: '4.8–5.2V', bad: 'נמוך/0V: קצר באחד החיישנים או ספק 5V בבקר.', meas: 'm_5v', conf: 'typ' });
  const motorTP = (mid, bPh, bHall, label) => {
    T.push({ id: 'tp_hall_5v' + mid, comp: mid ? 'motorFront' : 'motor', bundle: bHall, name: 'אספקת 5V לחיישני Hall' + label, mode: 'DC V · 20V', red: 'אדום במחבר ה-Hall', black: 'שחור', live: true, unit: 'V', min: 4.8, max: 5.2, expect: '4.8–5.2V', bad: '0V: חוט אדום קרוע או קצר ב-5V.', conf: 'typ' });
    T.push({ id: 'tp_hall_sig' + mid, comp: mid ? 'motorFront' : 'motor', bundle: bHall, name: 'אותות Hall בסיבוב איטי' + label, mode: 'DC V · 20V', red: 'צהוב / ירוק / כחול – כל אחד בתורו', black: 'שחור במחבר ה-Hall', live: true, unit: 'V', expect: 'כל אות מתחלף 0V ↔ כ-5V', bad: 'אות תקוע על 0V או 5V: חיישן Hall או חוט ביציאה מהציר.', meas: mid ? null : 'm_hall', conf: 'typ' });
    T.push({ id: 'tp_phase_r' + mid, comp: mid ? 'motorFront' : 'motor', bundle: bPh, name: 'התנגדות בין פאזות' + label, mode: 'Ω · 200Ω', red: 'פאזה אחת (צד המנוע, מחבר מנותק)', black: 'פאזה שנייה', live: false, unit: 'Ω', min: 0.1, max: 1.0, expect: 'שלושה ערכים נמוכים ודומים (כ-0.1–1Ω)', bad: 'ערך פתוח (OL) או שונה מאוד: חוט פאזה קרוע או מחבר שרוף.', meas: mid ? null : 'm_phase_r', conf: 'typ' });
    T.push({ id: 'tp_phase_axle' + mid, comp: mid ? 'motorFront' : 'motor', bundle: bPh, name: 'בידוד פאזה לגוף המנוע' + label, mode: 'Ω · 20MΩ / רציפות', red: 'כל פאזה בתורה', black: 'ציר המנוע (מתכת נקייה)', live: false, unit: 'Ω', expect: 'אין רציפות (OL)', bad: 'יש רציפות: קצר לגוף – לא מחברים לבקר, לטכנאי.', conf: 'ok' });
  };
  if (has('motor')) motorTP('', 'phase', 'hall', dual ? ' – מנוע אחורי' : '');
  if (dual) motorTP('F', 'phaseF', 'hallF', ' – מנוע קדמי');
  if (has('brakes')) T.push({ id: 'tp_brake', comp: 'brakes', bundle: 'brakeL', name: 'חיישן בלם', mode: 'רציפות (צפצוף) / DC V · 20V', red: 'פין האות', black: 'פין GND', live: false, unit: '', expect: 'NO: משוחרר – אין צפצוף, לחוץ – צפצוף (NC הפוך). חיישן Hall: 5V ← 0V בלחיצה', bad: 'לא משתנה: חוט קרוע – אין ניתוק (לא לרכוב). תקוע ״לחוץ״: אין הנעה.', meas: 'm_brake', conf: 'typ' });
  if (has('pas')) {
    if (has('throttle')) T.push({ id: 'tp_pas_5v', comp: 'pas', bundle: 'pas', name: 'אספקת 5V ל-PAS', mode: 'DC V · 20V', red: 'אדום במחבר ה-PAS', black: 'שחור', live: true, unit: 'V', min: 4.8, max: 5.2, expect: '4.8–5.2V', bad: '0V: כבל PAS קרוע ליד הציר.', conf: 'typ' });
    T.push({ id: 'tp_pas_sig', comp: 'pas', bundle: 'pas', name: 'אות PAS בסיבוב פדלים', mode: 'DC V · 20V', red: 'חוט האות (כחול/ירוק/לבן)', black: 'שחור', live: true, unit: 'V', expect: 'פולסים 0V ↔ כ-5V עם כל מגנט', bad: 'אין פולסים: מרווח/דיסק הפוך/חיישן.', meas: 'm_pas', conf: 'typ' });
  }
  if (has('lightFront')) T.push({ id: 'tp_light', comp: 'lightFront', bundle: 'lightF', name: 'מתח יציאת התאורה', mode: 'DC V · 200V', red: 'אדום (+ תאורה)', black: 'שחור', live: true, unit: 'V', expect: '6V / 12V / מתח סוללה – משתנה בין דגמים', bad: 'מדדו לפני החלפת פנס. מתח לא תואם = פנס שרוף.', conf: 'unk' });
  if (dual) T.push({ id: 'tp_link', comp: 'controllerRear', bundle: 'link', name: 'כבל התקשורת בין הבקרים', mode: 'רציפות (צפצוף)', red: 'פין בקצה אחד', black: 'אותו פין בקצה השני', live: false, unit: '', expect: 'רציפות בכל החוטים', bad: 'אין רציפות: כבל קרוע/מחבר רטוב – רק גלגל אחד מניע.', meas: 'm_link', conf: 'typ' });
  if (has('alarm')) T.push({ id: 'tp_alarm', comp: 'alarm', bundle: 'alarm', name: 'מצב האזעקה', mode: 'שלט', red: '—', black: '—', live: false, unit: '', expect: 'פתוחה: ההנעה זמינה', bad: 'נעולה: המערכת לא מניעה גם כשהכול תקין.', meas: 'm_alarm', conf: 'unk' });
  return T;
}
function expectedValues(id, m) {
  const b = battRow(m.voltage), e = ext[id] || {};
  const layout = DATA.layouts[m.layout];
  const comps = layout.components.filter(c => !(m.omit || []).includes(c));
  const ev = {
    battery: { nominal: b.nominal, cells: b.s + 'S', full: b.full, empty: b.empty, conf: 'ok' },
    charger: e.builtInCharger ? { v: 'מטען מובנה (שקע AC)', conf: 'ok' } : { v: b.full, unit: 'V', conf: 'ok' },
    sensor5v: { min: 4.8, max: 5.2, conf: 'typ' },
    hall: { low: 0, high: 5, conf: 'typ' },
    phaseOhm: { min: 0.1, max: 1.0, conf: 'typ' },
    controllerAmps: { v: e.controllerAmpsNum || null, conf: e.controllerAmpsNum ? (m.controller.amps.includes('לא פורסם') ? 'unk' : 'ok') : 'unk' },
    lights: { v: '6V / 12V / מתח סוללה', conf: 'unk' }
  };
  if (comps.includes('throttle')) ev.throttle = { rest: [0.6, 1.1], full: [3.4, 4.3], conf: 'typ' };
  if (comps.includes('pas')) ev.pas = { v: 'פולסים 0/5V', conf: 'typ' };
  return ev;
}
const HALL120 = { type: '120°', states: ['101', '100', '110', '010', '011', '001'], conf: 'typ', note: 'רוב מנועי ה-Hub עובדים בזווית 120°: בכל צעד משתנה חוט אחד, ואף פעם לא כל השלושה 0 או 5V. 000 או 111 מעידים על חיישן תקול, או על מנוע 60° (נדיר). היצרן לא פרסם – טיפוסי.' };
function torque(m, e) {
  const t = m.cat === 'ebike' ? ['tq_caliper', 'tq_rotor', 'tq_lever', 'tq_stem', 'tq_crank', 'tq_axle'] : ['tq_lever', 'tq_bar', 'tq_axle'];
  if (m.cat === 'scooter' && /דיסק/.test(m.brakes)) t.unshift('tq_caliper', 'tq_rotor');
  (e.torqueExtra || []).forEach(x => { if (!t.includes(x)) t.push(x); });
  return t;
}

const specIssues = [];
for (const id of Object.keys(DATA.models)) {
  const m = DATA.models[id], e = ext[id];
  if (!e) throw new Error('missing models-ext for ' + id);
  const { confOverrides, torqueExtra, ...rest } = e;
  Object.assign(m, rest);
  m.dataConfidence = dataConfidence(m, confOverrides);
  m.testPoints = testPoints(id, m);
  m.expectedValues = expectedValues(id, m);
  m.hallSequence = HALL120;
  m.torque = torque(m, e);
  // בדיקת עקביות אוטומטית: Wh מול V×Ah, מתח מול טבלת התאים
  const calc = Math.round(m.voltage * m.ah);
  if (Math.abs(calc - m.wh) / m.wh > 0.03) specIssues.push(`${id}: Wh=${m.wh} אבל V×Ah=${calc}`);
  if (!battRow(m.voltage)) specIssues.push(`${id}: מתח ${m.voltage}V לא בטבלת התאים`);
}
if (specIssues.length) console.log('spec issues:', specIssues);

// עיצוב: בלי אימוג׳י/סמלים בכפתורי סימפטומים
DATA.diagnostics.symptoms.forEach(x => { x.glyph = ''; });
DATA.pro.bayesSymptoms.forEach(x => { x.glyph = ''; });
const dataJSON = JSON.stringify(DATA, null, 1).replace(/<\/script/gi, '<\\/script');
html = html.slice(0, i0 + OPEN.length) + '\n' + dataJSON + '\n' + html.slice(i1);

/* ---------- 2. אקדמיה (JSON נפרד – מפוענח רק בפתיחה) ---------- */
if (STAGE >= 3) {
  const acad = JSON.stringify(JSON.parse(read('academy.json'))).replace(/<\/script/gi, '<\\/script');
  html = html.replace(OPEN, `<script type="application/json" id="academy-data">${acad}</script>\n${OPEN}`);
}

/* ---------- 3. תיקוני חיבור (כל מחרוזת חייבת להימצא בדיוק פעם אחת) ---------- */
function patch(from, to, label) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`patch "${label}" matched ${n} times`);
  html = html.replace(from, () => to);
}
// CSS
patch('</style>\n<div id="app">', '</style>\n<style>\n' + read('pro.css') + '\n</style>\n<div id="app">', 'css');
// HTML: רמות משתמש + מצב סדנה
patch('    <nav class="modes" role="tablist" aria-label="מצב עבודה" id="modeTabs">',
  `    <div class="prefs" id="prefs">
      <div class="seg" role="radiogroup" aria-label="רמת משתמש" id="levelSeg">
        <button type="button" role="radio" data-level="beg" aria-checked="true">מתחיל</button>
        <button type="button" role="radio" data-level="pro" aria-checked="false">מקצוען</button>
      </div>
      <button type="button" class="toggle" id="quickBtn" aria-pressed="false" hidden title="מצב מהיר: בלי הסברים">מהיר</button>
      <button type="button" class="toggle" id="workshopBtn" aria-pressed="false" title="מצב סדנה: טקסט וכפתורים גדולים">סדנה</button>
      <span class="save-state" id="saveState" role="status" aria-live="polite"></span>
    </div>
    <nav class="modes" role="tablist" aria-label="מצב עבודה" id="modeTabs">`, 'prefs');
patch('aria-controls="modeView" aria-selected="false" tabindex="-1">אבחון תקלות</button>',
  'aria-controls="modeView" aria-selected="false" tabindex="-1">אבחון תקלות</button>\n      <button type="button" role="tab" id="tab-tools" data-mode="tools" aria-controls="modeView" aria-selected="false" tabindex="-1">כלים</button>', 'tools tab');
patch('    <button class="safety-btn" id="hazardOpen" type="button" aria-haspopup="dialog">', '    <nav class="legal-links" aria-label="מסמכים"><a href="terms.html" data-legal="terms">תנאי שימוש</a><a href="privacy.html" data-legal="privacy">פרטיות</a></nav>\n    <button class="safety-btn" id="hazardOpen" type="button" aria-haspopup="dialog">', 'legal links');
patch('  <div class="toast" id="toast" role="status" aria-live="polite"></div>\n</div>', '  <div class="toast" id="toast" role="status" aria-live="polite"></div>\n</div>\n<template id="tpl-terms">' + read('legal/terms.html') + '</template>\n<template id="tpl-privacy">' + read('legal/privacy.html') + '</template>', 'legal templates');
patch('  <main class="workspace">', '  <div class="notices" id="notices"></div>\n  <main class="workspace">', 'notices');
patch('  <div class="toast" id="toast" role="status" aria-live="polite"></div>',
  '  <div class="gtip" id="gtip" role="tooltip" hidden></div>\n  <div class="toast" id="toast" role="status" aria-live="polite"></div>', 'gtip');
// Store + Modes + boot
patch("    if (DATA.models[saved.model]) setModelState(saved.model);", "    if (Object.prototype.hasOwnProperty.call(DATA.models, saved.model)) setModelState(saved.model);", 'store hasOwn');
patch(`<span class="live" style="\${tech ? '' : 'color:var(--ok);background:var(--ok-soft);border-color:rgba(61,220,132,.4)'}">`, `<span class="live\${tech ? '' : ' live-ok'}">`, 'tech style');
patch("if (['learn', 'wizard', 'diag'].includes(saved.mode)) State.mode = saved.mode;", "if (['learn', 'wizard', 'diag', 'tools'].includes(saved.mode)) State.mode = saved.mode;", 'store modes');
patch('function Modes() { return { learn: Learn, wizard: Wizard, diag: Diagnostics }; }', 'function Modes() { return { learn: Learn, wizard: Wizard, diag: Diagnostics, tools: Tools }; }', 'Modes');
patch('(function boot() {', 'function bootBase() {', 'boot open');
{
  const k = html.lastIndexOf('})();\n</script>');
  if (k < 0) throw new Error('boot close not found');
  html = html.slice(0, k) + '}\n</script>' + html.slice(k + '})();\n</script>'.length);
}
patch("  return { init, on, toast, showComp, closeComp, setMode, setModel, modelOptions, setCircuit, openSheet, onPick, onHover, swatch, colorHex, wireList, isMobile, syncToolbar };",
  "  return { init, on, toast, showComp, closeComp, setMode, setModel, modelOptions, setCircuit, openSheet, onPick, onHover, swatch, colorHex, wireList, isMobile, syncToolbar, Modes };", 'UI api');
// UI: חיבור בחירה בתלת-ממד לסימולטור + תוספות לפאנל רכיב
patch("  function onPick(r, x, y, pointerType) {\n    hideHint();\n    if (!r) { hideTip(); return; }",
  "  function onPick(r, x, y, pointerType) {\n    hideHint();\n    if (!r) { hideTip(); return; }\n    if (window.PickHook && r.type === 'comp' && window.PickHook(r.id)) { hideTip(); return; }", 'pick hook');
patch("      ${modelCompHTML(id)}\n      <div class=\"card stack\"><h3>מפרט אופייני</h3>",
  "      ${modelCompHTML(id)}\n      ${ProUI.compExtra(id)}\n      <div class=\"card stack\"><h3>מפרט אופייני</h3>", 'comp extra');
// Learn: אקדמיה, מילון, אמינות במפרט
patch("const SUBS = [['model', 'הדגם'], ['compare', 'השוואה'], ['tour', 'סיור'], ['concepts', 'מושגים'], ['volts', 'מתחים'], ['comps', 'רכיבים']];",
  "const SUBS = [['model', 'הדגם'], ['academy', 'אקדמיה'], ['compare', 'השוואה'], ['tour', 'סיור'], ['concepts', 'מושגים'], ['volts', 'מתחים'], ['comps', 'רכיבים'], ['glossary', 'מילון']];", 'learn subs');
patch("    const body = sub === 'model' ? modelHTML()", "    const body = sub === 'academy' ? Academy.html() : sub === 'glossary' ? Glossary.html() : sub === 'model' ? modelHTML()", 'learn body');
patch("    if (sub === 'volts') { ['socNom', 'socMeas'].forEach(id => $('#' + id).addEventListener('input', updateSoc)); updateSoc(); }",
  "    if (sub === 'volts') { ['socNom', 'socMeas'].forEach(id => $('#' + id).addEventListener('input', updateSoc)); updateSoc(); }\n    if (sub === 'academy') Academy.bind();\n    if (sub === 'glossary') Glossary.bind();", 'learn bind');
patch("  function highlight(focus = true) {\n    if (sub === 'tour' && step >= 0) {",
  "  function highlight(focus = true) {\n    if (sub === 'academy') { Academy.highlight(focus); return; }\n    if (sub === 'tour' && step >= 0) {", 'learn highlight');
patch("<dl class=\"specs\">${specRows(m).map(s => `<dt>${esc(s[0])}</dt><dd>${T(s[1])}</dd>`).join('')}</dl></div>",
  "<dl class=\"specs\">${specRows(m).map(s => `<dt>${esc(s[0])}</dt><dd>${T(s[1])} ${Conf.badgeFor(m, s[0])}</dd>`).join('')}</dl>${Conf.modelExtraHTML(m)}${Legal.modelNote(m)}</div>", 'spec conf');
// Wizard: תנאים מקדימים, אימות מדידה, תרחישים חדשים
patch("      <div class=\"card stack\" style=\"border-color:rgba(255,77,77,.35)\">\n        <h3>בדיקת בטיחות לפני עבודה</h3>",
  "      ${WizardPlus.setupExtra(scenario)}\n      <div class=\"card stack\" style=\"border-color:rgba(255,77,77,.35)\">\n        <h3>בדיקת בטיחות לפני עבודה</h3>", 'wiz setup');
patch("      <div class=\"navrow\">\n        <button type=\"button\" class=\"btn\" data-action=\"wz-go\" data-i=\"${idx - 1}\"",
  "      ${WizardPlus.stepExtra(scenario, idx, s)}\n      <div class=\"navrow\">\n        <button type=\"button\" class=\"btn\" data-action=\"wz-go\" data-i=\"${idx - 1}\"", 'wiz step');
patch("  UI.on('wz-start', () => { phase = 'steps'; idx = 0;", "  UI.on('wz-start', () => { WizardPlus.reset(); phase = 'steps'; idx = 0;", 'wiz reset');
patch("    if (phase === 'setup') bindSetup();\n    highlight();", "    if (phase === 'setup') bindSetup();\n    if (phase === 'steps') WizardPlus.bindStep(scenario, idx, steps()[idx]);\n    highlight();", 'wiz bind');
// Diagnostics: תתי-לשוניות חדשות
patch("  let sub = 'sym', symId = null, nodeId = null", "  let sub = 'adv', symId = null, nodeId = null", 'diag default');
patch(`    return \`<div class="subtabs" role="tablist" aria-label="כלי אבחון">
      <button type="button" role="tab" aria-selected="\${sub === 'sym'}" data-action="dg-sub" data-sub="sym">אבחון לפי סימפטום</button>
      <button type="button" role="tab" aria-selected="\${sub === 'codes'}" data-action="dg-sub" data-sub="codes">קודי שגיאה</button></div>\`;`, '    return DiagPro.subtabs(sub);', 'diag subtabs');
patch("    if (sub === 'codes') body = codesHTML();\n    else if (!symId) body = listHTML();", "    if (DiagPro.handles(sub)) body = DiagPro.html(sub);\n    else if (sub === 'codes') body = codesHTML();\n    else if (!symId) body = listHTML();", 'diag body');
patch("${(!symId || sub === 'codes') ?", "${(!symId || sub !== 'sym') ?", 'diag header');
patch("    if (sub === 'codes') {\n      const inp = $('#codeSearch');", "    if (DiagPro.handles(sub)) { DiagPro.bind(sub); } else if (sub === 'codes') {\n      const inp = $('#codeSearch');", 'diag bind');
patch("  function highlight(focus = true) {\n    if (sub === 'sym' && symId) {", "  function highlight(focus = true) {\n    if (DiagPro.handles(sub)) { DiagPro.highlight(focus); return; }\n    if (sub === 'sym' && symId) {", 'diag highlight');
patch("  function codesHTML() {\n    return `\n      <div class=\"field\"><label for=\"codeSearch\">", "  function codesHTML() {\n    return `${DiagPro.modelCodesCard()}\n      <div class=\"field\"><label for=\"codeSearch\">", 'codes card');
patch("<span class=\"brand-tag\">${esc((DATA.errorCodes.brands.find(b => b.id === c.b) || { name: c.b }).name)}</span>", "<span class=\"brand-tag\">${esc((DATA.errorCodes.brands.find(b => b.id === c.b) || { name: c.b }).name)} ${DiagPro.codeConf(c)}</span>", 'code conf');
patch("onVehicle() { reset(); }, abort() { if (symId)", "onVehicle() { reset(); DiagPro.reset(); }, abort() { if (symId)", 'diag onVehicle');

// Three.js בטעינה עצלה: Scene הוא אובייקט שמתמלא אחרי הטעינה; לולאת ציור רק כשצריך
patch("const Scene = (typeof THREE === 'undefined') ? SceneStub : (() => {", "const Scene = Object.assign({}, SceneStub, { wake() {}, loaded: false });\nfunction makeScene() { return (() => {", 'scene lazy open');
patch("    hasComp: id => !!comps[id],\n    resize() { sizeDirty = true; }\n  };\n})();", "    hasComp: id => !!comps[id],\n    resize() { sizeDirty = true; },\n    wake() { if (!running) { running = true; requestAnimationFrame(frame); } },\n    loaded: true\n  };\n})(); }", 'scene lazy close');
patch("  function frame(now) {\n    requestAnimationFrame(frame);", "  let running = false;\n  function frame(now) {\n    if (!Perf.shouldRender()) { running = false; return; }\n    requestAnimationFrame(frame);", 'frame gate');
patch("    camera.position.copy(h.pos); controls.target.copy(h.target); camera.lookAt(h.target);\n    requestAnimationFrame(frame);\n  }", "    camera.position.copy(h.pos); controls.target.copy(h.target); camera.lookAt(h.target);\n    running = true; requestAnimationFrame(frame);\n  }", 'start running');
{
  const a0 = html.indexOf("  const loader = $('#loader');\n  if (typeof THREE === 'undefined') {");
  const a1 = html.indexOf('}\n</script>', a0);
  if (a0 < 0 || a1 < 0) throw new Error('boot 3d block not found');
  html = html.slice(0, a0) + "  UI.setMode(State.mode, true);\n  Perf.boot3D();\n" + html.slice(a1);
}
patch("  function setModel(id) {\n    if (!DATA.models[id] || id === State.model) return;", "  function setModel(id) {\n    if (!DATA.models[id] || id === State.model) return;\n    if (!ModelData.ready(id)) { toast('טוען את נתוני הדגם…'); ModelData.ensure(id).then(() => setModel(id), () => toast('נתוני הדגם לא נטענו – בדקו חיבור')); return; }", 'setModel lazy');
patch('<div class="stage-tools">', '<div class="stage-tools">\n        <button type="button" class="icon-btn" id="saverBtn" aria-pressed="false" aria-label="חיסכון סוללה – כיבוי התלת-ממד" title="חיסכון סוללה – כיבוי התלת-ממד"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 10.5v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 10v4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>', 'saver btn');

// עיצוב (שלב D): לוגו, שם, סמל סכנה, בורר ערכת תצוגה, צבעי תלת-ממד
patch('<button class="hazard-chip" id="hazardChip" type="button" hidden>⛔ סומן מצב סיכון</button>', '<button class="hazard-chip" id="hazardChip" type="button" hidden>סומן מצב סיכון</button>', 'hazard chip');
{
  const b0 = html.indexOf('<svg class="logo" viewBox="0 0 40 40" aria-hidden="true">'), b1 = html.indexOf('</svg>', b0);
  if (b0 < 0) throw new Error('logo not found');
  html = html.slice(0, b0) + '<svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="104" fill="#1b1e22"/><rect x="118" y="118" width="276" height="136" rx="20" fill="#0d2238" stroke="#3d8bff" stroke-width="12"/><path d="M146 200h46l22-46 34 88 24-42h94" fill="none" stroke="#ff7a1a" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="206" cy="356" r="30" fill="#ff7a1a"/><circle cx="306" cy="356" r="30" fill="none" stroke="#e8eaed" stroke-width="12"/>' + html.slice(b1);
}
patch('        <h1>מעבדת החיווט</h1>\n        <p class="sub">חשמל לאופניים ולקורקינטים – לומדים, מתקינים, מאבחנים</p>', '        <h1>מעבדת EV</h1>\n        <p class="sub">חשמל לאופניים ולקורקינטים: מדוד, אבחן, תקן</p>', 'brand');
patch('      <span class="save-state" id="saveState" role="status" aria-live="polite"></span>', '      <label class="sr-only" for="themeSel">ערכת תצוגה</label><select id="themeSel" class="input theme-sel"><option value="auto">תצוגה: לפי המכשיר</option><option value="dark">כהה</option><option value="light">בהירה</option><option value="day">אור יום (שמש)</option></select>\n      <span class="save-state" id="saveState" role="status" aria-live="polite"></span>', 'theme select');
patch("scene.background = col('#0b0f14');", "scene.background = col('#16191c');", 'scene bg');
patch("scene.fog = new THREE.Fog(col('#0b0f14'), 4.5, 11);", "scene.fog = new THREE.Fog(col('#16191c'), 4.5, 11);", 'scene fog');
patch("color: 0x0d141b, side: THREE.BackSide", "color: 0x15181b, side: THREE.BackSide", 'env box');
patch("new THREE.GridHelper(6, 30, 0x0f4652, 0x15232e)", "new THREE.GridHelper(6, 30, 0x2f3740, 0x21262b)", 'grid');
/* ---------- 4. מודולים חדשים ---------- */
const MODS = [
  ['p06_sec.js', 1], ['p06b_storage.js', 1], ['p07_core_pro.js', 1], ['p08_diag_engine.js', 2], ['p09_diag_ui.js', 2], ['p10_academy.js', 3], ['p11_meter_sim.js', 3],
  ['p12_tools.js', 4], ['p13_wizard_plus.js', 4], ['p15_data_ui.js', 4], ['p16_legal.js', 4], ['p17_perf.js', 1], ['p14_boot_pro.js', 1]
];
let js = MODS.filter(([, s]) => s <= STAGE).map(([f]) => read(f)).join('\n');
if (STAGE < 4) js = read('stubs.js') + '\n' + js;
html = html.replace(/\n?$/, '') + `\n<script>\n'use strict';\n${js}\n</script>\n`;
// SRI ל-Three.js (אותו קובץ בדיוק כמו ב-cdnjs r128 – sha512 נבדק מול החבילה ב-npm)
const THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const THREE_LOCAL = path.join(ROOT, 'vendor', 'three.min.js');
const THREE_SRI = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(THREE_LOCAL)).digest('base64');
const threeCfg = src => `<script type="application/json" id="three-src">${JSON.stringify({ src, sri: THREE_SRI })}</script>`;
patch(`<script src="${THREE_SRC}"></script>`, threeCfg(THREE_SRC), 'three lazy cfg');

// פרטיות: בלי גופנים מ-CDN (גם בגרסת ה-Artifact)
html = html.replace(/<link rel="preconnect"[^>]*>\n?|<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/g, '');
if (/fonts\.g(oogleapis|static)/.test(html)) throw new Error('google fonts left');

/* ---------- 5. CSP: בלי style="" ----------
   סגנון סטטי → data-sx + כלל CSS; רוחב דינמי → data-sw; צבע דינמי → data-sc (מוחלים ב-Sec.applyStyles) */
const sxRules = [];
{
  const map = new Map();
  html = html.replace(/style="width:\$\{([^"]*)\}%"/g, 'data-sw="${$1}"');
  html = html.replace(/style="--c:\$\{([^"]*)\}"/g, 'data-sc="${$1}"');
  html = html.replace(/style="([^"$]*)"/g, (_, css) => {
    if (!map.has(css)) { map.set(css, 's' + map.size); }
    return `data-sx="${map.get(css)}"`;
  });
  for (const [css, k] of map) sxRules.push(`[data-sx="${k}"]{${css.split(';').filter(Boolean).map(d => d.trim() + ' !important').join(';')}}`);
  const left = html.match(/style="[^"]*"/g);
  if (left) throw new Error('inline style left: ' + left.slice(0, 3).join(' | '));
}
patch('</style>\n<div id="app">', '</style>\n<style>\n/* generated from inline styles */\n' + sxRules.join('\n') + '\n</style>\n<div id="app">', 'sx css');

// מיקרו-קופי: פעלים קצרים בגוף שני
const COPY = [['שמירה ליומן', 'שמור ליומן'], ['העתקת דו״ח לטכנאי', 'העתק דו״ח לטכנאי'], ['העתקת דו״ח', 'העתק דו״ח'], ['למדידה', 'מדוד'], ['ניקוי', 'נקה'], ['דווחו על סכנה', 'דווח על סכנה'],
  ['העתקת תבנית יומן', 'העתק תבנית יומן'], ['הזנת קריאה לאבחון', 'הזן קריאה לאבחון'], ['לבדיקות לסירוגין', 'בדוק תקלה לסירוגין'], ['ניסיון נוסף', 'נסה שוב'], ['הגשה', 'הגש'],
  ['הדפסה / שמירה כ-PDF', 'הדפס או שמור PDF'], ['העתקת טקסט התעודה', 'העתק את התעודה'], ['החלפת נתיך במד', 'החלף נתיך במד'], ['סיום תרגיל', 'סיים תרגיל'], ['ייצוא JSON', 'ייצא JSON'],
  ['ייבוא', 'ייבא'], ['עריכה', 'ערוך'], ['דו״ח ללקוח', 'הפק דו״ח'], ['הדפסה', 'הדפס'], ['העתקת הדו״ח', 'העתק דו״ח'], ['סגירה', 'סגור'], ['עברו לאבחון', 'עבור לאבחון'],
  ['התקנה כאפליקציה', 'התקן כאפליקציה'], ['ייצוא כל הנתונים שלי', 'ייצא את כל הנתונים שלי'], ['פתיחה עם PIN', 'פתח עם PIN'], ['אין סימני סכנה – חזרה', 'אין סימני סכנה – חזור'],
  ['הבנתי – סגירה', 'הבנתי – סגור'], ['התחלת הסיור', 'התחל סיור'], ['יציאה מהאשף', 'צא מהאשף'], ['מעבר לאבחון', 'עבור לאבחון'], ['פתיחת מאגר קודי השגיאה', 'פתח מאגר קודים'], ['חזרה', 'חזור'],
  ['התקנה נוספת', 'התקנה חדשה']];
for (const [a, b] of COPY) {
  const re = new RegExp('(<button[^>]*>)' + a.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(</button>)', 'g');
  if (!re.test(html)) throw new Error('copy not found: ' + a);
  html = html.replace(re, (_, o, c) => o + b + c);
}

/* ---------- 5b. ערכת עיצוב + גופנים (מקומיים, בלי CDN) ---------- */
const FONTS = [['Plex Hebrew', 'plex-he-hebrew', [400, 600, 700], 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F'],
  ['Plex Hebrew', 'plex-he-latin', [400, 600, 700], 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
  ['Plex Mono', 'plex-mono', [500, 600], 'U+0000-00FF,U+2000-206F,U+2212']];
const fontFaces = urlOf => FONTS.flatMap(([fam, file, ws, range]) => ws.map(w => `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w === 500 && fam === 'Plex Mono' ? '400 500' : w};font-display:swap;src:url(${urlOf(file.startsWith('plex-mono') ? `${file}-${w}` : `${file}-${w}`)}) format('woff2');unicode-range:${range}}`)).join('\n');
const fontFile = n => path.join(ROOT, 'src', 'fonts', n + '.woff2');
const themeCSS = read('theme.css');
patch('<div id="app">', '<style>\n' + themeCSS.replace('/*@FONTS@*/', '/*@FONTFACES@*/') + '\n</style>\n<div id="app">', 'theme css');
// צבע הדגשה חדש (כחול מולטימטר) במקום הציאן הישן – גם ב-SVG ובתלת-ממד
html = html.split('#00e5ff').join('#5aa2ff').split('rgba(0,229,255,').join('rgba(90,162,255,').split('0x00e5ff').join('0x5aa2ff').split('#7af3ff').join('#8fc0ff');
// אין אימוג׳י בממשק
{
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2705}\u{274C}\u{2753}\u{2757}\u{2B50}\u{2713}\u{2717}\u{2715}\u{FE0F}]/gu;
  const scan = html.replace(/<template id="tpl-(terms|privacy)">[\s\S]*?<\/template>/g, '');
  const found = scan.match(EMOJI);
  if (found) { const i = scan.search(EMOJI); throw new Error('emoji in UI: ' + [...new Set(found)].join(' ') + ' near: ' + scan.slice(Math.max(0, i - 60), i + 10)); }
}
// גופנים ב-Artifact: מוטמעים (data URI) – אין בקשה חיצונית
const htmlArtifact = html.replace('/*@FONTFACES@*/', fontFaces(n => `data:font/woff2;base64,${fs.readFileSync(fontFile(n)).toString('base64')}`));
html = html.replace('/*@FONTFACES@*/', fontFaces(n => `fonts/${n}.woff2`));

/* ---------- 6. פלט ---------- */
const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'artifact.html'), htmlArtifact);
fs.writeFileSync(path.join(DIST, 'index.html'),
  `<!DOCTYPE html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>מעבדת EV</title>\n</head>\n<body>\n${htmlArtifact}\n</body>\n</html>\n`);
/* ---------- גרסת Web (PWA) – CSP קשיח: default-src 'self', בלי קוד inline ---------- */
{
  const WEB = path.join(DIST, 'web');
  fs.rmSync(WEB, { recursive: true, force: true });
  fs.mkdirSync(path.join(WEB, 'vendor'), { recursive: true });
  let w = html;
  const css = [];
  w = w.replace(/<style>\n?([\s\S]*?)<\/style>\n?/g, (_, c) => { css.push(c); return ''; });
  const scripts = [];
  w = w.replace(/<script>\n?([\s\S]*?)<\/script>\n?/g, (_, c) => { scripts.push(c); return `@@SCRIPT${scripts.length - 1}@@`; });
  if (scripts.length !== 2) throw new Error('expected 2 inline scripts, got ' + scripts.length);
  const sri = t => 'sha384-' + crypto.createHash('sha384').update(t).digest('base64');
  // נתוני דגמים: שדות כבדים שנקראים רק לדגם הנוכחי → data/m-<id>.json
  const LAZY = ['testPoints', 'expectedValues', 'hallSequence', 'commonFailures', 'failureWeights', 'errorCodes', 'torque', 'sources', 'maintenance', 'faults', 'strengths', 'overview', 'compNotes', 'electric'];
  fs.mkdirSync(path.join(WEB, 'data'), { recursive: true });
  {
    const j0 = w.indexOf(OPEN), j1 = w.indexOf('</script>', j0);
    const D = JSON.parse(w.slice(j0 + OPEN.length, j1));
    for (const id of Object.keys(D.models)) {
      const m = D.models[id], part = {};
      LAZY.forEach(k => { if (k in m) { part[k] = m[k]; delete m[k]; } });
      m._lazy = true;
      fs.writeFileSync(path.join(WEB, 'data', `m-${id}.json`), JSON.stringify(part));
    }
    D.lazyFields = LAZY;
    w = w.slice(0, j0 + OPEN.length) + '\n' + JSON.stringify(D).replace(/<\/script/gi, '<\\/script') + '\n' + w.slice(j1);
  }
  // אייקונים ו-manifest
  fs.mkdirSync(path.join(WEB, 'icons'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'icons'))) fs.copyFileSync(path.join(ROOT, 'src', 'icons', f), path.join(WEB, 'icons', f));
  fs.writeFileSync(path.join(WEB, 'manifest.webmanifest'), JSON.stringify({
    name: 'מעבדת EV – חשמל לאופניים וקורקינטים', short_name: 'מעבדת EV', lang: 'he', dir: 'rtl',
    description: 'לימוד, התקנה ואבחון של מערכות חשמל באופניים ובקורקינטים חשמליים. עובד בלי רשת.',
    start_url: './', scope: './', display: 'standalone', orientation: 'any', background_color: '#16181b', theme_color: '#16181b', categories: ['education', 'utilities'],
    icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }]
  }, null, 1));
  fs.writeFileSync(path.join(WEB, 'app.css'), css.join('\n'));
  fs.writeFileSync(path.join(WEB, 'app.js'), scripts[0]);
  fs.writeFileSync(path.join(WEB, 'pro.js'), scripts[1]);
  fs.copyFileSync(THREE_LOCAL, path.join(WEB, 'vendor', 'three.min.js'));
  fs.mkdirSync(path.join(WEB, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'fonts'))) fs.copyFileSync(path.join(ROOT, 'src', 'fonts', f), path.join(WEB, 'fonts', f));
  w = w.replace(threeCfg(THREE_SRC), threeCfg('vendor/three.min.js'));
  if (!w.includes('"src":"vendor/three.min.js"')) throw new Error('three cfg not replaced');
  w = w.replace('@@SCRIPT0@@', `<script src="app.js" integrity="${sri(scripts[0])}"></script>\n`).replace('@@SCRIPT1@@', `<script src="pro.js" integrity="${sri(scripts[1])}"></script>\n`);
  if (/<script(?![^>]*(type="application\/json"|src=))/.test(w)) throw new Error('inline script left in web build');
  if (/\son[a-z]+=["']/i.test(w.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, ''))) throw new Error('inline handler in web build');
  const CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
  fs.writeFileSync(path.join(WEB, 'index.html'), `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>מעבדת EV</title>
<meta name="theme-color" content="#16181b">
<meta name="description" content="לימוד, התקנה ואבחון של מערכות חשמל באופניים ובקורקינטים חשמליים. עובד בלי רשת, הנתונים נשמרים רק במכשיר.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/apple-180.png">
<link rel="preload" href="fonts/plex-he-hebrew-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/plex-he-hebrew-700.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="app.css" integrity="${sri(css.join('\n'))}">
</head>
<body>
${w}
</body>
</html>
`);
  for (const doc of ['terms', 'privacy']) {
    fs.writeFileSync(path.join(WEB, doc + '.html'), `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${doc === 'terms' ? 'תנאי שימוש' : 'מדיניות פרטיות'} – מעבדת EV</title>
<link rel="stylesheet" href="app.css">
</head>
<body class="legal-page">
<p><a href="./">חזרה למעבדה</a></p>
${read('legal/' + doc + '.html')}
</body>
</html>
`);
  }
  // Service Worker: precache של כל הקבצים, גרסה לפי hash של התוכן
  {
    const files = [];
    const walk = d => fs.readdirSync(path.join(WEB, d)).forEach(f => { const r = d ? d + '/' + f : f; if (fs.statSync(path.join(WEB, r)).isDirectory()) walk(r); else if (!['_headers', 'sw.js'].includes(r)) files.push(r); });
    walk('');
    const h = crypto.createHash('sha256'); files.sort().forEach(f => h.update(f).update(fs.readFileSync(path.join(WEB, f))));
    const ver = h.digest('hex').slice(0, 12);
    fs.writeFileSync(path.join(WEB, 'sw.js'), `/* מעבדת EV – Service Worker. עבודה מלאה בלי רשת. גרסה ${ver} */
'use strict';
const CACHE = 'ev-lab-app-${ver}';
const ASSETS = ${JSON.stringify(['./'].concat(files.sort()))};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ev-lab-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match(url.pathname.endsWith('.html') ? req : './', { ignoreSearch: true }).then(r => r || fetch(req)).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'skipWaiting') self.skipWaiting(); });
`);
    console.log(`web: ${files.length} files precached, sw ${ver}`);
  }
  // כותרות לשרת (Netlify/Cloudflare Pages) – frame-ancestors לא נתמך ב-meta
  fs.writeFileSync(path.join(WEB, '_headers'), `/*
  Content-Security-Policy: ${CSP}; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
`);
}
fs.writeFileSync(path.join(DIST, 'models.json'), JSON.stringify({ _doc: 'מעבדת החיווט – 12 הדגמים עם שדות מורחבים. conf: ok=מאומת, typ=טיפוסי/משוער, unk=לא ידוע.', confLegend: pro.confLegend, torqueRef: pro.torqueRef, models: DATA.models }, null, 1));
console.log(`built stage ${STAGE}: ${(html.length / 1024).toFixed(0)} KB, models: ${Object.keys(DATA.models).length}`);

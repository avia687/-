// שלב G – ״בנה בעצמך״. PW=$(npm root -g)/playwright node tests/stageG.cjs
const fs = require('fs'), path = require('path');
const { serve, launch, watch, assert, prep, DIST } = require('./lib.cjs');
(async () => {
  const browser = await launch(); const errors = [];
  const { srv, url } = await serve();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  const p = await ctx.newPage(); watch(p, errors);
  await p.goto(url + 'index.html');
  await p.evaluate(async () => { await window.__testReady(); Consent.record('terms'); Legal.close(); });
  const ev = f => p.evaluate(f);
  const go = s => ev(`document.querySelector('[data-action="bg-step"][data-s="${s}"]').click()`);

  // קטלוג: בלי מחירים ״מומצאים״ – כל מחיר עם תאריך, מקור וסימון אימות
  const cat = JSON.parse(fs.readFileSync(path.join(DIST, 'components.json'), 'utf8'));
  assert(Object.values(cat.categories).every(c => c.price.updatedAt && c.price.source && c.price.verified === false) && cat.items.every(x => !/https?:|www\./.test(JSON.stringify(x))) && cat.items.every(x => ['ok', 'typ', 'unk'].includes(x.conf)),
    `components.json: ${cat.items.length} רכיבים גנריים, בלי קישורים; ${Object.keys(cat.categories).length} טווחי מחיר – כולם עם תאריך ומקור ומסומנים ״לא מאומת״`);

  await ev(() => document.querySelector('[data-mode="build"]').click());
  const g1 = await ev(() => ({ priv: /לשימוש בשטח פרטי ולמטרות לימוד/.test(document.querySelector('#modeView').textContent), law: /לאמת מול החוק העדכני/.test(document.querySelector('#modeView').textContent) }));
  assert(g1.priv && g1.law, 'לשונית ״בנה בעצמך״: סימון ״לשימוש בשטח פרטי / לימודי״ ואזהרה משפטית במטרה');

  await go('calc');
  const c = await ev(() => ({ rows: [...document.querySelectorAll('.calc-why .cw')].map(r => [r.querySelector('dt').textContent, r.querySelector('dd>b').textContent, r.querySelector('.why').textContent]), calc: Builder.calc() }));
  assert(c.rows.length === 12 && c.rows.every(r => /^למה:/.test(r[2].trim()) && r[2].length > 12), 'מחשבון: 12 ערכים, לכל אחד שורת ״למה״');
  assert(c.calc.whKm === 12 && c.calc.needWh === 576 && c.calc.S === 10 && c.calc.P === 6 && c.calc.fuse === 20 && c.calc.wg.awg === 14 && c.calc.cRate === 1.1, `ערכים נכונים: 576Wh → 10S6P, בקר 15A → נתיך 20A, כבל 14AWG, ‏C-rate ${c.calc.cRate}`);

  // מטרה: 52V בדרך ציבורית → חוזר ל-48V; שטח פרטי מאפשר
  await go('goal');
  await ev(() => { const r = document.querySelector('input[name="bgV"][value="52"]'); r.checked = true; r.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(100);
  assert(await ev(() => Builder.project().goal.voltage) === 48, 'דרך ציבורית: 52V לא נבחר (הוחזר ל-48V)');

  // תאימות
  await go('parts');
  await ev(() => { const s = document.querySelector('#bp-charger'); s.value = 'chg_42_2'; s.dispatchEvent(new Event('change')); });
  await ev(() => { const s = document.querySelector('#bp-protection'); s.value = 'fuse_blade'; s.dispatchEvent(new Event('change')); });
  const pm = await ev(() => [...document.querySelectorAll('.price-meta')].every(e => /לא מאומת/.test(e.textContent) && /עודכן \d{4}-\d\d-\d\d/.test(e.textContent)));
  assert(pm, 'לכל רכיב: טווח מחיר, ״הערכה – לא מאומת״ ותאריך עדכון');
  await go('check');
  const ch = await ev(() => Builder.checks().filter(x => x.lvl === 'bad').map(x => x.t));
  assert(ch.some(t => /מטען 42V לא מתאים ל-48V/.test(t)), 'בודק תאימות: מטען 42V למערכת 48V נחסם');
  await ev(() => { Builder.project().goal.voltage = 52; Builder.project().goal.use = 'private'; Builder.project().sel.battery = 'bat_52_20'; Builder.project().sel.controller = 'ctl_52_35'; Builder.project().sel.charger = 'chg_588_3'; Builder.project().sel.motor = 'mot_rear_1000_48'; });
  const ch2 = await ev(() => Builder.checks().filter(x => x.lvl === 'bad').map(x => x.t));
  assert(ch2.length === 1 && /דירוג 58V נמוך ממתח מלא 58.8V/.test(ch2[0]), 'נתיך להב 58V במערכת 52V (58.8V מלא) נחסם – נדרש מפסק DC');
  await ev(() => { Builder.project().sel.protection = 'breaker_dc'; });
  assert((await ev(() => Builder.checks().filter(x => x.lvl === 'bad').length)) === 0, 'אחרי החלפה למפסק DC – אין חסימות');

  // חיווט SVG
  await go('wiring');
  const w = await ev(() => { const n = document.querySelectorAll('.bd [data-wire]').length; document.querySelector('[data-wire="bplus"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); return { n, info: document.querySelector('#bdInfo').textContent }; });
  assert(w.n >= 9 && /10 AWG/.test(w.info) && /XT90/.test(w.info), `דיאגרמה: ${w.n} כבלים; בחירת כבל מציגה צבע, חתך ומחבר (${w.info.slice(0, 60)}…)`);
  await p.focus('[data-wire="phase"]'); await p.keyboard.press('Enter');
  assert(/פאזות/.test(await ev(() => document.querySelector('#bdInfo').textContent)), 'דיאגרמה נגישה במקלדת (Enter על כבל)');

  // מדריך: עצור ומדוד
  await go('guide');
  const gd = await ev(async () => {
    const q = s => document.querySelector(s), out = { blocked: 0, steps: 0 };
    for (let i = 0; i < 20; i++) {
      const next = q('#bgNext'); if (next.disabled) out.blocked++;
      const m = q('#bgMeas'), c = q('#bgChk');
      if (m) {
        const lbl = m.parentElement.textContent; const r = lbl.match(/צפוי ([\d.]+)–([\d.]+)/);
        if (/מתח הסוללה במחבר/.test(lbl)) { m.value = '-40'; m.dispatchEvent(new Event('input')); out.neg = q('#bgRes').textContent + '|' + q('#bgNext').disabled; m.value = '10'; m.dispatchEvent(new Event('input')); out.low = q('#bgNext').disabled; }
        m.value = ((+r[1] + +r[2]) / 2).toFixed(2); m.dispatchEvent(new Event('input'));
      } else if (c) { c.checked = true; c.dispatchEvent(new Event('change')); }
      if (q('#bgNext').disabled) throw new Error('still blocked at ' + i);
      out.steps++; const last = q('#bgNext').textContent === 'סיים'; q('#bgNext').click(); await new Promise(r => setTimeout(r, 20));
      if (last) break;
    }
    out.summary = !!q('#bgSummary');
    return out;
  });
  assert(gd.steps === 11 && gd.blocked === 9 && gd.summary, `מדריך: 11 שלבים, 9 נקודות ״עצור ומדוד״ נעולות עד אימות, מסתיים בסיכום`);
  assert(/קוטביות הפוכה/.test(gd.neg) && /true$/.test(gd.neg) && gd.low, 'מדידה שלילית = קוטביות הפוכה, ערך מחוץ לטווח – חסום');

  // סיכום, שמירה, ייצוא, XSS בשם
  const sm = await ev(async () => {
    const t = Builder.totals(); const q = s => document.querySelector(s);
    q('#bgName').value = '<img src=x onerror=window.__x=1>'; q('#bgName').dispatchEvent(new Event('change'));
    q('[data-action="bg-save"]').click(); await new Promise(r => setTimeout(r, 100));
    q('[data-action="bg-log"]').click(); await Persist.flush();
    return { t, projects: Persist.get('projects').length, log: RepairLog.all()[0], x: window.__x, img: !!document.querySelector('#modeView img'), kv: [...document.querySelectorAll('#bgSummary .kv b')].map(b => b.textContent) };
  });
  assert(sm.t.min > 0 && sm.t.max > sm.t.min && sm.t.unverified === sm.t.lines.length, `סיכום: עלות ₪${sm.t.min}–₪${sm.t.max}, ${sm.t.lines.length} שורות, כולן מסומנות לא מאומת; ${sm.kv.join(' · ')}`);
  assert(sm.projects === 1 && /בנה בעצמך/.test(sm.log.modelName) && /לשימוש בשטח פרטי/.test(sm.log.notes) && /מתח הסוללה במחבר/.test(sm.log.measurements), 'שמירה: פרויקט נשמר, ונרשם ביומן עם המדידות');
  assert(sm.x === undefined && !sm.img, 'שם פרויקט עם HTML מוצג כטקסט');
  const [dl] = await Promise.all([p.waitForEvent('download'), ev(() => document.querySelector('[data-action="bg-export"]').click())]);
  const txt = fs.readFileSync(await dl.path(), 'utf8');
  assert(/סה״כ משוער/.test(txt) && /לא מאומת/.test(txt) && /שטח פרטי/.test(txt), 'רשימת קניות לייצוא: פריטים, טווחים, סימון ״לא מאומת״');

  // בניית מארז: הסכמה + ״מתקדם בלבד״
  await go('goal');
  await ev(() => { const r = document.querySelector('input[name="bgPack"][value="build"]'); r.checked = true; r.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(150);
  const bp = await ev(() => ({ modal: !document.querySelector('#legalModal').hidden, txt: document.querySelector('#legalBody').textContent }));
  assert(bp.modal && /ריתוך נקודתי/.test(bp.txt), 'בניית מארז: חלון הסכמה ״בניית סוללה״ לפני שממשיכים');
  await ev(() => { document.querySelector('#consentChk').click(); [...document.querySelectorAll('#legalFoot button')].find(b => b.textContent === 'המשך').click(); });
  await p.waitForTimeout(200);
  const bp2 = await ev(() => ({ mode: Builder.project().goal.packMode, adv: /מתקדם בלבד/.test(document.querySelector('#modeView').textContent), c: Persist.get('consent').actions.buildPack }));
  assert(bp2.mode === 'build' && bp2.adv && bp2.c && bp2.c.at, 'אחרי אישור: מצב ״מתקדם בלבד״ עם רשימת בטיחות, וההסכמה נשמרה');

  // עדכון קטלוג מקובץ אחד + דחיית קובץ זדוני
  const newer = JSON.parse(JSON.stringify(cat)); newer.updatedAt = '2027-01-15'; newer.categories.motor.price = { min: 500, max: 1500, updatedAt: '2027-01-15', source: 'quote', verified: true };
  await p.route('**/components.json', r => r.fulfill({ body: JSON.stringify(newer), contentType: 'application/json' }));
  await p.reload(); await p.evaluate(() => window.__testReady()); await p.waitForTimeout(400);
  const up = await ev(() => [Builder.catalog().updatedAt, Builder.catalog().categories.motor.price.verified]);
  assert(up[0] === '2027-01-15' && up[1] === true, 'קטלוג מתעדכן מ-components.json בשרת (קובץ אחד)');
  await p.unroute('**/components.json');
  await p.route('**/components.json', r => r.fulfill({ body: '{"schema":1,"updatedAt":"2099-01-01","categories":{},"items":[],"__proto__":{"x":1}}', contentType: 'application/json' }));
  await p.reload(); await p.evaluate(() => window.__testReady()); await p.waitForTimeout(400);
  assert(await ev(() => Builder.catalog().updatedAt) !== '2099-01-01', 'קטלוג עם __proto__ נדחה – נשארים עם המוטמע');

  assert(!errors.length, 'אין שגיאות ' + errors.join(' | '));
  srv.close(); await browser.close(); console.log('STAGE G OK');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

// שלבים B (פרטיות) ו-A (משפטי והסכמה). PW=$(npm root -g)/playwright node tests/stageBA.cjs
const fs = require('fs');
const { serve, launch, watch, assert, prep } = require('./lib.cjs');
(async () => {
  const browser = await launch(); const errors = [];
  const { srv, url } = await serve();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block', acceptDownloads: true });
  const p = await ctx.newPage(); watch(p, errors);
  const origins = new Set();
  p.on('request', r => origins.add(new URL(r.url()).origin));

  /* ---------- A: הסכמה לפני שימוש ראשון ---------- */
  await p.goto(url + 'index.html'); await p.evaluate(() => window.__testReady());
  await p.waitForTimeout(300);
  const g = await p.evaluate(() => {
    const d = document.querySelector('#legalModal'), btn = [...d.querySelectorAll('#legalFoot button')].find(b => b.textContent === 'המשך');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { open: !d.hidden, title: document.querySelector('#legalTitle').textContent, disabled: btn.disabled, closeHidden: d.querySelector('[data-legal-close]').hidden, stillOpen: !d.hidden };
  });
  assert(g.open && g.disabled && g.closeHidden && g.stillOpen, 'שימוש ראשון: חלון הסכמה חוסם, בלי סגירה ו-Escape, ״המשך״ נעול עד סימון');
  const inl = await p.evaluate(() => { document.querySelector('[data-legal-inline="terms"]').click(); const b = document.querySelector('#legalInline'); return !b.hidden && /טיוטה/.test(b.textContent) && /תנאי שימוש/.test(b.textContent); });
  assert(inl, 'אפשר לקרוא את התנאים בתוך חלון ההסכמה (מסומנים כטיוטה)');
  const rec = await p.evaluate(async () => {
    const c = document.querySelector('#consentChk'); c.click();
    [...document.querySelectorAll('#legalFoot button')].find(b => b.textContent === 'המשך').click();
    await new Promise(r => setTimeout(r, 500)); await Persist.flush();
    return { hidden: document.querySelector('#legalModal').hidden, t: Persist.get('consent').terms };
  });
  assert(rec.hidden && rec.t.v === '2026-09-24-draft1' && /^\d{4}-\d\d-\d\dT/.test(rec.t.at), `ההסכמה נשמרה: גרסה ${rec.t.v}, תאריך ${rec.t.at}`);
  await p.reload(); await p.evaluate(() => window.__testReady()); await p.waitForTimeout(300);
  assert(await p.evaluate(() => { const d = document.querySelector('#legalModal'); return !d || d.hidden; }), 'אחרי טעינה מחדש – לא נשאלים שוב');

  /* ---------- A: לפני פעולות מסוכנות ---------- */
  const bat = await p.evaluate(async () => {
    const q = s => document.querySelector(s);
    q('[data-mode="wizard"]').click();
    const r = q('input[name="wzS"][value="battery"]'); r.checked = true; r.dispatchEvent(new Event('change'));
    q('[data-action="wz-start"]').click(); await new Promise(r => setTimeout(r, 100));
    const txt = q('#legalBody').textContent, started1 = !!q('#wvBox');
    [...document.querySelectorAll('#legalFoot button')].find(b => b.textContent === 'ביטול').click(); await new Promise(r => setTimeout(r, 100));
    const started2 = !!q('#wvBox');
    q('[data-action="wz-start"]').click(); await new Promise(r => setTimeout(r, 100));
    q('#consentChk').click(); [...document.querySelectorAll('#legalFoot button')].find(b => b.textContent === 'המשך').click();
    await new Promise(r => setTimeout(r, 300));
    return { txt, started1, started2, started3: !!q('#wvBox'), a: Persist.get('consent').actions };
  });
  assert(/לא פותחים מארז/.test(bat.txt) && !bat.started1 && !bat.started2, 'החלפת סוללה: חלון אזהרה, ״ביטול״ לא מתחיל את האשף');
  assert(bat.started3 && bat.a.battery && bat.a.battery.v && bat.a.battery.at, 'אחרי אישור – האשף מתחיל והאישור נשמר עם גרסה ותאריך');
  const hv = await p.evaluate(async () => {
    UI.setModel('thunder3'); const q = s => document.querySelector(s);
    q('[data-mode="diag"]').click(); q('[data-action="dg-sub"][data-sub="adv"]').click();
    const b = q('[data-action="dp-open"]'); b.click(); await new Promise(r => setTimeout(r, 100));
    const t = q('#legalModal').hidden ? '' : q('#legalBody').textContent;
    [...document.querySelectorAll('#legalFoot button')].find(x => x.textContent === 'ביטול').click();
    return t;
  });
  assert(/60V/.test(hv), 'מדידה חיה בכלי 72V – אזהרת מתח גבוה לפני הפתיחה');
  const sp = await p.evaluate(async () => {
    UI.setModel('korshidi'); const q = s => document.querySelector(s);
    q('[data-mode="wizard"]').click(); const r = q('input[name="wzS"][value="display"]'); r.checked = true; r.dispatchEvent(new Event('change'));
    q('[data-action="wz-start"]').click(); await new Promise(r => setTimeout(r, 100));
    const t = q('#legalBody').textContent; [...document.querySelectorAll('#legalFoot button')].find(x => x.textContent === 'ביטול').click(); return t;
  });
  assert(/מגבלת מהירות/.test(sp), 'החלפת צג/בקר – אזהרה על הגדרות מהירות והספק');

  /* ---------- A: רגולציה ---------- */
  const law = await p.evaluate(() => {
    const q = s => document.querySelector(s);
    UI.setModel('korshidi'); q('[data-mode="learn"]').click(); q('[data-action="learn-sub"][data-sub="model"]').click();
    const a = (q('.law-note') || {}).textContent || '';
    UI.setModel('onebikeX4'); q('[data-action="learn-sub"][data-sub="model"]').click();
    const b = (q('.law-note') || {}).className || '';
    return { a, b };
  });
  assert(/לאמת מול החוק העדכני/.test(law.a) && /500W/.test(law.a) && /חורג/.test(law.a), 'דגם 500W: הערת רגולציה עם ״לאמת מול החוק העדכני״ ואזהרת חריגה');
  assert(/info/.test(law.b), 'דגם 250W: הערת מידע בלבד');
  const lk = await p.evaluate(() => { document.querySelector('[data-legal="privacy"]').click(); const t = document.querySelector('#legalBody').textContent; document.querySelector('[data-legal-close]').click(); return t; });
  assert(/אין שרת/.test(lk) && /טיוטה/.test(lk), 'קישור ״פרטיות״ בתחתית פותח את המדיניות');

  /* ---------- B: לקוח אנונימי וטלפון ---------- */
  const an = await p.evaluate(async () => {
    const q = s => document.querySelector(s);
    Tools.go('log'); await new Promise(r => setTimeout(r, 50));
    q('#lgPhone').value = 'abc<script>'; q('#logForm').dispatchEvent(new Event('submit', { cancelable: true }));
    const phoneErr = (q('#lgPhone').parentElement.querySelector('.field-err') || {}).textContent;
    q('#lgCust').value = 'שם'; q('#lgAnon').click();
    const dis = q('#lgCust').disabled && q('#lgPhone').disabled && !q('#lgCust').value;
    q('#lgSym').value = 'בדיקה אנונימית'; q('#logForm').dispatchEvent(new Event('submit', { cancelable: true }));
    const r = RepairLog.all()[0];
    return { phoneErr, dis, r, list: q('.log-item b').textContent };
  });
  assert(/ספרות/.test(an.phoneErr), 'טלפון לא תקין נחסם עם הסבר');
  assert(an.dis && an.r.anon && !an.r.customer && !an.r.phone && /לקוח אנונימי/.test(an.list), 'לקוח אנונימי: בלי שם וטלפון, מוצג ״לקוח אנונימי״');
  await p.evaluate(async () => { const q = s => document.querySelector(s); q('#lgCust').value = 'רון'; q('#lgPhone').value = '050-1234567'; q('#lgSym').value = 'x'; q('#logForm').dispatchEvent(new Event('submit', { cancelable: true })); await Persist.flush(); });

  /* ---------- B: ייצוא כל הנתונים ---------- */
  await p.evaluate(() => Tools.go('data'));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.querySelector('[data-action="pv-export"]').click())]);
  const ex = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert(ex.type === 'personal-data-export' && ex.data.log.some(x => x.phone === '050-1234567') && ex.data.consent.terms && ex.data.consent.actions.battery, 'ייצוא בלחיצה: יומן, טלפונים, הסכמות – הכול בקובץ אחד (' + dl.suggestedFilename() + ')');

  /* ---------- B: בלי בקשות חיצוניות ובלי עוגיות ---------- */
  const ext = [...origins].filter(o => o !== new URL(url).origin && !o.startsWith('data:') && !o.startsWith('blob:'));
  assert(ext.length === 0, 'אין אף בקשה לשרת חיצוני (גופנים, CDN, אנליטיקה): ' + JSON.stringify(ext));
  assert((await ctx.cookies()).length === 0 && await p.evaluate(() => document.cookie === ''), 'אין עוגיות');

  /* ---------- B: מחיקת הכול עם אישור כפול ---------- */
  const w = await p.evaluate(async () => {
    const q = s => document.querySelector(s);
    q('[data-action="pv-wipe1"]').click();
    const s1 = q('#pvGo1').disabled; q('#pvGo1').click(); const still1 = !!q('#pvAck1');
    q('#pvAck1').click(); q('#pvGo1').click();
    const s2 = q('#pvGo2').disabled; q('#pvWord').value = 'מחקק'; q('#pvWord').dispatchEvent(new Event('input')); const s3 = q('#pvGo2').disabled;
    q('#pvWord').value = 'מחק'; q('#pvWord').dispatchEvent(new Event('input'));
    return { s1, still1, s2, s3, s4: q('#pvGo2').disabled };
  });
  assert(w.s1 && w.still1 && w.s2 && w.s3 && !w.s4, 'מחיקה: שלב 1 דורש סימון, שלב 2 דורש להקליד ״מחק״ בדיוק');
  await Promise.all([p.waitForEvent('load'), p.evaluate(() => document.querySelector('#pvGo2').click())]);
  await p.evaluate(() => window.__testReady()); await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ log: RepairLog.all().length, consent: Consent.hasTerms(), modal: !document.querySelector('#legalModal').hidden, ls: Object.keys(localStorage).filter(k => /^(wiring-lab|ev-lab)/.test(k)) }));
  assert(after.log === 0 && !after.consent && after.modal && after.ls.length === 0, 'אחרי מחיקה: יומן ריק, הסכמות נמחקו (חלון הסכמה חוזר), אין מפתחות ב-localStorage');

  /* ---------- privacy.html / terms.html עצמאיים ---------- */
  for (const doc of ['privacy', 'terms']) {
    const q2 = await ctx.newPage(); watch(q2, errors, doc + ' ');
    await q2.goto(url + doc + '.html');
    const t = await q2.evaluate(() => document.body.textContent);
    assert(/טיוטה/.test(t) && t.length > 1500, doc + '.html נטען תחת CSP ומסומן כטיוטה');
    await q2.close();
  }
  assert(!errors.length, 'אין שגיאות ' + errors.join(' | '));
  srv.close(); await browser.close(); console.log('STAGE B+A OK');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

// שלב H – חוויית שימוש. PW=$(npm root -g)/playwright node tests/stageH.cjs
const { serve, launch, watch, assert, prep } = require('./lib.cjs');
(async () => {
  const browser = await launch(); const errors = [];
  const { srv, url } = await serve();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Web Speech מדומה – לבדוק הקראה ופקודות בלי מיקרופון אמיתי
  await ctx.addInitScript(() => {
    window.__spoken = [];
    const def = (k, v) => Object.defineProperty(window, k, { value: v, configurable: true, writable: true });
    def('speechSynthesis', { speak: u => window.__spoken.push(u.text), cancel() {}, getVoices: () => [{ lang: 'he-IL', localService: true, name: 'test-he' }] });
    def('SpeechSynthesisUtterance', function (t) { this.text = t; });
    const FakeRec = function () { window.__rec = this; this.start = () => { this.started = true; }; this.stop = () => { this.started = false; }; };
    def('SpeechRecognition', FakeRec); def('webkitSpeechRecognition', FakeRec);
  });
  const p = await ctx.newPage(); watch(p, errors);
  await p.goto(url + 'index.html'); await prep(p);
  const ev = f => p.evaluate(f);

  // 1. חיפוש גלובלי
  const s1 = await ev(() => Search.query('לא טוען').map(r => r.type + ':' + r.title));
  assert(/תקלה:לא נטען/.test(s1[0]), 'חיפוש ״לא טוען״ → התוצאה הראשונה: ' + s1[0]);
  await p.keyboard.press('/'); await p.keyboard.type('לא טוען'); await p.waitForTimeout(100); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const d1 = await ev(() => ({ mode: State.mode, pressed: (document.querySelector('[data-action="dp-sym"][data-s="noCharge"]') || {}).getAttribute && document.querySelector('[data-action="dp-sym"][data-s="noCharge"]').getAttribute('aria-pressed'), top: (document.querySelector('.prob') || {}).textContent }));
  assert(d1.mode === 'diag' && d1.pressed === 'true', 'מקלדת: / → ״לא טוען״ → Enter פותח אבחון עם ״לא נטען״ מסומן; סיבה מובילה: ' + (d1.top || '').replace(/\s+/g, ' ').trim().slice(0, 40));
  const s2 = await ev(() => ({ code: Search.query('E21').map(r => r.type)[0], term: Search.query('BMS').map(r => r.type), heat: Search.query('מריח שרוף').map(r => r.title)[0], brake: Search.query('ברקס').map(r => r.title).slice(0, 3) }));
  assert(s2.code === 'קוד' && s2.term.includes('מונח') && /חום/.test(s2.heat) && s2.brake.some(t => /בלם/.test(t)), `חיפוש: קוד שגיאה, מונח, שפת רחוב (״מריח שרוף״ → ${s2.heat}; ״ברקס״ → בלמים)`);

  // 2. לא מצאתי → סיכום לטכנאי
  await ev(() => { const i = document.querySelector('#gSearch'); i.value = 'קסדה חכמה עם בלוטות'; i.dispatchEvent(new Event('input')); });
  const nf = await ev(() => [...document.querySelectorAll('#gsList li')].map(li => li.textContent));
  assert(nf.length === 1 && /לא מצאתי/.test(nf[0]), 'בלי תוצאות – מוצע ״לא מצאתי. הכן סיכום לטכנאי״');
  await p.focus('#gSearch'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  const esc1 = await ev(async () => { const t = document.querySelector('#askOut').textContent; [...document.querySelectorAll('#legalFoot button')].find(b => b.textContent === 'העתק סיכום').click(); await new Promise(r => setTimeout(r, 200)); await Persist.flush(); return { t, saved: Persist.get('escalations').length, clip: await navigator.clipboard.readText().catch(() => '') }; });
  assert(/סיכום לטכנאי/.test(esc1.t) && /קסדה חכמה/.test(esc1.t) && /לא נטען/.test(esc1.t) && /כורשידי|קורשידי|Korshidi/i.test(esc1.t) && esc1.saved === 1, 'סיכום לטכנאי: כלי, שאלה, סימפטומים שסומנו – הועתק ונשמר');
  await ev(() => Legal.close());

  // 3. כרטיס כלי, מדידות, גרף בריאות סוללה, תזכורות
  await ev(() => Tools.go('vehicles'));
  const vh = await ev(async () => {
    const q = s => document.querySelector(s);
    q('#vhLabel').value = 'אופניים של רון'; q('#vhKm').value = '1200'; q('#vhForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 50));
    const v = Vehicles.all()[0];
    v.sag = [{ date: '2026-01-10', rest: 52.1, load: 49.8, amps: 15, km: 400 }, { date: '2026-05-10', rest: 51.9, load: 48.6, amps: 15, km: 900 }]; Persist.set('vehicles', Vehicles.all());
    Vehicles.open(v.id); Tools.go('vehicles'); await new Promise(r => setTimeout(r, 50));
    q('#sgRest').value = '51.5'; q('#sgLoad').value = '46.9'; q('#sgA').value = '15'; q('#sgKm').value = '1500'; q('#sgForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 50));
    const pts = document.querySelectorAll('.sag-graph circle').length, rows = document.querySelectorAll('.card table.volt tbody tr').length;
    const rems = document.querySelectorAll('.rem-list li').length;
    return { pts, rows, rems, aria: document.querySelector('.sag-graph svg').getAttribute('aria-label'), km: Vehicles.kmOf(Vehicles.all()[0]) };
  });
  assert(vh.pts === 3 && vh.rows === 3 && /8.9%/.test(vh.aria), `גרף בריאות סוללה: 3 מדידות לאורך זמן (${vh.aria})`);
  assert(vh.rems === 6 && vh.km === 1500, 'כרטיס כלי: 6 תזכורות בסיס, ק״מ נוכחי מהמדידה האחרונה');
  const due = await ev(async () => {
    const R = Persist.get('reminders'); R[0].lastKm = 0; R[1].lastDate = '2025-01-01'; Persist.set('reminders', R); Vehicles.notify();
    const n = Vehicles.dueList().length, notice = (document.querySelector('#nt-maint') || {}).textContent || '';
    Tools.go('vehicles'); await new Promise(r => setTimeout(r, 30));
    document.querySelector('.rem.due [data-action="rm-done"]').click(); await new Promise(r => setTimeout(r, 30));
    return { n, notice, after: Vehicles.dueList().length };
  });
  assert(due.n >= 2 && /תזכורות תחזוקה/.test(due.notice) && due.after === due.n - 1, `תזכורות לפי ק״מ וזמן: ${due.n} הגיעו למועד, הודעה עליונה, ״בוצע״ מאפס`);

  // 4. תיקון לכלי + תמונה דחוסה בלי EXIF
  const ph = await ev(async () => {
    Tools.newLogFor(Vehicles.all()[0]); await new Promise(r => setTimeout(r, 50));
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 4000, 3000);
    const big = await new Promise(r => c.toBlob(r, 'image/png'));
    const inp = document.querySelector('#lgPhotos'); const dt = new DataTransfer(); dt.items.add(new File([big], 'x.png', { type: 'image/png' })); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    for (let i = 0; i < 50 && !document.querySelector('#lgThumbs img[src^="blob:"]'); i++) await new Promise(r => setTimeout(r, 100));
    document.querySelector('#lgSym').value = 'חיבור רופף'; document.querySelector('#lgPrice').value = '350';
    const vehSel = document.querySelector('#lgVeh').value, km = document.querySelector('#lgKm').value;
    document.querySelector('#logForm').dispatchEvent(new Event('submit', { cancelable: true })); await Persist.flush();
    const r = RepairLog.all()[0], b = await Persist.getBlob(r.photos[0]);
    const bmp = await createImageBitmap(b);
    return { vehSel: !!vehSel, km, photos: r.photos.length, type: b.type, size: b.size, orig: big.size, w: bmp.width, h: bmp.height, price: r.price, veh: r.vehicleId === Vehicles.all()[0].id };
  });
  assert(ph.vehSel && ph.km === '1500' && ph.veh && ph.price === 350, 'תיקון חדש מכרטיס הכלי: כלי וק״מ ממולאים, מחיר נשמר');
  assert(ph.photos === 1 && ph.type === 'image/jpeg' && ph.w === 1280 && ph.h === 960, `תמונה: נדחסה ל-${ph.w}×${ph.h} JPEG (${Math.round(ph.size / 1024)}KB), קידוד מחדש מסיר EXIF`);
  const hist = await ev(async () => { Tools.go('vehicles'); await new Promise(r => setTimeout(r, 30)); return document.querySelectorAll('.timeline li').length; });
  assert(hist === 1, 'היסטוריית התיקונים בכרטיס הכלי');

  // 5. הצעת מחיר
  const qt = await ev(async () => {
    Quote.forVehicle(Vehicles.all()[0].id); await new Promise(r => setTimeout(r, 30));
    const q = s => document.querySelector(s), set = (s, v) => { const e = q(s); e.value = v; e.dispatchEvent(new Event('change')); };
    set('#qtRate', '200'); set('#qtCause', 'conn_power'); await new Promise(r => setTimeout(r, 30));
    const hours = q('#qtHours').value, lines = document.querySelectorAll('.qt-line').length;
    const p0 = q('[data-qt="p"]'); if (p0) { p0.value = '60'; p0.dispatchEvent(new Event('change')); }
    await new Promise(r => setTimeout(r, 30));
    return { hours, lines, t: Quote.totals(), text: Quote.text(), vatNote: /לאמת את השיעור/.test(q('#modeView').textContent) };
  });
  const expNet = Number(qt.hours) * 200 + (qt.lines ? 60 : 0);
  assert(Math.abs(qt.t.net - expNet) < 0.01 && Math.abs(qt.t.total - expNet * 1.18) < 0.01 && qt.vatNote, `הצעת מחיר: ${qt.hours} ש׳ × ₪200 + חלקים = ₪${qt.t.net}, כולל מע״מ ₪${qt.t.total.toFixed(2)} (שיעור מסומן לאימות)`);
  assert(/הצעת מחיר/.test(qt.text) && /סה״כ/.test(qt.text), 'טקסט הצעה ללקוח');

  // 6. כרטיסיות חזרה
  const fc = await ev(async () => {
    UI.setMode('learn'); document.querySelector('[data-action="learn-sub"][data-sub="cards"]').click();
    const q = s => document.querySelector(s), start = Cards.queue().length;
    q('[data-action="fc-show"]').click(); const back = q('.flash-back').textContent; q('[data-action="fc-yes"]').click();
    q('[data-action="fc-show"]').click(); q('[data-action="fc-no"]').click();
    await Persist.flush();
    const st = Persist.get('cards'), vals = Object.values(st);
    return { start, back: back.length, n: vals.length, boxes: vals.map(v => v.box + ':' + v.due).sort(), left: Cards.queue().length };
  });
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  assert(fc.start === 10 && fc.back > 5 && fc.n === 2 && fc.boxes.every(b => b.startsWith('1:' ) ? b.endsWith(tomorrow) : true) && fc.left === 8, `כרטיסיות: 10 חדשות ביום, ״ידעתי״/״לא ידעתי״ קובעים מועד חזרה (${fc.boxes.join(', ')})`);

  // 7. מצב סדנה: הקראה ופקודה קולית ״הבא״
  const vc = await ev(async () => {
    Level.setWorkshop(true); UI.setMode('wizard'); document.querySelector('[data-action="wz-start"]').click(); await new Promise(r => setTimeout(r, 50));
    const bar = !document.querySelector('#voiceBar').hidden;
    document.querySelector('#vbRead').click(); const spoken = window.__spoken.slice(-1)[0] || '';
    const before = document.querySelector('.eyebrow, #modeView .num') ? document.querySelector('#modeView').textContent.match(/שלב \d+/) : null;
    Voice.command('הבא'); await new Promise(r => setTimeout(r, 100));
    const blocked = /לא אומת/.test(window.__spoken.slice(-1)[0] || '');
    const chk = document.querySelector('#wvChk'), inp = document.querySelector('#wvIn'), ch = document.querySelector('#wvBox [data-wv="0"]');
    if (chk) { chk.checked = true; chk.dispatchEvent(new Event('change')); } else if (inp) { const m = document.querySelector('#wvBox .foot').textContent.match(/([\d.]+)–([\d.]+)/); inp.value = m ? ((+m[1] + +m[2]) / 2).toFixed(1) : '12'; inp.dispatchEvent(new Event('input')); if (document.querySelector('#wvIn2')) { inp.value = '0.8'; inp.dispatchEvent(new Event('input')); const b = document.querySelector('#wvIn2'); b.value = '4.1'; b.dispatchEvent(new Event('input')); } } else if (ch) ch.click();
    const stepText = () => (document.querySelector('#modeView').textContent.match(/שלב (\d+)/) || [])[1];
    const s0 = stepText();
    const tl = Voice.toggleListening(); await new Promise(r => setTimeout(r, 50)); // גילוי נאות
    const disclosure = /שרת של ספק הדפדפן/.test(document.querySelector('#legalBody').textContent);
    [...document.querySelectorAll('#legalFoot button')].find(b => b.textContent === 'הפעל מיקרופון').click();
    await tl;
    const rec = window.__rec; const listening = Voice.listening();
    rec.onresult({ results: [Object.assign([{ transcript: ' הבא' }], { isFinal: true })] });
    await new Promise(r => setTimeout(r, 400));
    const s1 = stepText(); Voice.stopListening(); Level.setWorkshop(false);
    return { bar, spoken: spoken.length, blocked, s0, s1, disclosure, listening };
  });
  assert(vc.bar && vc.spoken > 20, 'מצב סדנה: סרגל ״הקרא / פקודה קולית / הבא״, ההקראה קוראת את השלב');
  assert(vc.blocked, '״הבא״ קולי לפני אימות – לא מתקדם ומודיע בקול');
  assert(vc.disclosure && vc.listening && vc.s0 && vc.s1 && Number(vc.s1) === Number(vc.s0) + 1, `פקודה קולית: גילוי נאות לפני הפעלה, ״הבא״ מעביר משלב ${vc.s0} ל-${vc.s1}`);

  assert(!errors.length, 'אין שגיאות ' + errors.join(' | '));
  srv.close(); await browser.close(); console.log('STAGE H OK');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

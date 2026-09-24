// שלב F – אחסון, גיבוי, שחזור, נעילה. PW=$(npm root -g)/playwright node tests/stageF.cjs
const { serve, launch, watch, assert, prep } = require('./lib.cjs');
const IDB_DUMP = () => new Promise(res => { const r = indexedDB.open('ev-lab'); r.onsuccess = () => { const d = r.result; const t = d.transaction('kv'); const s = t.objectStore('kv'); const out = {}; const c = s.openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else { d.close(); res(out); } }; }; });
(async () => {
  const browser = await launch(); const errors = [];
  const { srv, url } = await serve();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  // נתונים מגרסה קודמת (localStorage) – נטענים לפני הטעינה הראשונה בלבד
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('wiring-lab.log.v1', JSON.stringify([{ id: 'old1', date: '2025-01-02', customer: 'לקוח ישן', model: 'g30', status: 'פתוח' }]));
      localStorage.setItem('wiring-lab.pro.v1', JSON.stringify({ level: 'pro', acad: { read: { 'm1l1': true }, scores: {}, certs: {} } }));
    }
  });
  const p = await ctx.newPage(); watch(p, errors);
  const load = async () => { await p.goto(url + 'index.html'); await prep(p); await p.waitForTimeout(300); };
  await load();
  const q = (s) => p.evaluate(s2 => { const e = document.querySelector(s2); if (!e) throw new Error('missing ' + s2); e.click(); }, s);

  // 1. הגירה מגרסה קודמת
  const mg = await p.evaluate(() => ({ log: RepairLog.all().map(x => x.id), lvl: document.body.classList.contains('lvl-pro'), acad: Persist.get('progress').acad, ls: [localStorage.getItem('wiring-lab.log.v1'), localStorage.getItem('wiring-lab.pro.v1')] }));
  assert(mg.log.includes('old1') && mg.lvl && mg.acad && mg.acad.read.m1l1 && mg.ls[0] === null && mg.ls[1] === null, 'הגירה: יומן, רמה והתקדמות עברו מ-localStorage ל-IndexedDB והמפתחות הישנים נמחקו');

  // 2. שמירה אוטומטית + מחוון
  await q('[data-mode="tools"]'); await q('[data-action="tl-sub"][data-sub="log"]');
  const st = await p.evaluate(async () => {
    document.querySelector('#lgCust').value = 'דנה'; document.querySelector('#lgSym').value = 'לא נדלק';
    document.querySelector('#logForm').dispatchEvent(new Event('submit', { cancelable: true }));
    const during = document.querySelector('#saveState').textContent;
    for (let i = 0; i < 30 && document.querySelector('#saveState').textContent !== 'נשמר'; i++) await new Promise(r => setTimeout(r, 100));
    return [during, document.querySelector('#saveState').textContent];
  });
  assert(st[0] === 'שומר…' && st[1] === 'נשמר', `מחוון שמירה: "${st[0]}" ← "${st[1]}"`);
  await load();
  const after = await p.evaluate(() => RepairLog.all().map(x => x.customer));
  assert(after.includes('דנה') && after.includes('לקוח ישן'), 'אחרי טעינה מחדש – הרשומות נשמרו ב-IndexedDB');

  // 3. גיבוי: סכמה, checksum, שינוי ידני, הצפנה
  const bk = await p.evaluate(async () => {
    const plain = await Persist.backup(null), o = JSON.parse(plain);
    const t = JSON.parse(plain); t.data.log[0].customer = 'זויף';
    let tam = ''; try { await Persist.readBackup(JSON.stringify(t)); } catch (e) { tam = e.message; }
    const enc = await Persist.backup('סיסמה-ארוכה-1');
    let noPw = '', badPw = ''; try { await Persist.readBackup(enc); } catch (e) { noPw = e.message; }
    try { await Persist.readBackup(enc, 'לא-נכון-123'); } catch (e) { badPw = e.message; }
    const good = await Persist.readBackup(enc, 'סיסמה-ארוכה-1');
    return { schema: o.schema, sum: /^sha256:[0-9a-f]{64}$/.test(o.checksum), tam, encHasName: enc.includes('דנה'), noPw, badPw, goodN: good.data.log.length };
  });
  assert(bk.schema === 2 && bk.sum, 'גיבוי עם גרסת סכמה 2 ו-SHA-256');
  assert(/checksum/.test(bk.tam), 'גיבוי שנערך ידנית נדחה: ' + bk.tam);
  assert(!bk.encHasName && /מוצפן/.test(bk.noPw) && /סיסמה שגויה/.test(bk.badPw) && bk.goodN === 2, 'גיבוי מוצפן: בלי טקסט גלוי, דורש סיסמה, סיסמה שגויה נדחית, נכונה משחזרת');

  // 4. שחזור מגיבוי ישן (ייצוא יומן גרסה 1) דרך הממשק – תצוגה מקדימה + מיזוג
  await q('[data-action="tl-sub"][data-sub="data"]');
  const rs = await p.evaluate(async () => {
    const old = { app: 'wiring-lab', type: 'repair-log', version: 1, exported: '2025-05-01T10:00:00Z', items: [{ id: 'v1a', customer: 'מגיבוי ישן', date: '2025-05-01', model: 'oxo', status: 'הסתיים' }, { id: 'old1', customer: 'לקוח ישן – עודכן', date: '2025-01-02', model: 'g30', status: 'הסתיים', updated: '2099-01-01T00:00:00Z' }] };
    document.querySelector('#rsPaste').value = JSON.stringify(old);
    document.querySelector('[data-action="dt-read"]').click();
    await new Promise(r => setTimeout(r, 300));
    const note = (document.querySelector('#rsPreview .note') || {}).textContent || '';
    const row = [...document.querySelectorAll('#rsPreview tbody tr')].map(tr => [...tr.children].map(c => c.textContent.trim()).join(' '));
    document.querySelector('[data-action="dt-apply"]').click();
    await new Promise(r => setTimeout(r, 500));
    return { note, row, log: RepairLog.all().map(x => x.customer) };
  });
  assert(/גרסה 1/.test(rs.note), 'הגירת סכמה אוטומטית מוצגת: ' + rs.note.trim());
  assert(/יומן תיקונים 1 1 0 1/.test(rs.row[0]), 'תצוגה מקדימה: 1 חדש, 1 שונה, 0 זהה, 1 יימחק בהחלפה – ' + rs.row[0]);
  assert(rs.log.includes('מגיבוי ישן') && rs.log.includes('לקוח ישן – עודכן') && rs.log.includes('דנה'), 'מיזוג: נוסף חדש, עודכן ישן (הגיבוי חדש יותר), לא נמחק דבר');

  // 5. החלפה דורשת אישור ומוחקת מה שלא בגיבוי
  const rp = await p.evaluate(async () => {
    const b = await Persist.backup(null); const o = JSON.parse(b);
    o.data.log = o.data.log.filter(x => x.customer === 'דנה'); o.checksum = 'sha256:' + await Vault.sha256(JSON.stringify(o.data));
    document.querySelector('#rsPaste').value = JSON.stringify(o);
    document.querySelector('[data-action="dt-read"]').click(); await new Promise(r => setTimeout(r, 300));
    const r = document.querySelector('input[name="rsMode"][value="replace"]'); r.checked = true; r.dispatchEvent(new Event('change'));
    document.querySelector('[data-action="dt-apply"]').click(); await new Promise(r => setTimeout(r, 200));
    const blocked = RepairLog.all().length;
    document.querySelector('#rsAck').checked = true; document.querySelector('[data-action="dt-apply"]').click(); await new Promise(r => setTimeout(r, 500));
    return [blocked, RepairLog.all().map(x => x.customer)];
  });
  assert(rp[0] === 3 && rp[1].length === 1 && rp[1][0] === 'דנה', 'החלפה: חסומה עד סימון אישור, ואז מחליפה בדיוק לתוכן הגיבוי');

  // 6. נעילת PIN
  await p.evaluate(() => Tools.go('data'));
  const lk = await p.evaluate(async () => {
    document.querySelector('#pinNew').value = '482915'; document.querySelector('#pinNew2').value = '482915';
    document.querySelector('#lockForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 2500));
    return Persist.lockOn();
  });
  assert(lk, 'נעילה הופעלה');
  const raw = await p.evaluate(IDB_DUMP);
  assert(raw.sealed && raw.sealed.enc === 'AES-GCM-256' && !raw['ns:log'] && !JSON.stringify(raw).includes('דנה') && !JSON.stringify(raw).includes('482915'), 'במסד: רק רשומה מוצפנת – אין שם לקוח ואין PIN בטקסט גלוי');
  await load();
  const locked = await p.evaluate(async () => { Tools.go('log'); await new Promise(r => setTimeout(r, 100)); return { locked: Persist.isLocked(), card: /נעול/.test(document.querySelector('#modeView').textContent), notice: !!document.querySelector('#nt-lock'), n: RepairLog.all().length, ind: document.querySelector('#saveState').textContent }; });
  assert(locked.locked && locked.card && locked.notice && locked.n === 0 && locked.ind === 'נעול', 'אחרי טעינה: נעול, היומן מוסתר, הודעה ומחוון "נעול"');
  const un = await p.evaluate(async () => {
    Tools.go('data'); await new Promise(r => setTimeout(r, 100));
    document.querySelector('#pinIn').value = '000000'; document.querySelector('#unlockForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 2500)); const bad = document.querySelector('#pinErr').textContent;
    document.querySelector('#pinIn').value = '482915'; document.querySelector('#unlockForm').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 2500));
    return { bad, locked: Persist.isLocked(), names: RepairLog.all().map(x => x.customer) };
  });
  assert(/שגוי/.test(un.bad) && !un.locked && un.names[0] === 'דנה', 'PIN שגוי נדחה, PIN נכון פותח ומציג את הנתונים');
  const off = await p.evaluate(async () => { await Persist.disableLock('482915'); return Persist.lockOn(); });
  const raw2 = await p.evaluate(IDB_DUMP);
  assert(!off && !raw2.sealed && raw2['ns:log'].length === 1, 'ביטול נעילה מחזיר נתונים לא מוצפנים');

  // 7. תזכורת 14 יום
  await p.evaluate(() => new Promise(res => { const r = indexedDB.open('ev-lab'); r.onsuccess = () => { const d = r.result, t = d.transaction('kv', 'readwrite'), s = t.objectStore('kv'); const g = s.get('meta'); g.onsuccess = () => { const m = g.result; m.lastBackup = Date.now() - 15 * 864e5; s.put(m, 'meta'); }; t.oncomplete = () => { d.close(); res(); }; }; }));
  await load();
  const rem = await p.evaluate(() => (document.querySelector('#nt-backup') || {}).textContent || '');
  assert(/15 ימים/.test(rem), 'תזכורת גיבוי אחרי 14 יום: ' + rem);
  await p.evaluate(() => [...document.querySelectorAll('#nt-backup button')].find(b => /3 ימים/.test(b.textContent)).click());
  assert(await p.evaluate(() => !document.querySelector('#nt-backup')), '״בעוד 3 ימים״ דוחה את התזכורת');

  // 8. בלי IndexedDB – נפילה ל-localStorage
  const ctx2 = await browser.newContext({ serviceWorkers: 'block' });
  await ctx2.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined }); });
  const p2 = await ctx2.newPage(); watch(p2, errors, '(noidb) ');
  await p2.goto(url + 'index.html'); await prep(p2);
  await p2.evaluate(async () => { RepairLog.add({ customer: 'בלי IDB' }); await Persist.flush(); });
  await p2.reload(); await prep(p2);
  const fb = await p2.evaluate(() => [Persist.backend(), RepairLog.all().map(x => x.customer)]);
  assert(fb[0] === 'ls' && fb[1].includes('בלי IDB'), 'בלי IndexedDB: נפילה ל-localStorage והנתונים נשמרים');

  assert(!errors.length, 'אין שגיאות קונסול ' + errors.join(' | '));
  srv.close(); await browser.close(); console.log('STAGE F OK');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

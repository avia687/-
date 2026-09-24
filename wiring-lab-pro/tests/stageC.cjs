// שלב C – אבטחה. PW=$(npm root -g)/playwright node tests/stageC.cjs
const { serve, launch, watch, assert } = require('./lib.cjs');
(async () => {
  const browser = await launch(); const errors = [];
  const { srv, url } = await serve();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); watch(p, errors);
  const csp = [];
  p.on('console', m => { if (/Content Security Policy/.test(m.text())) csp.push(m.text()); });
  await p.goto(url + 'index.html'); await p.waitForTimeout(1200);
  await p.evaluate(() => window.__testReady && window.__testReady());

  // 1. CSP חוסם סקריפט מוזרק
  const inj = await p.evaluate(() => new Promise(r => { const s = document.createElement('script'); s.textContent = 'window.__inj=1'; document.body.appendChild(s); const d = document.createElement('div'); d.innerHTML = '<img src="x" onerror="window.__inj2=1">'; document.body.appendChild(d); setTimeout(() => r([window.__inj, window.__inj2, !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')]), 400); }));
  assert(inj[0] === undefined && inj[1] === undefined && inj[2], 'CSP: סקריפט inline ו-onerror מוזרקים נחסמים');
  assert(csp.length >= 1, 'CSP מדווח על הניסיון (' + csp.length + ' הפרות נחסמו)');
  csp.length = 0; errors.length = 0;

  // 2. ייבוא: XSS, __proto__, גודל, טיפוסים
  const r = await p.evaluate(async () => {
    const q = s => document.querySelector(s), click = s => q(s).click();
    click('[data-mode="tools"]'); click('[data-action="tl-sub"][data-sub="log"]');
    const imp = async (text) => { if (q('#lgImportBox').hidden) click('[data-action="lg-import"]'); q('#lgPaste').value = text; click('[data-action="lg-doimport"]'); await new Promise(r => setTimeout(r, 50)); const e = q('#lgErr'); return e && !e.hidden ? e.textContent : ''; };
    const out = {};
    out.badId = await imp(JSON.stringify({ items: [{ id: '"><img src=x onerror=window.__x=1>', customer: 'a' }] }));
    out.proto = await imp('{"items":[{"id":"a1","__proto__":{"polluted":1}}]}');
    out.ctor = await imp('{"items":[],"constructor":{"prototype":{"polluted":1}}}');
    out.big = await imp('{"items":[],"pad":"' + 'x'.repeat(5.2 * 1024 * 1024) + '"}');
    out.types = await imp(JSON.stringify({ items: [{ id: 'ok1', km: 'עשר', photos: 'x', date: '2026/1/1' }] }));
    out.notjson = await imp('{items: [}');
    out.okErr = await imp(JSON.stringify({ items: [{ id: 'xss1', customer: '<img src=x onerror=window.__x=1>', notes: '<script>window.__x=2</script>', serial: '"><svg onload=window.__x=3>' }] }));
    await new Promise(r => setTimeout(r, 300));
    out.rendered = [...document.querySelectorAll('.log-item')].some(e => e.textContent.includes('<img src=x'));
    out.noImg = !document.querySelector('.log-item img, .log-item svg[onload], .log-item script');
    out.x = window.__x; out.polluted = ({}).polluted;
    return out;
  });
  assert(/פורמט לא תקין/.test(r.badId), 'מזהה רשומה עם HTML נדחה: ' + r.badId.split('\n')[0]);
  assert(/מפתח אסור.*__proto__/.test(r.proto), '__proto__ נדחה: ' + r.proto);
  assert(/מפתח אסור.*(constructor|prototype)/.test(r.ctor), 'constructor/prototype נדחים: ' + r.ctor);
  assert(/גדול מדי/.test(r.big), 'קובץ מעל 5MB נדחה: ' + r.big);
  assert(/km: צריך להיות מספר/.test(r.types) && /photos: צריך להיות רשימה/.test(r.types) && /date: פורמט/.test(r.types), 'שגיאות טיפוס ברורות לכל שדה');
  assert(/לא JSON תקין/.test(r.notjson), 'JSON שבור – הודעה ברורה');
  assert(r.okErr === '' && r.rendered && r.noImg && r.x === undefined && r.polluted === undefined, 'תוכן HTML בשדות מוצג כטקסט בלבד, לא רץ, בלי זיהום prototype');

  // 3. ולידציה של שדות מספריים
  const v = await p.evaluate(() => {
    const q = s => document.querySelector(s);
    q('[data-action="tl-sub"][data-sub="calc"]').click();
    const i = q('#cRWh'); i.value = '-50'; i.dispatchEvent(new Event('input', { bubbles: true }));
    const a = [i.getAttribute('aria-invalid'), (i.parentElement.querySelector('.field-err') || {}).textContent, q('#cROut').textContent];
    i.value = '500'; i.dispatchEvent(new Event('input', { bubbles: true }));
    return a.concat([i.getAttribute('aria-invalid')]);
  });
  assert(v[0] === 'true' && /טווח/.test(v[1]) && v[3] === 'false', 'ערך מחוץ לטווח מסומן ומוסבר, ערך תקין מנקה');

  // 4. Vault
  const vt = await p.evaluate(async () => {
    const box = await Vault.seal('4321', { secret: 'לקוח' });
    const back = await Vault.open('4321', box);
    let bad = ''; try { await Vault.open('0000', box); } catch (e) { bad = e.message; }
    const t = JSON.parse(JSON.stringify(box)); t.ct = t.ct.slice(0, -4) + 'AAAA'; let tam = ''; try { await Vault.open('4321', t); } catch (e) { tam = e.message; }
    return { iter: box.iter, back: back.secret, bad, tam, hasPin: JSON.stringify(box).includes('4321') };
  });
  assert(vt.iter >= 200000 && vt.back === 'לקוח' && vt.bad === 'bad-secret' && vt.tam === 'bad-secret' && !vt.hasPin, `AES-GCM + PBKDF2 ${vt.iter} איטרציות: פענוח, PIN שגוי ושינוי נתונים נכשלים, ה-PIN לא נשמר`);

  assert(!errors.length && !csp.length, 'אין שגיאות ואין הפרות CSP ' + errors.concat(csp).join(' | '));
  srv.close(); await browser.close(); console.log('STAGE C OK');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

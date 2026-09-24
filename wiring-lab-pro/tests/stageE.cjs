// שלב E – ביצועים ו-PWA. PW=$(npm root -g)/playwright node tests/stageE.cjs
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { serve, launch, watch, assert, prep, DIST } = require('./lib.cjs');
const WEB = path.join(DIST, 'web');
const gz = f => zlib.gzipSync(fs.readFileSync(path.join(WEB, f)), { level: 9 }).length;
(async () => {
  // 1. תקציב JS ראשוני
  const js = gz('app.js') + gz('pro.js'), html = gz('index.html'), css = gz('app.css'), three = gz('vendor/three.min.js');
  console.log(`  gzip: app.js+pro.js ${(js / 1024).toFixed(0)}KB · index.html ${(html / 1024).toFixed(0)}KB · app.css ${(css / 1024).toFixed(0)}KB · three (עצל) ${(three / 1024).toFixed(0)}KB`);
  assert(js < 150 * 1024, `JS ראשוני ${(js / 1024).toFixed(0)}KB gzip < 150KB (Three.js לא נכלל – נטען רק לתלת-ממד)`);

  const browser = await launch(); const errors = [];
  let offline = false;
  const { srv, url } = await serve(WEB, 0, { gzip: true, offline: () => offline });

  // 2. טעינה ראשונה ב-4G מדומה (4Mbps, RTT 150ms, בלי מטמון)
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 870 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage(); watch(p, errors, '(4g) ');
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 4e6 / 8, uploadThroughput: 1.5e6 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
    const reqs = [];
    p.on('request', r => reqs.push({ u: r.url().replace(url, ''), t: Date.now() }));
    await p.addInitScript(() => { window.__cls = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); });
    await p.goto(url + 'index.html');
    const t = await p.evaluate(async () => { await window.__testReady(); const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { ready: performance.now(), fcp: fcp ? fcp.startTime : null }; });
    const atReady = reqs.map(r => r.u);
    console.log(`  4G: FCP ${Math.round(t.fcp)}ms · ממשק מוכן ${Math.round(t.ready)}ms · בקשות עד מוכן: ${atReady.join(', ')}`);
    assert(t.ready < 2000, `טעינה ראשונה ב-4G: הממשק מוכן אחרי ${Math.round(t.ready)}ms (< 2000ms)`);
    assert(!atReady.some(u => /three/.test(u)), 'Three.js לא נטען לפני שהממשק מוכן');
    assert(atReady.filter(u => /^data\/m-/.test(u)).length === 1, 'נטען רק קובץ הנתונים של הדגם הנוכחי');
    await p.waitForFunction(() => Perf.state() === 'ready' || Perf.state() === 'failed', null, { timeout: 30000 });
    await p.waitForTimeout(800);
    const all = reqs.map(r => r.u);
    assert(all.some(u => /three\.min\.js/.test(u)) && await p.evaluate(() => Perf.state()) === 'ready', 'אחרי שהממשק מוכן Three.js נטען ברקע והתלת-ממד עולה');
    assert(all.filter(u => /^data\/m-/.test(u)).length === 12, 'שאר 11 הדגמים נטענים ברקע (לעבודה בלי רשת)');
    const cls = await p.evaluate(() => window.__cls);
    assert(cls < 0.05, `אין קפיצות פריסה: CLS ${cls.toFixed(3)}`);
    await ctx.close();
  }

  // 3. rAF רק כשצריך + חיסכון סוללה
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    const p = await ctx.newPage(); watch(p, errors, '(raf) ');
    await p.addInitScript(() => { const r = window.requestAnimationFrame.bind(window); window.__raf = 0; window.requestAnimationFrame = f => { window.__raf++; return r(f); }; });
    await p.goto(url + 'index.html'); await prep(p);
    await p.waitForFunction(() => Perf.state() === 'ready', null, { timeout: 30000 });
    const count = () => p.evaluate(() => new Promise(res => { const a = window.__raf; setTimeout(() => res(window.__raf - a), 1000); }));
    const on = await count();
    await p.evaluate(() => document.querySelector('#saverBtn').click());
    await p.waitForTimeout(300);
    const off = await count();
    const ov = await p.evaluate(() => ({ btn: !!document.querySelector('#load3d:not([hidden])'), pressed: document.querySelector('#saverBtn').getAttribute('aria-pressed') }));
    assert(on >= 5 && off <= 1 && ov.btn && ov.pressed === 'true', `לולאת ציור: ${on} פריימים/שנייה פעיל, ${off} בחיסכון סוללה; כפתור ״הצג מודל״ מוצג`);
    await p.reload(); await prep(p); await p.waitForTimeout(1500);
    const saved = await p.evaluate(() => ({ st: Perf.state(), three: typeof THREE, btn: !!document.querySelector('#load3d:not([hidden])') }));
    assert(saved.st === 'idle' && saved.three === 'undefined' && saved.btn, 'חיסכון סוללה נשמר: בטעינה הבאה Three.js לא נטען בכלל');
    await p.evaluate(() => document.querySelector('#load3d').click());
    await p.waitForFunction(() => Perf.state() === 'ready', null, { timeout: 30000 });
    assert(true, '״הצג מודל תלת-ממדי״ טוען ומפעיל את התלת-ממד');
    const hl = await p.evaluate(() => { document.querySelector('[data-mode="learn"]').click(); document.querySelector('[data-action="learn-sub"][data-sub="comps"]').click(); const b = document.querySelector('[data-action="show-comp"], .comp-grid button'); if (b) b.click(); return Scene.loaded && Scene.hasComp('battery'); });
    assert(hl, 'התלת-ממד שנטען בעיכוב מגיב לבחירת רכיב');
    await ctx.close();
  }

  // 4. PWA: התקנה ועבודה מלאה בלי רשת
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(); watch(p, errors, '(pwa) ');
    await p.goto(url + 'index.html'); await prep(p);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); await prep(p);
    const ctrl = await p.evaluate(() => !!navigator.serviceWorker.controller);
    assert(ctrl, 'Service Worker רשום ושולט בדף');
    const cdp = await ctx.newCDPSession(p);
    const inst = await cdp.send('Page.getInstallabilityErrors');
    assert(inst.installabilityErrors.length === 0, 'ניתן להתקנה (Chrome: אין שגיאות התקנה) ' + JSON.stringify(inst.installabilityErrors));
    const man = await cdp.send('Page.getAppManifest');
    assert(!man.errors.length && /מעבדת EV/.test(man.data), 'manifest תקין');
    offline = true; await ctx.setOffline(true);
    await p.reload(); await prep(p);
    await p.waitForFunction(() => Perf.state() === 'ready' || Perf.state() === 'failed', null, { timeout: 20000 });
    const off = await p.evaluate(async () => {
      const out = { three: Perf.state(), models: 0 };
      for (const id of Object.keys(DATA.models)) { UI.setModel(id); await ModelData.ensure(id); if (M().testPoints && M().testPoints.length) out.models++; }
      document.querySelector('[data-mode="diag"]').click(); document.querySelector('[data-action="dg-sub"][data-sub="tp"]').click();
      out.tp = document.querySelectorAll('.tp-card').length;
      RepairLog.add({ customer: 'בלי רשת' }); await Persist.flush();
      out.saved = RepairLog.all().some(x => x.customer === 'בלי רשת');
      return out;
    });
    assert(off.three === 'ready' && off.models === 12 && off.tp > 10 && off.saved, 'בלי רשת: האפליקציה, התלת-ממד, כל 12 הדגמים, נקודות הבדיקה ושמירה ליומן עובדים');
    const q = await ctx.newPage(); await q.goto(url + 'terms.html');
    assert(/תנאי שימוש/.test(await q.evaluate(() => document.body.textContent)), 'בלי רשת: terms.html זמין');
    offline = false; await ctx.setOffline(false);
    await ctx.close();
  }
  const errs = errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  assert(!errs.length, 'אין שגיאות ' + errs.join(' | '));
  srv.close(); await browser.close(); console.log('STAGE E OK');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

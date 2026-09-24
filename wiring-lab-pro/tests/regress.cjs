// בדיקת רגרסיה מלאה: 12 דגמים × לימוד/אקדמיה/אשף/אבחון/כלים, בלי WebGL, מובייל.
// שימוש: PW=$(npm root -g)/playwright node tests/regress.cjs [web|artifact]
const fs = require('fs'), path = require('path');
const { serve, launch, watch, assert, prep, DIST } = require('./lib.cjs');
const THREE = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'three.min.js'));
const target = process.argv[2] || 'web';
(async () => {
  const browser = await launch();
  const errors = [];
  const { srv, url } = await serve();
  const mk = async (vp, block3d) => {
    const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    watch(p, errors, block3d ? '(no3d) ' : '');
    await p.route('**/three.min.js', r => block3d ? r.abort() : r.fulfill({ body: THREE, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await p.goto(target === 'web' ? url + 'index.html' : 'file://' + path.join(DIST, 'index.html'));
    await p.waitForTimeout(1500);
    await prep(p);
    return p;
  };
  const suite = async (p) => p.evaluate(() => {
    const q = s => document.querySelector(s), c = s => { const e = q(s); if (!e) throw new Error('missing ' + s); e.click(); };
    const setv = (s, v) => { const e = q(s); e.value = v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); };
    const ids = [...document.querySelectorAll('#modelSelect option')].map(o => o.value);
    const out = {};
    for (const id of ids) {
      const sel = q('#modelSelect'); sel.value = id; sel.dispatchEvent(new Event('change'));
      const vc = vehicleComps();
      const r = { comps: vc.length };
      // learn: model + academy + glossary
      c('[data-mode="learn"]'); c('[data-action="learn-sub"][data-sub="model"]');
      r.confBadges = document.querySelectorAll('#modeView .conf').length;
      c('[data-action="learn-sub"][data-sub="glossary"]'); r.gloss = document.querySelectorAll('.gl-row').length;
      c('[data-action="learn-sub"][data-sub="academy"]'); { const b = q('[data-action="ac-list"]'); if (b) b.click(); }
      r.acad = document.querySelectorAll('.acad-mod').length;
      // wizard: all scenarios, pass all verifications
      c('[data-mode="wizard"]');
      const scen = [...document.querySelectorAll('input[name="wzS"]')].map(i => i.value);
      r.scen = scen.join(',');
      let steps = 0, blocked = 0;
      for (const s of scen) {
        const ri = q(`input[name="wzS"][value="${s}"]`); ri.checked = true; ri.dispatchEvent(new Event('change'));
        c('[data-action="wz-start"]');
        for (let g = 0; g < 20; g++) {
          const next = q('#modeView .navrow .btn.primary');
          if (next.disabled) blocked++;
          const inp = q('#wvIn'), inp2 = q('#wvIn2'), chk = q('#wvChk'), ch = q('#wvBox [data-wv="0"]');
          const hint = (q('#wvBox .foot') || {}).textContent || '';
          if (inp2) { setv('#wvIn', '0.8'); setv('#wvIn2', '4.1'); }
          else if (inp) { const m = hint.match(/(\d+(?:\.\d+)?)–(\d+(?:\.\d+)?)/); const v = m ? ((+m[1] + +m[2]) / 2).toFixed(1) : '12'; setv('#wvIn', v); }
          else if (ch) ch.click();
          else if (chk) { chk.checked = true; chk.dispatchEvent(new Event('change')); }
          const n2 = q('#modeView .navrow .btn.primary');
          if (n2.disabled) throw new Error(id + ' ' + s + ' step ' + g + ' still blocked: ' + hint);
          steps++;
          const last = n2.dataset.action === 'wz-done';
          n2.click();
          if (last) break;
        }
        c('[data-action="wz-exit"]');
      }
      r.wizSteps = steps; r.blockedBefore = blocked;
      // diag
      c('[data-mode="diag"]'); c('[data-action="dg-sub"][data-sub="adv"]');
      r.meas = [...document.querySelectorAll('details.meas')].map(d => d.dataset.m).join(',');
      c('[data-action="dg-sub"][data-sub="tp"]'); r.tps = document.querySelectorAll('.tp-card').length;
      r.tpComps = [...new Set([...document.querySelectorAll('.tp-card [data-action="tp-show"]')].map(b => (M().testPoints.find(t => t.id === b.dataset.tp) || {}).comp))].every(x => vc.includes(x));
      c('[data-action="dg-sub"][data-sub="inter"]'); r.wig = document.querySelectorAll('.wig-list li').length;
      c('[data-action="dg-sub"][data-sub="codes"]');
      // tools
      c('[data-mode="tools"]');
      for (const t of ['calc', 'log', 'cmp', 'spec', 'sim', 'shop']) { c(`[data-action="tl-sub"][data-sub="${t}"]`); }
      c('[data-action="tl-sub"][data-sub="calc"]');
      r.calcOut = (q('#cROut').textContent || '').slice(0, 20);
      out[id] = r;
    }
    return out;
  });

  const p = await mk({ width: 1400, height: 900 }, false);
  const res = await suite(p);
  const ids = Object.keys(res);
  assert(ids.length === 12, '12 דגמים עברו את כל המסכים');
  for (const id of ids) {
    const r = res[id];
    if (!(r.gloss > 30 && r.acad === 7 && r.wizSteps > 40 && r.blockedBefore === r.wizSteps && r.tps >= 14 && r.tpComps && r.calcOut)) throw new Error(id + ' ' + JSON.stringify(r));
  }
  assert(true, 'לכל דגם: מילון, 7 מודולים, כל שלבי האשף נעולים עד אימות, נקודות בדיקה של רכיבים קיימים, מחשבון');
  assert(!res.mateX.meas.includes('m_thr'), 'MATE X בלי מדידות מצערת (omit)');
  assert(!res.g30.meas.includes('m_pas') && !res.g30.meas.includes('m_charger'), 'G30 בלי PAS ובלי מדידת מטען');
  assert(res.korshidi.meas.includes('m_alarm') && !res.oxo.meas.includes('m_alarm'), 'אזעקה רק בדגמים שיש להם');
  const p2 = await mk({ width: 1200, height: 800 }, true);
  const r2 = await suite(p2);
  assert(Object.keys(r2).length === 12, 'בלי WebGL/Three.js: כל 12 הדגמים עובדים');
  const p3 = await mk({ width: 390, height: 844 }, false);
  await p3.evaluate(() => document.querySelector('[data-mode="diag"]').click());
  await p3.waitForTimeout(600);
  const small = await p3.evaluate(() => [...document.querySelectorAll('#modeView button, #modeView input, #modeView select')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5 && !e.closest('.term')).map(e => e.outerHTML.slice(0, 60)));
  assert(small.length === 0, 'מובייל: כל יעדי המגע ≥44px ' + (small.length ? JSON.stringify(small.slice(0, 3)) : ''));
  const errs = errors.filter(e => !/^\(no3d\)/.test(e) || !/three|ERR_FAILED/i.test(e));
  if (errs.length) { console.log(errs.join('\n')); throw new Error('console errors: ' + errs.length); }
  assert(true, 'אין שגיאות קונסול ואין הפרות CSP');
  srv.close(); await browser.close();
  console.log('REGRESS OK (' + target + ')');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

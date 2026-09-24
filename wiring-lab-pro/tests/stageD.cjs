// שלב D – עיצוב ונגישות. PW=$(npm root -g)/playwright node tests/stageD.cjs [shots-dir]
const { serve, launch, watch, assert, prep } = require('./lib.cjs');
const SHOTS = process.argv[2] || null;
const CONTRAST = () => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e); const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      if (e.id === 'stage') { layers.push({ r: 22, g: 25, b: 28, a: 1 }); break; }
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    if (!layers.length || layers[layers.length - 1].a < 1) out = parse(getComputedStyle(document.body).backgroundColor);
    for (let i = layers.length - 1; i >= 0; i--) out = blend(layers[i], out);
    return out;
  };
  const bad = [];
  let n = 0;
  document.querySelectorAll('body *').forEach(el => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
    if (el.closest('[hidden], .sr-only, svg, canvas, option, .sim-lcd, .loader.done, #legalModal[hidden]')) return;
    const own = [...el.childNodes].some(t => t.nodeType === 3 && t.textContent.trim().length > 1);
    if (!own) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.5) return;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    let fg = parse(cs.color); const bg = bgOf(el); if (fg.a < 1) fg = blend(fg, bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
    n++;
    if (el.disabled || el.closest('button:disabled')) return;
    if (ratio < need) bad.push(`${ratio.toFixed(2)} <${need}: ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} "${el.textContent.trim().slice(0, 30)}"`);
  });
  return { n, bad: [...new Set(bad)] };
};
(async () => {
  const browser = await launch(); const errors = [];
  const { srv, url } = await serve();
  const results = {};
  for (const [theme, scheme] of [['auto', 'dark'], ['auto', 'light'], ['day', 'light']]) {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: scheme, serviceWorkers: 'block' });
    const p = await ctx.newPage(); watch(p, errors, `(${theme}/${scheme}) `);
    await p.goto(url + 'index.html'); await prep(p);
    if (theme !== 'auto') await p.evaluate(t => Theme.set(t), theme);
    const bad = new Set(); let total = 0;
    const screens = [
      ['learn-model', () => { document.querySelector('[data-mode="learn"]').click(); document.querySelector('[data-action="learn-sub"][data-sub="model"]').click(); }],
      ['learn-academy', () => { document.querySelector('[data-action="learn-sub"][data-sub="academy"]').click(); }],
      ['wizard', () => { document.querySelector('[data-mode="wizard"]').click(); }],
      ['wizard-step', () => { document.querySelector('[data-action="wz-start"]').click(); }],
      ['diag-adv', () => { document.querySelector('[data-mode="diag"]').click(); document.querySelector('[data-action="dg-sub"][data-sub="adv"]').click(); const b = document.querySelector('[data-action="dp-sym"]'); if (b) b.click(); }],
      ['diag-tp', () => { document.querySelector('[data-action="dg-sub"][data-sub="tp"]').click(); }],
      ['diag-codes', () => { document.querySelector('[data-action="dg-sub"][data-sub="codes"]').click(); }],
      ['tools-calc', () => { document.querySelector('[data-mode="tools"]').click(); document.querySelector('[data-action="tl-sub"][data-sub="calc"]').click(); document.querySelectorAll('#modeView details').forEach(d => d.open = true); }],
      ['tools-log', () => { document.querySelector('[data-action="tl-sub"][data-sub="log"]').click(); }],
      ['tools-cmp', () => { document.querySelector('[data-action="tl-sub"][data-sub="cmp"]').click(); }],
      ['tools-sim', () => { document.querySelector('[data-action="tl-sub"][data-sub="sim"]').click(); }],
      ['tools-data', () => { document.querySelector('[data-action="tl-sub"][data-sub="data"]').click(); }],
      ['build-calc', () => { document.querySelector('[data-mode="build"]').click(); document.querySelector('[data-action="bg-step"][data-s="calc"]').click(); }],
      ['build-check', () => { document.querySelector('[data-action="bg-step"][data-s="check"]').click(); }],
      ['build-wiring', () => { document.querySelector('[data-action="bg-step"][data-s="wiring"]').click(); document.querySelector('[data-wire="phase"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }],
      ['build-guide', () => { document.querySelector('[data-action="bg-step"][data-s="guide"]').click(); }],
      ['build-summary', () => { document.querySelector('[data-action="bg-step"][data-s="summary"]').click(); }],
      ['search', () => { const i = document.querySelector('#gSearch'); i.value = 'לא טוען'; i.dispatchEvent(new Event('input')); }],
      ['vehicles', () => { document.querySelector('#gsList').hidden = true; Tools.go('vehicles'); }],
      ['quote', () => { Tools.go('quote'); }],
      ['cards', () => { UI.setMode('learn'); document.querySelector('[data-action="learn-sub"][data-sub="cards"]').click(); document.querySelector('[data-action="fc-show"]').click(); }],
      ['workshop', () => { Level.setWorkshop(true); UI.setMode('diag'); }],
    ];
    for (const [name, fn] of screens) {
      await p.evaluate(`(${fn.toString()})()`); await p.waitForTimeout(250);
      const r = await p.evaluate(CONTRAST);
      total += r.n; r.bad.forEach(b => bad.add(name + ': ' + b));
      if (SHOTS && (name === 'diag-adv' || name === 'tools-calc' || name === 'learn-model' || name.startsWith('build-'))) await p.screenshot({ path: `${SHOTS}/${theme}-${scheme}-${name}.png` });
    }
    results[theme + '/' + scheme] = { total, bad: [...bad] };
    if (theme === 'auto' && scheme === 'dark') {
      // גופנים: מקומיים, בלי Inter/Roboto/Arial
      const f = await p.evaluate(async () => { await document.fonts.ready; const fams = new Set(); document.querySelectorAll('body *').forEach(e => fams.add(getComputedStyle(e).fontFamily)); return { fams: [...fams], loaded: [...document.fonts].filter(x => x.status === 'loaded').map(x => x.family + ' ' + x.weight) }; });
      assert(!f.fams.some(x => /\b(Inter|Roboto|Arial)\b/i.test(x)), 'אין Inter/Roboto/Arial בשום רכיב');
      assert(f.loaded.some(x => /Plex Hebrew/.test(x)) && f.loaded.some(x => /Plex Mono/.test(x)), 'גופנים מקומיים נטענו: ' + [...new Set(f.loaded)].join(', '));
      // אין אימוג׳י בטקסט המוצג
      const em = await p.evaluate(() => { const m = document.body.innerText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2705}\u{274C}\u{2753}\u{2B50}\u{FE0F}]/u); return m ? m[0] : ''; });
      assert(!em, 'אין אימוג׳י בממשק ' + em);
      // אין גרדיאנטים דקורטיביים
      const gr = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.offsetParent && /gradient/.test(getComputedStyle(e).backgroundImage) && !e.closest('.vbar, .stop, .sticky-actions, .navrow')).map(e => e.className).slice(0, 5));
      assert(gr.length === 0, 'אין גרדיאנטים דקורטיביים ' + JSON.stringify(gr));
      // פוקוס נראה
      const fo = await p.evaluate(() => { const b = document.querySelector('#modeView button'); b.focus(); const cs = getComputedStyle(b); return [cs.outlineStyle, parseFloat(cs.outlineWidth)]; });
      await p.keyboard.press('Tab');
      const fo2 = await p.evaluate(() => { const cs = getComputedStyle(document.activeElement); return [document.activeElement.tagName, cs.outlineStyle, parseFloat(cs.outlineWidth)]; });
      assert(fo2[1] !== 'none' && fo2[2] >= 2, `פוקוס מקלדת נראה (${fo2.join(' ')})`);
    }
    await ctx.close();
  }
  for (const [k, r] of Object.entries(results)) if (r.bad.length) console.log(`  ${k}:\n    ` + r.bad.slice(0, 40).join('\n    '));
  for (const [k, r] of Object.entries(results)) {
    assert(r.bad.length === 0, `ניגודיות ≥4.5:1 (טקסט גדול ≥3:1) – ${k}: ${r.total} רכיבי טקסט נבדקו`);
  }
  // תנועה מופחתת
  const ctx = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
  const p = await ctx.newPage(); await p.goto(url + 'index.html'); await prep(p);
  const rm = await p.evaluate(() => { const d = getComputedStyle(document.querySelector('#modeView')).animationDuration; return parseFloat(d); });
  assert(rm < 0.05, 'prefers-reduced-motion: אנימציות מבוטלות');
  // יעדי מגע במובייל
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const mp = await m.newPage(); await mp.goto(url + 'index.html'); await prep(mp);
  const small = await mp.evaluate(() => { const out = []; for (const mode of ['learn', 'diag', 'tools']) { document.querySelector(`[data-mode="${mode}"]`).click(); document.querySelectorAll('button, input:not([type=checkbox]):not([type=radio]), select, .check').forEach(e => { if (!e.offsetParent || e.closest('.term, .tbl-wrap, table')) return; const r = e.getBoundingClientRect(); if (r.height < 43.5) out.push(mode + ':' + e.outerHTML.slice(0, 70)); }); } return out; });
  assert(small.length === 0, 'מובייל: יעדי מגע ≥44px ' + JSON.stringify(small.slice(0, 4)));
  if (SHOTS) { await mp.evaluate(() => document.querySelector('[data-mode="diag"]').click()); await mp.waitForTimeout(300); await mp.screenshot({ path: `${SHOTS}/mobile-diag.png` }); }
  assert(!errors.length, 'אין שגיאות ' + errors.join(' | '));
  srv.close(); await browser.close(); console.log('STAGE D OK');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

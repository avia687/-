/* =====================================================================
   p08 · DiagEngine – מנוע הסתברות (Bayes פשוט) לאבחון מבוסס מדידות
   כל סיבה: משקל התחלתי × משקל דגם. כל ראיה (סימפטום, מדידה, תנאי,
   Wiggle) מכפילה בסבירות P(ראיה | סיבה). מסננים לפי vehicleComps()
   כך ש-omit מסתיר סיבות ומדידות של רכיבים שאין בדגם.
   ===================================================================== */
const DiagEngine = (() => {
  const P = () => DATA.pro;
  const has = id => vehicleComps().includes(id);
  const NORMAL = { m_batt: 'ok', m_ctrl_in: 'same', m_disp: 'ok', m_5v: 'ok', m_thr_rest: 'ok', m_thr_full: 'ok', m_hall: 'all', m_phase_r: 'equal', m_brake: 'works', m_pas: 'pulses', m_sag: 'ok', m_charger: 'ok', m_wiggle: 'none', m_hot: 'none', m_link: 'ok', m_alarm: 'unlocked', m_settings: 'ok' };

  const causeOK = c => (!c.requires || c.requires.some(has)) && c.comps.some(has);
  const measOK = m => (!m.requires || m.requires.every(has)) && (m.comp === 'frame' || has(m.comp)) && !(m.id === 'm_charger' && M().builtInCharger);
  function causes() { return P().causes.filter(causeOK); }
  function measurements() { return P().measurements.filter(measOK); }
  function symptoms() { return P().bayesSymptoms.filter(s => !s.requires || s.requires.every(has)); }
  function measById(id) { return P().measurements.find(m => m.id === id); }
  function causeById(id) { return P().causes.find(c => c.id === id); }
  function compOf(c) { return c.comps.find(has) || c.comps[0]; }
  function prior(c) { const w = (M().failureWeights || {})[c.id]; return c.prior * (w || 1); }

  function likMeas(m, o, cid) {
    const outs = Object.keys(m.outcomes), t = m.lik[cid];
    if (t) {
      if (t[o] != null) return Math.max(0.01, t[o]);
      const spec = Object.values(t).reduce((a, b) => a + b, 0), rest = outs.filter(x => t[x] == null).length;
      return Math.max(0.01, (1 - spec) / Math.max(1, rest));
    }
    const normal = NORMAL[m.id] || outs[0];
    return o === normal ? 0.9 : 0.1 / Math.max(1, outs.length - 1);
  }
  function symLik(s, cid) { const t = P().symptomLik[s]; return t && t[cid] != null ? t[cid] : P().defaultSymptomLik; }
  function interLik(ic, cid) { const x = P().interConditions.find(i => i.id === ic); return x && x.lik[cid] != null ? x.lik[cid] : 0.15; }
  function wigFactor(c, bid) {
    const b = bundleById(bid); if (!b) return 1;
    if (c.id === 'loose_harness') return 2.5;
    return (c.wiggle || []).includes(b.circuit) ? 3 : 0.6;
  }

  /** ראיות: { sym:Set, res:{mid:outcome}, inter:Set, wig:{bundleId:'cut'|'ok'} } */
  function logScores(ev, cs, skip) {
    return cs.map(c => {
      let l = Math.log(prior(c));
      ev.sym.forEach(s => { if (skip !== 's:' + s) l += Math.log(symLik(s, c.id)); });
      Object.keys(ev.res).forEach(mid => { const m = measById(mid); if (m && measOK(m) && skip !== 'm:' + mid) l += Math.log(likMeas(m, ev.res[mid], c.id)); });
      ev.inter.forEach(ic => { if (skip !== 'i:' + ic) l += Math.log(interLik(ic, c.id)); });
      Object.keys(ev.wig || {}).forEach(bid => { if (ev.wig[bid] === 'cut' && skip !== 'w:' + bid) l += Math.log(wigFactor(c, bid)); });
      return l;
    });
  }
  function normalize(logs) {
    const mx = Math.max(...logs), ex = logs.map(l => Math.exp(l - mx)), s = ex.reduce((a, b) => a + b, 0) || 1;
    return ex.map(x => x / s);
  }
  function posterior(ev) {
    const cs = causes();
    if (!cs.length) return [];
    const ps = normalize(logScores(ev, cs));
    return cs.map((c, i) => ({ c, p: ps[i] })).sort((a, b) => b.p - a.p);
  }
  const H = ps => -ps.reduce((a, p) => a + (p > 1e-12 ? p * Math.log2(p) : 0), 0);

  /** כמה צפויה המדידה לצמצם את אי-הוודאות (Expected Information Gain, ביטים) */
  function eig(m, post) {
    const outs = Object.keys(m.outcomes), h0 = H(post.map(x => x.p));
    let exp = 0;
    outs.forEach(o => {
      const joint = post.map(x => x.p * likMeas(m, o, x.c.id)), po = joint.reduce((a, b) => a + b, 0);
      if (po <= 0) return;
      exp += po * H(joint.map(j => j / po));
    });
    return Math.max(0, h0 - exp);
  }
  function suggest(ev, post, n = 3) {
    return measurements().filter(m => ev.res[m.id] == null)
      .map(m => ({ m, g: eig(m, post) })).filter(x => x.g > 0.02)
      .sort((a, b) => b.g - a.g).slice(0, n);
  }
  /** אילו ראיות תומכות בסיבה המובילה או מחלישות אותה (השוואה להסתברות בלי הראיה) */
  function evidence(cid, ev) {
    const cs = causes(), i = cs.findIndex(c => c.id === cid);
    if (i < 0) return [];
    const full = normalize(logScores(ev, cs))[i];
    const items = [];
    ev.sym.forEach(s => items.push({ key: 's:' + s, label: 'סימפטום: ' + ((P().bayesSymptoms.find(x => x.id === s) || {}).name || s) }));
    Object.keys(ev.res).forEach(mid => { const m = measById(mid); if (m && measOK(m)) items.push({ key: 'm:' + mid, label: `${m.name}: ${m.outcomes[ev.res[mid]] || ev.res[mid]}` }); });
    ev.inter.forEach(ic => { const x = P().interConditions.find(y => y.id === ic); if (x) items.push({ key: 'i:' + ic, label: 'תנאי: ' + x.name }); });
    Object.keys(ev.wig || {}).forEach(bid => { if (ev.wig[bid] === 'cut') { const b = bundleById(bid); items.push({ key: 'w:' + bid, label: 'Wiggle: ' + (b ? b.label : bid) + ' גורם לניתוק' }); } });
    return items.map(it => {
      const without = normalize(logScores(ev, cs, it.key))[i];
      return Object.assign(it, { delta: full - without });
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  /** סיווג קריאה מספרית לתוצאה, לפי מתחי הדגם */
  function classify(mid, v, vals) {
    const b = BR();
    const num = x => (typeof x === 'number' && isFinite(x));
    switch (mid) {
      case 'm_batt': if (!num(v)) return null; if (v < 1) return 'zero'; if (v < b.empty - 0.3) return 'low'; if (v > b.full + 0.5) return 'high'; return 'ok';
      case 'm_ctrl_in': {
        if (!num(v)) return null; if (v < 1) return 'zero';
        const ref = vals && num(vals.m_batt) ? vals.m_batt : null;
        if (ref != null) return ref - v >= 0.5 ? 'drop' : 'same';
        return v < b.empty - 0.3 ? 'drop' : 'same';
      }
      case 'm_disp': if (!num(v)) return null; return v < 1 ? 'zero' : 'ok';
      case 'm_5v': if (!num(v)) return null; if (v < 0.5) return 'zero'; if (v < 4.6) return 'low'; return 'ok';
      case 'm_thr_rest': if (!num(v)) return null; if (v < 0.3) return 'zero'; if (v > 1.2) return 'high'; return 'ok';
      case 'm_thr_full': if (!num(v)) return null; return v < 3.3 ? 'low' : 'ok';
      case 'm_charger': if (!num(v)) return null; if (v < 1) return 'zero'; if (v < b.full - 1.5) return 'low'; if (v > b.full + 1.5) return 'high'; return 'ok';
      case 'm_phase_r': {
        if (!Array.isArray(v) || v.filter(x => x !== null).length < 3) return null;
        if (v.some(x => !num(x) || x > 5)) return 'open';
        const mn = Math.min(...v), mx = Math.max(...v);
        return (mx - mn > 0.15 && mx / Math.max(mn, 0.01) > 1.6) ? 'uneven' : 'equal';
      }
      case 'm_sag': {
        if (!Array.isArray(v) || !num(v[0]) || !num(v[1]) || v[0] <= 0) return null;
        const d = (v[0] - v[1]) / v[0] * 100;
        return d < 10 ? 'ok' : d < 20 ? 'high' : 'severe';
      }
      default: return null;
    }
  }
  function sagPct(v) { return Array.isArray(v) && v[0] > 0 && isFinite(v[1]) ? Math.round((v[0] - v[1]) / v[0] * 1000) / 10 : null; }

  return { causes, measurements, symptoms, measById, causeById, compOf, posterior, suggest, evidence, classify, sagPct, eig, measOK, has };
})();

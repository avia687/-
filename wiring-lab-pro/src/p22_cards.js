/* =====================================================================
   p22 · Cards – כרטיסיות חזרה מרווחת (Leitner)
   מקורות: מונחי המילון + שאלות הבוחנים באקדמיה. ״ידעתי״ מעלה קופסה (מרווח ארוך
   יותר), ״לא ידעתי״ מחזיר לקופסה 1. המצב נשמר ב-Persist('cards').
   ===================================================================== */
const Cards = (() => {
  const GAP = [0, 1, 2, 4, 8, 16, 32];          // ימים לפי קופסה
  const NEW_PER_DAY = 10;
  let deck = null, cur = null, shown = false, session = { right: 0, wrong: 0 };
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  function build() {
    const D = [];
    DATA.pro.glossary.forEach((g, i) => D.push({ id: 'g' + i, kind: 'מונח', front: g.t.join(' · '), back: g.beg }));
    try {
      const A = JSON.parse(document.getElementById('academy-data').textContent);
      A.modules.forEach(m => (m.quiz || []).forEach((q, k) => D.push({ id: `q-${m.id}-${k}`, kind: m.title, front: q.q, back: `${q.opts[q.a]}. ${q.why}` })));
    } catch (e) { /* בלי אקדמיה – רק מונחים */ }
    return D;
  }
  const state = () => Persist.get('cards');
  function queue() {
    if (!deck) deck = build();
    const st = state(), t = today();
    const due = deck.filter(c => st[c.id] && st[c.id].due <= t);
    const introduced = Object.values(st).filter(x => x.first === t).length;
    const fresh = deck.filter(c => !st[c.id]).slice(0, Math.max(0, NEW_PER_DAY - introduced));
    return due.concat(fresh);
  }
  function grade(ok) {
    if (!cur) return;
    const st = Object.assign({}, state()), t = today(), prev = st[cur.id] || { box: 0, first: t, seen: 0, right: 0 };
    const box = ok ? Math.min(GAP.length - 1, prev.box + 1) : 1;
    st[cur.id] = { box, due: addDays(t, GAP[box]), first: prev.first || t, seen: prev.seen + 1, right: prev.right + (ok ? 1 : 0) };
    Persist.set('cards', st);
    session[ok ? 'right' : 'wrong']++;
    cur = null; shown = false;
  }
  function stats() {
    const st = state(), boxes = [0, 0, 0, 0, 0, 0, 0];
    Object.values(st).forEach(x => { boxes[x.box] = (boxes[x.box] || 0) + 1; });
    return { total: (deck || build()).length, learned: Object.keys(st).length, boxes, mastered: boxes[5] + boxes[6] };
  }
  function html() {
    if (!deck) deck = build();
    const q = queue(), s = stats();
    if (!cur && q.length) cur = q[0];
    const box = cur && state()[cur.id] ? state()[cur.id].box : 0;
    return `<p class="lead">חזרה מרווחת: מה שאתה יודע חוזר בעוד ימים, מה שלא – מחר. כמה דקות ביום מספיקות.</p>
      <div class="kv-grid"><div class="kv"><span>לחזרה עכשיו</span><b>${q.length}</b></div><div class="kv"><span>נלמדו</span><b>${s.learned}/${s.total}</b></div><div class="kv"><span>שולטים</span><b>${s.mastered}</b></div><div class="kv"><span>בסשן</span><b>${session.right}/${session.right + session.wrong}</b></div></div>
      ${cur ? `<div class="card stack flash" aria-live="polite"><div class="spread"><span class="eyebrow">${esc(cur.kind)}</span><span class="foot num">קופסה ${box}</span></div>
        <p class="flash-front">${esc(cur.front)}</p>
        ${shown ? `<p class="flash-back">${esc(cur.back)}</p><div class="row"><button type="button" class="btn" data-action="fc-no">לא ידעתי</button><button type="button" class="btn primary" data-action="fc-yes">ידעתי</button></div>`
          : '<button type="button" class="btn primary" data-action="fc-show">הצג תשובה</button>'}</div>`
        : `<div class="card stack"><h3>סיימת להיום</h3><p class="lead">הכרטיסיות הבאות יחזרו לפי הלוח. ${s.learned < s.total ? 'מחר יתווספו עוד כרטיסיות חדשות.' : ''}</p></div>`}`;
  }
  const rerender = () => { if (State.mode === 'learn') UI.Modes().learn.render(); const f = $('.flash button'); if (f) f.focus(); };
  UI.on('fc-show', () => { shown = true; rerender(); });
  UI.on('fc-yes', () => { grade(true); rerender(); });
  UI.on('fc-no', () => { grade(false); rerender(); });
  return { html, bind() {}, queue: () => queue(), stats, reset() { deck = null; cur = null; shown = false; } };
})();

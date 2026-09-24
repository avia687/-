/* =====================================================================
   p10 · Academy – מסלול לימוד מ-0 עד מקצוען
   7 מודולים, שיעורים לפי רמה (מתחיל/מקצוען), בוחן לכל מודול ותעודת סיום.
   התוכן יושב ב-<script id="academy-data"> ומפוענח רק בפתיחה הראשונה (lazy).
   שיעורים מסוננים לפי vehicleComps() – omit מסתיר שיעורים לא רלוונטיים.
   ===================================================================== */
const Academy = (() => {
  let data = null, view = 'list', modId = null, lesId = null, answers = {}, submitted = false;
  function load() {
    if (data) return data;
    try { data = JSON.parse(document.getElementById('academy-data').textContent); }
    catch (e) { data = { passScore: 80, modules: [] }; }
    return data;
  }
  const prog = () => { const p = ProStore.get('acad', null); return p && typeof p === 'object' ? p : { read: {}, scores: {}, certs: {} }; };
  const saveProg = p => ProStore.set('acad', p);
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const mod = () => load().modules.find(m => m.id === modId);
  const lessonsOf = m => m.lessons.filter(l => !l.requires || l.requires.some(c => vehicleComps().includes(c)));
  function modStatus(m) {
    const p = prog(), ls = lessonsOf(m), read = ls.filter(l => p.read[m.id + '.' + l.id]).length;
    return { read, total: ls.length, score: p.scores[m.id], cert: p.certs[m.id] };
  }

  function listHTML() {
    const mods = load().modules, p = prog();
    const done = mods.filter(m => p.certs[m.id]).length;
    return `<div class="stack"><h3>אקדמיה: מאפס ועד מקצוען</h3>
      <p class="lead">7 שלבים, כל אחד עם שיעורים קצרים, מודל תלת-ממדי שמתעדכן, בוחן ותעודת סיום. התוכן מותאם לדגם <bdi>${esc(M().short)}</bdi> ולרמה שבחרתם (<b>${Level.isBeg() ? 'מתחיל' : 'מקצוען'}</b>).</p>
      <div class="progress" role="progressbar" aria-label="התקדמות באקדמיה" aria-valuemin="0" aria-valuemax="${mods.length}" aria-valuenow="${done}"><i style="width:${mods.length ? done / mods.length * 100 : 0}%"></i></div>
      <p class="foot num">${done} מתוך ${mods.length} תעודות</p></div>
      <div class="acad-mods">${mods.map((m, i) => { const s = modStatus(m); return `<button type="button" class="acad-mod ${s.cert ? 'done' : ''}" data-action="ac-mod" data-m="${m.id}">
        <span class="n" aria-hidden="true">${s.cert ? ICON.check : i + 1}</span><b>${esc(m.title)}</b><small>${esc(m.desc)}</small>
        <span class="st num">${s.read}/${s.total} שיעורים${s.score != null ? `<br>בוחן: ${s.score}%` : ''}</span></button>`; }).join('')}</div>`;
  }
  function modHTML() {
    const m = mod(), s = modStatus(m), p = prog();
    return `<button type="button" class="linkbtn" data-action="ac-list">${ICON.prev} כל המודולים</button>
      <div><p class="eyebrow">מודול ${load().modules.indexOf(m) + 1}</p><h2 id="acTitle" tabindex="-1">${esc(m.title)}</h2><p class="lead">${esc(m.desc)}</p></div>
      <div class="lesson-list">${lessonsOf(m).map((l, i) => `<button type="button" data-action="ac-les" data-l="${l.id}" class="${p.read[m.id + '.' + l.id] ? 'read' : ''}"><span class="num">${i + 1}.</span> ${esc(l.title)}${l.sim ? ' · סימולטור' : ''}</button>`).join('')}</div>
      <div class="card stack"><h3>בוחן המודול</h3><p class="lead" style="font-size:14px">${m.quiz.length} שאלות. ציון עובר: ${load().passScore}%. ${s.score != null ? `הציון האחרון: <b>${s.score}%</b>.` : ''}</p>
        <div class="row"><button type="button" class="btn primary" data-action="ac-quiz">${s.score != null ? 'לבוחן שוב' : 'לבוחן'}</button>${s.cert ? '<button type="button" class="btn" data-action="ac-cert">התעודה שלי</button>' : ''}</div></div>`;
  }
  function lessonHTML() {
    const m = mod(), ls = lessonsOf(m), i = ls.findIndex(l => l.id === lesId), l = ls[i];
    if (!l) { view = 'module'; return modHTML(); }
    const beg = Level.isBeg();
    return `<button type="button" class="linkbtn" data-action="ac-mod" data-m="${m.id}">${ICON.prev} ${esc(m.title)}</button>
      <div class="progress" role="progressbar" aria-label="התקדמות במודול" aria-valuemin="1" aria-valuemax="${ls.length}" aria-valuenow="${i + 1}"><i style="width:${(i + 1) / ls.length * 100}%"></i></div>
      <div><p class="eyebrow">שיעור ${i + 1} מתוך ${ls.length} · ${beg ? 'מתחיל' : 'מקצוען'}</p><h2 id="acTitle" tabindex="-1">${esc(l.title)}</h2></div>
      <div class="card lesson-body"><p>${md(beg ? l.beg : l.pro)}</p>
        ${beg ? `<details class="concept"><summary>הגרסה המקצועית</summary><div class="body"><p>${md(l.pro)}</p></div></details>` : `<details class="concept"><summary>הסבר פשוט</summary><div class="body"><p>${md(l.beg)}</p></div></details>`}
        ${l.focus && l.focus.comp && vehicleComps().includes(l.focus.comp) ? `<button type="button" class="btn sm ghost" data-action="ac-3d">הצג במודל: ${esc(compName(l.focus.comp))}</button>` : ''}</div>
      ${l.sim ? MeterSim.html() : ''}
      ${m.id === 'm3' ? `<div class="note danger">${ICON.warn}<span>${esc(DATA.meta.batteryNote)}</span></div>` : ''}
      <div class="navrow">
        <button type="button" class="btn" data-action="ac-les" data-l="${ls[i - 1] ? ls[i - 1].id : ''}" ${i === 0 ? 'disabled' : ''}>${ICON.prev} הקודם</button>
        ${i < ls.length - 1 ? `<button type="button" class="btn primary" data-action="ac-les" data-l="${ls[i + 1].id}">הבא ${ICON.next}</button>` : `<button type="button" class="btn primary" data-action="ac-quiz">לבוחן ${ICON.next}</button>`}
      </div>`;
  }
  function quizHTML() {
    const m = mod(), pass = load().passScore;
    const score = submitted ? Math.round(m.quiz.filter((q, i) => answers[i] === q.a).length / m.quiz.length * 100) : null;
    return `<button type="button" class="linkbtn" data-action="ac-mod" data-m="${m.id}">${ICON.prev} ${esc(m.title)}</button>
      <div><p class="eyebrow">בוחן</p><h2 id="acTitle" tabindex="-1">${esc(m.title)}</h2></div>
      ${m.quiz.map((q, i) => `<fieldset class="card quiz-q" style="margin:0"><legend class="sr-only">שאלה ${i + 1}</legend>
        <b>${i + 1}. ${T(q.q)}</b>
        ${q.opts.map((o, j) => { let cls = ''; if (submitted) { if (j === q.a) cls = 'right'; else if (answers[i] === j) cls = 'wrong'; }
          return `<button type="button" class="quiz-opt ${cls}" data-action="ac-opt" data-q="${i}" data-o="${j}" aria-pressed="${answers[i] === j}" ${submitted ? 'disabled' : ''}>${T(o)}</button>`; }).join('')}
        ${submitted ? `<p class="${answers[i] === q.a ? 'verify' : 'mistake'}">${answers[i] === q.a ? MK.ok + 'נכון. ' : '<span class="mk bad">' + ICON.cross + '</span>'}${T(q.why)}</p>` : ''}
      </fieldset>`).join('')}
      ${submitted
        ? `<div class="note ${score >= pass ? 'ok' : 'warn'}">${score >= pass ? ICON.ok : ICON.warn}<span><b>ציון: ${score}%</b> ${score >= pass ? '– עברתם! התעודה מחכה.' : `– צריך ${pass}% כדי לעבור. חזרו לשיעורים ונסו שוב.`}</span></div>
           <div class="navrow">${score >= pass ? '<button type="button" class="btn primary" data-action="ac-cert">לתעודה</button>' : '<button type="button" class="btn primary" data-action="ac-quiz">ניסיון נוסף</button>'}<button type="button" class="btn" data-action="ac-list">כל המודולים</button></div>`
        : `<button type="button" class="btn primary block" data-action="ac-submit" ${Object.keys(answers).length < m.quiz.length ? 'disabled' : ''}>הגשה</button>`}`;
  }
  function certHTML() {
    const m = mod(), c = prog().certs[m.id];
    if (!c) { view = 'module'; return modHTML(); }
    const name = ProStore.get('certName', '');
    return `<button type="button" class="linkbtn" data-action="ac-mod" data-m="${m.id}">${ICON.prev} ${esc(m.title)}</button>
      <div class="field"><label for="certName">השם על התעודה</label><input class="input" id="certName" maxlength="60" value="${esc(name)}" autocomplete="name"></div>
      <div class="print-area"><div class="cert" id="certCard">
        <div class="seal" aria-hidden="true">${ICON.bolt}</div>
        <p class="eyebrow" style="justify-content:center">מעבדת החיווט · אקדמיה</p>
        <h3>תעודת סיום</h3>
        <p>מאשרת ש-</p><p class="who" id="certWho">${esc(name || 'שם המסיים/ת')}</p>
        <p>סיים/ה בהצלחה את המודול <b>${esc(m.title)}</b></p>
        <p class="num">ציון: ${c.score}% · תאריך: ${esc(c.date)}</p>
        <p class="foot">${esc(DATA.meta.disclaimer)}</p>
      </div></div>
      <div class="row">${IN_FRAME ? '' : '<button type="button" class="btn primary" data-action="ac-print">הדפסה / שמירה כ-PDF</button>'}<button type="button" class="btn" data-action="ac-copycert">העתקת טקסט התעודה</button><button type="button" class="btn ghost" data-action="ac-list">כל המודולים</button></div>
      ${IN_FRAME ? '<p class="foot">הדפסה זמינה כשפותחים את הקובץ index.html ישירות בדפדפן.</p>' : ''}
      <textarea class="input copybox" id="acCopyBox" hidden rows="4" aria-label="טקסט להעתקה" readonly></textarea>`;
  }
  function html() {
    load();
    if (view !== 'lesson') MeterSim.detach();
    if (view === 'module' && mod()) return modHTML();
    if (view === 'lesson' && mod()) return lessonHTML();
    if (view === 'quiz' && mod()) return quizHTML();
    if (view === 'cert' && mod()) return certHTML();
    view = 'list'; return listHTML();
  }
  function bind() {
    if (view === 'lesson') {
      const m = mod(), l = m && lessonsOf(m).find(x => x.id === lesId);
      if (l) { const p = prog(); p.read[m.id + '.' + l.id] = true; saveProg(p); if (l.sim) MeterSim.bind(); else MeterSim.detach(); }
    }
    const n = $('#certName');
    if (n) n.addEventListener('input', () => { ProStore.set('certName', n.value); const w = $('#certWho'); if (w) w.textContent = n.value || 'שם המסיים/ת'; });
    const t = $('#acTitle'); if (t && !UI.isMobile()) t.focus({ preventScroll: true });
  }
  function highlight(focus) {
    const m = mod(), l = view === 'lesson' && m ? lessonsOf(m).find(x => x.id === lesId) : null;
    if (l && l.focus && vehicleComps().includes(l.focus.comp)) {
      Scene.select(l.focus.comp === 'frame' ? null : l.focus.comp, focus && l.focus.comp !== 'frame');
      Scene.highlightBundle(l.focus.bundle && (l.focus.bundle === 'all' || bundleById(l.focus.bundle)) ? l.focus.bundle : null);
    } else if (!(view === 'lesson' && MeterSim.active())) { Scene.select(null); Scene.highlightBundle(null); }
  }
  function go(v) { view = v; Learn.render(); $('#panelScroll').scrollTop = 0; }

  UI.on('ac-list', () => go('list'));
  UI.on('ac-mod', el => { modId = el.dataset.m; go('module'); });
  UI.on('ac-les', el => { if (!el.dataset.l) return; lesId = el.dataset.l; go('lesson'); UI.openSheet('half'); });
  UI.on('ac-3d', () => highlight(true));
  UI.on('ac-quiz', () => { answers = {}; submitted = false; go('quiz'); });
  UI.on('ac-opt', el => {
    answers[Number(el.dataset.q)] = Number(el.dataset.o);
    $$(`[data-action="ac-opt"][data-q="${el.dataset.q}"]`).forEach(b => b.setAttribute('aria-pressed', String(b === el)));
    const sb = $('[data-action="ac-submit"]'); if (sb) sb.disabled = Object.keys(answers).length < mod().quiz.length;
  });
  UI.on('ac-submit', () => {
    const m = mod(); submitted = true;
    const score = Math.round(m.quiz.filter((q, i) => answers[i] === q.a).length / m.quiz.length * 100);
    const p = prog(); p.scores[m.id] = score;
    if (score >= load().passScore) p.certs[m.id] = { score, date: new Date().toLocaleDateString('he-IL') };
    saveProg(p); go('quiz');
  });
  UI.on('ac-cert', () => go('cert'));
  UI.on('ac-print', () => {
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { done(); }
    setTimeout(done, 3000);
  });
  UI.on('ac-copycert', () => {
    const m = mod(), c = prog().certs[m.id];
    copyText(`מעבדת החיווט · אקדמיה\nתעודת סיום\n${ProStore.get('certName', '')}\nסיים/ה בהצלחה את המודול: ${m.title}\nציון: ${c.score}% · תאריך: ${c.date}`, $('#acCopyBox'));
  });
  return { html, bind, highlight };
})();

/* =====================================================================
   p15 · DataUI – גיבוי, שחזור, נעילת PIN, מחוון שמירה, תזכורת גיבוי
   (לשונית כלים ← ״גיבוי ופרטיות״). כל טקסט של משתמש: esc() או textContent.
   ===================================================================== */
const DataUI = (() => {
  let pending = null;          // { data, notes, rows } – גיבוי שנקרא וממתין לאישור
  let lastBackupText = '', pwNeeded = false;
  const fmtTime = t => (t ? new Date(t).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'אף פעם');
  const days = t => (t ? Math.floor((Date.now() - t) / 864e5) : null);
  const BACKEND = { idb: 'IndexedDB – במכשיר הזה בלבד', ls: 'localStorage (IndexedDB לא זמין) – במכשיר הזה בלבד', mem: 'זיכרון זמני בלבד – ייעלם בסגירת הדף' };

  /* ---------- מחוון ״נשמר״ ---------- */
  function initIndicator() {
    const el = $('#saveState'); if (!el) return;
    const upd = s => {
      el.dataset.state = s.locked ? 'locked' : s.state;
      el.textContent = s.locked ? 'נעול' : s.state === 'saving' ? 'שומר…' : s.state === 'error' ? 'לא נשמר' : s.lastSaved ? 'נשמר' : (s.backend === 'mem' ? 'לא נשמר' : 'שמור מקומית');
      el.title = s.locked ? 'הנתונים האישיים מוצפנים. הזינו PIN בלשונית גיבוי ופרטיות.' : s.state === 'error' || s.backend === 'mem' ? 'האחסון המקומי לא זמין – צרו גיבוי כדי לא לאבד נתונים' : 'נשמר במכשיר ' + (s.lastSaved ? fmtTime(s.lastSaved) : '');
    };
    Persist.onChange(upd); upd(Persist.status());
  }

  /* ---------- הודעות עליונות (נעילה, תזכורת גיבוי) ---------- */
  function notice(id, text, actions) {
    const box = $('#notices'); if (!box) return;
    let n = document.getElementById(id);
    if (!n) { n = document.createElement('div'); n.id = id; n.className = 'notice'; box.appendChild(n); }
    n.textContent = '';
    const t = document.createElement('span'); t.className = 'grow'; t.textContent = text; n.appendChild(t);
    actions.forEach(([label, fn, cls]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ' + (cls || ''); b.textContent = label; b.addEventListener('click', fn); n.appendChild(b); });
  }
  const dropNotice = id => { const n = document.getElementById(id); if (n) n.remove(); };
  function refreshNotices() {
    if (Persist.isLocked()) notice('nt-lock', 'היומן והנתונים האישיים נעולים.', [['פתיחה עם PIN', () => Tools.go('data')]]);
    else dropNotice('nt-lock');
    const snooze = Number(ProStore.get('backupSnooze', 0));
    if (Persist.needsBackup() && Date.now() > snooze) {
      const d = days(Persist.status().lastBackup);
      notice('nt-backup', d === null ? 'עוד לא גיביתם את הנתונים. הם שמורים רק במכשיר הזה.' : `עברו ${d} ימים מהגיבוי האחרון.`, [['גבה עכשיו', () => Tools.go('data'), 'primary'], ['בעוד 3 ימים', () => { ProStore.set('backupSnooze', Date.now() + 3 * 864e5); dropNotice('nt-backup'); }, 'ghost']]);
    } else dropNotice('nt-backup');
  }

  /* ---------- לשונית ---------- */
  function lockCard() {
    if (!Vault.ok()) return `<div class="card stack"><h3>נעילת PIN</h3><p class="lead">הדפדפן לא תומך בהצפנה (Web Crypto). פתחו את האפליקציה בכתובת https.</p></div>`;
    if (Persist.isLocked()) return `<div class="card stack lock-card"><h3>פתחו את הנתונים</h3>
      <p class="lead">היומן, כרטיסי הכלים והפרויקטים מוצפנים במכשיר. הזינו את ה-PIN.</p>
      <form class="row" id="unlockForm" autocomplete="off"><label class="sr-only" for="pinIn">PIN</label><input class="input num pin" id="pinIn" type="password" inputmode="numeric" maxlength="12" autocomplete="off" required>
      <button type="submit" class="btn primary">פתח</button></form><p class="field-err" id="pinErr" role="alert" hidden></p>
      <p class="foot">שכחתם את ה-PIN? אין דרך לשחזר אותו – אפשר רק לשחזר מגיבוי או למחוק את כל הנתונים (למטה).</p></div>`;
    if (Persist.lockOn()) return `<div class="card stack"><h3>נעילת PIN פעילה</h3>
      <p class="lead">הנתונים האישיים מוצפנים (AES-GCM-256, PBKDF2 ${Vault.ITER.toLocaleString('he-IL')} איטרציות). נעילה אוטומטית אחרי 15 דקות בלי פעילות.</p>
      <div class="row"><button type="button" class="btn" data-action="dt-lock">נעל עכשיו</button></div>
      <form class="row" id="unlockOff" autocomplete="off"><label class="field grow"><span class="lbl">ביטול הנעילה – הזינו PIN</span><input class="input num pin" id="pinOff" type="password" inputmode="numeric" maxlength="12" required></label><button type="submit" class="btn ghost">בטל נעילה</button></form>
      <p class="field-err" id="pinErr" role="alert" hidden></p></div>`;
    return `<div class="card stack"><h3>נעילת PIN ליומן (לא חובה)</h3>
      <p class="lead">מצפין את היומן, כרטיסי הכלים, הפרויקטים והתמונות במכשיר. מומלץ אם יש במכשיר פרטי לקוחות.</p>
      <form class="tool-grid" id="lockForm" autocomplete="off">
        <label class="field"><span class="lbl">PIN (4–12 ספרות)</span><input class="input num pin" id="pinNew" type="password" inputmode="numeric" maxlength="12" required></label>
        <label class="field"><span class="lbl">שוב, לאימות</span><input class="input num pin" id="pinNew2" type="password" inputmode="numeric" maxlength="12" required></label>
        <button type="submit" class="btn primary">הפעל נעילה</button>
      </form><p class="field-err" id="pinErr" role="alert" hidden></p>
      <p class="foot">ה-PIN לא נשמר בשום מקום. שכחתם אותו – הנתונים המוצפנים אבודים. גבו לפני.</p></div>`;
  }
  function html() {
    const s = Persist.status(), locked = s.locked;
    return `<p class="lead">הכול נשמר רק במכשיר הזה. אין שרת, אין חשבון ואין שליחה החוצה.</p>
      <div class="card stack"><h3>מצב האחסון</h3>
        <dl class="specs"><dt>איפה</dt><dd>${esc(BACKEND[s.backend])}</dd><dt>נשמר לאחרונה</dt><dd class="num">${esc(fmtTime(s.lastSaved))}</dd>
        <dt>גיבוי אחרון</dt><dd class="num">${esc(fmtTime(s.lastBackup))}${s.lastBackup && days(s.lastBackup) >= 14 ? ' – הגיע הזמן לגבות' : ''}</dd><dt>נפח בשימוש</dt><dd class="num" id="dtUsage">—</dd></dl>
        ${s.backend !== 'idb' ? `<div class="note warn">${ICON.warn}<span>${s.backend === 'mem' ? 'הדפדפן חוסם אחסון (למשל מצב גלישה פרטית). צרו גיבוי לפני סגירת הדף.' : 'IndexedDB לא זמין – תמונות לא יישמרו אחרי סגירה.'}</span></div>` : ''}
        <div class="row"><button type="button" class="btn sm ghost" data-action="dt-persist">בקש מהדפדפן לא למחוק את הנתונים</button>${typeof Perf !== 'undefined' ? Perf.installHTML() : ''}</div></div>
      ${lockCard()}
      <div class="card stack"><h3>גיבוי</h3>
        <p class="lead">קובץ JSON אחד עם כל הנתונים, גרסת סכמה ובדיקת שלמות (SHA-256).</p>
        <form class="tool-grid" id="bkForm" autocomplete="off">
          <label class="field"><span class="lbl">סיסמה להצפנת הקובץ (לא חובה)</span><input class="input" id="bkPw" type="password" maxlength="128" autocomplete="new-password"></label>
          <label class="field"><span class="lbl">הסיסמה שוב</span><input class="input" id="bkPw2" type="password" maxlength="128" autocomplete="new-password"></label>
          <button type="submit" class="btn primary" ${locked ? 'disabled' : ''}>צור גיבוי</button>
        </form>
        <p class="field-err" id="bkErr" role="alert" hidden></p>
        <div class="row" id="bkOut" hidden><button type="button" class="btn sm" data-action="dt-save">שמור קובץ</button><button type="button" class="btn sm" data-action="dt-share" hidden>שתף</button><button type="button" class="btn sm ghost" data-action="dt-copy">העתק</button></div>
        <textarea class="input copybox" id="bkBox" hidden rows="5" readonly aria-label="גיבוי להעתקה"></textarea></div>
      <div class="card stack"><h3>שחזור מגיבוי</h3>
        <div class="field"><label for="rsFile">קובץ גיבוי</label><input class="input" id="rsFile" type="file" accept="application/json,.json"></div>
        <div class="field"><label for="rsPaste">או הדביקו את התוכן</label><textarea class="input copybox" id="rsPaste" rows="3" maxlength="26214400"></textarea></div>
        <div class="field" id="rsPwRow" ${pwNeeded ? '' : 'hidden'}><label for="rsPw">סיסמת הגיבוי</label><input class="input" id="rsPw" type="password" maxlength="128" autocomplete="off"></div>
        <button type="button" class="btn" data-action="dt-read" ${locked ? 'disabled' : ''}>בדוק את הקובץ</button>
        <pre class="import-err" id="rsErr" hidden role="alert"></pre>
        <div id="rsPreview"></div></div>
      ${typeof Privacy !== 'undefined' ? Privacy.html() : ''}`;
  }
  function previewHTML(p) {
    return `<div class="stack preview">
      ${p.notes.length ? `<div class="note info">${ICON.info}<span>${p.notes.map(esc).join('<br>')}</span></div>` : ''}
      <table class="volt"><thead><tr><th scope="col">מה</th><th scope="col">חדש</th><th scope="col">שונה</th><th scope="col">זהה</th><th scope="col">יימחק בהחלפה</th></tr></thead>
      <tbody>${p.rows.map(r => `<tr><th scope="row">${esc(r.name)}</th><td class="num">${r.add}</td><td class="num">${r.chg}</td><td class="num">${r.same}</td><td class="num">${r.gone}</td></tr>`).join('')}</tbody></table>
      <fieldset class="stack plain"><legend class="lbl">איך לשחזר</legend>
        <label class="check"><input type="radio" name="rsMode" value="merge" checked><span><b>מיזוג</b> – מוסיף חדשים, מעדכן רשומות שהגיבוי חדש יותר בהן</span></label>
        <label class="check"><input type="radio" name="rsMode" value="replace"><span><b>החלפה</b> – מוחק את מה שיש במכשיר ושם את הגיבוי במקומו</span></label></fieldset>
      <label class="check" id="rsAckRow" hidden><input type="checkbox" id="rsAck"><span>הבנתי שנתונים שלא בגיבוי יימחקו מהמכשיר</span></label>
      <div class="row"><button type="button" class="btn primary" data-action="dt-apply">שחזר</button><button type="button" class="btn ghost" data-action="dt-cancel">ביטול</button></div></div>`;
  }
  const err = (id, msg) => { const e = $('#' + id); if (e) { e.hidden = !msg; e.textContent = msg || ''; } };
  function bind() {
    Persist.estimate().then(e => { const u = $('#dtUsage'); if (u && e) u.textContent = `${(e.usage / 1048576).toFixed(1)}MB מתוך ${(e.quota / 1048576 / 1024).toFixed(1)}GB`; });
    const lf = $('#lockForm');
    if (lf) lf.addEventListener('submit', async e => {
      e.preventDefault();
      const a = $('#pinNew').value, b = $('#pinNew2').value;
      if (!Persist.PIN_RE.test(a)) { err('pinErr', 'PIN של 4 עד 12 ספרות'); return; }
      if (a !== b) { err('pinErr', 'שני ה-PIN לא זהים'); return; }
      try { await Persist.enableLock(a); UI.toast('הנעילה פעילה – הנתונים מוצפנים'); rerender(); } catch (x) { err('pinErr', 'לא הצלחנו להפעיל נעילה: ' + x.message); }
    });
    const uf = $('#unlockForm');
    if (uf) uf.addEventListener('submit', async e => {
      e.preventDefault();
      try { await Persist.unlock($('#pinIn').value); UI.toast('נפתח'); refreshNotices(); rerender(); }
      catch (x) { err('pinErr', 'PIN שגוי'); $('#pinIn').value = ''; $('#pinIn').focus(); }
    });
    const of = $('#unlockOff');
    if (of) of.addEventListener('submit', async e => {
      e.preventDefault();
      try { await Persist.disableLock($('#pinOff').value); UI.toast('הנעילה בוטלה – הנתונים לא מוצפנים'); rerender(); }
      catch (x) { err('pinErr', 'PIN שגוי'); }
    });
    $('#bkForm').addEventListener('submit', async e => {
      e.preventDefault();
      const a = $('#bkPw').value, b = $('#bkPw2').value;
      if (a !== b) { err('bkErr', 'שתי הסיסמאות לא זהות'); return; }
      if (a && a.length < 8) { err('bkErr', 'סיסמה של 8 תווים לפחות'); return; }
      err('bkErr', '');
      try {
        lastBackupText = await Persist.backup(a || null);
        $('#bkOut').hidden = false;
        const sh = $('[data-action="dt-share"]'); if (sh) sh.hidden = !canShare();
        UI.toast(a ? 'נוצר גיבוי מוצפן' : 'נוצר גיבוי');
      } catch (x) { err('bkErr', x.message === 'locked' ? 'פתחו את הנעילה קודם' : 'יצירת הגיבוי נכשלה'); }
    });
    const rf = $('#rsFile');
    rf.addEventListener('change', () => {
      const f = rf.files && rf.files[0]; if (!f) return;
      if (f.size > 25 * 1048576) { err('rsErr', 'הקובץ גדול מ-25MB'); rf.value = ''; return; }
      const rd = new FileReader(); rd.onload = () => { $('#rsPaste').value = String(rd.result || ''); readNow(); }; rd.readAsText(f);
    });
    $$('input[name="rsMode"]').forEach(r => r.addEventListener('change', () => { const x = $('#rsAckRow'); if (x) x.hidden = r.value !== 'replace' || !r.checked; }));
    if (typeof Privacy !== 'undefined') Privacy.bind();
  }
  const fileName = () => `ev-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const canShare = () => { try { return !IN_FRAME && !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] })); } catch (e) { return false; } };
  async function readNow() {
    err('rsErr', ''); $('#rsPreview').innerHTML = '';
    try {
      const r = await Persist.readBackup($('#rsPaste').value, ($('#rsPw') || {}).value || '');
      pending = { data: r.data, notes: r.notes, rows: Persist.preview(r.data) };
      $('#rsPreview').innerHTML = previewHTML(pending);
      $$('input[name="rsMode"]').forEach(x => x.addEventListener('change', () => { $('#rsAckRow').hidden = $('input[name="rsMode"]:checked').value !== 'replace'; }));
    } catch (x) {
      if (x.needPassword) { pwNeeded = true; $('#rsPwRow').hidden = false; $('#rsPw').focus(); }
      err('rsErr', x instanceof Sec.ImportError ? x.message : 'קריאת הקובץ נכשלה');
    }
  }
  function rerender() { if (State.mode === 'tools') UI.Modes().tools.render(); refreshNotices(); }
  UI.on('dt-read', readNow);
  UI.on('dt-cancel', () => { pending = null; $('#rsPreview').innerHTML = ''; });
  UI.on('dt-apply', async () => {
    if (!pending) return;
    const mode = ($('input[name="rsMode"]:checked') || {}).value || 'merge';
    if (mode === 'replace' && !$('#rsAck').checked) { UI.toast('סמנו שהבנתם שנתונים יימחקו'); $('#rsAck').focus(); return; }
    const ok = await Persist.apply(pending.data, mode);
    pending = null; pwNeeded = false;
    UI.toast(ok ? (mode === 'replace' ? 'שוחזר (הוחלף)' : 'שוחזר (מוזג)') : 'השחזור לא נשמר – האחסון לא זמין');
    Level.apply(); rerender();
  });
  UI.on('dt-save', () => { offerFile(fileName(), lastBackupText, $('#bkBox')); Persist.markBackedUp(); refreshNotices(); });
  UI.on('dt-copy', () => { copyText(lastBackupText, $('#bkBox')); Persist.markBackedUp(); refreshNotices(); });
  UI.on('dt-share', async () => {
    try { await navigator.share({ files: [new File([lastBackupText], fileName(), { type: 'application/json' })], title: 'גיבוי מעבדת EV' }); Persist.markBackedUp(); refreshNotices(); }
    catch (e) { if (e && e.name !== 'AbortError') UI.toast('השיתוף נכשל – שמרו כקובץ'); }
  });
  UI.on('dt-lock', () => { Persist.lockNow(); UI.toast('ננעל'); rerender(); });
  UI.on('dt-persist', async () => { UI.toast(await Persist.persistRequest() ? 'הדפדפן לא ימחק את הנתונים אוטומטית' : 'הדפדפן לא אישר – גבו באופן קבוע'); });

  /** כרטיס לתצוגות שתלויות בנתונים נעולים */
  const lockedCard = what => `<div class="card stack"><h3>${esc(what)} נעול</h3><p class="lead">הנתונים מוצפנים במכשיר. פתחו עם PIN כדי לצפות ולשמור.</p><button type="button" class="btn primary" data-action="tl-sub" data-sub="data">פתיחה עם PIN</button></div>`;
  function init() {
    initIndicator(); refreshNotices();
    let last = '';
    Persist.onChange(s => { const k = s.locked + ':' + s.lastBackup; if (k !== last) { last = k; refreshNotices(); } });
  }
  return { html, bind, init, lockedCard, refreshNotices, notice, dropNotice };
})();

/* =====================================================================
   p20 · Workshop – ידיים עסוקות: הקראה, פקודה קולית ״הבא״, תמונות לתיקון
   · הקראה: Web Speech (speechSynthesis) – קול עברי מותקן במכשיר אם יש.
   · פקודות קוליות (לא חובה, כבוי כברירת מחדל): ״הבא״, ״הקודם״, ״שוב״, ״עצור״.
     בחלק מהדפדפנים הזיהוי נעשה בשרת של ספק הדפדפן – מוצג גילוי נאות לפני הפעלה.
   · תמונות: נדחסות במכשיר (עד 1280px, JPEG), הקידוד מחדש מסיר EXIF/GPS,
     נשמרות ב-IndexedDB (מוצפנות כשיש PIN).
   ===================================================================== */
const Voice = (() => {
  const synth = window.speechSynthesis || null;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let rec = null, listening = false;
  const canSpeak = () => !!synth, canListen = () => !!Rec;
  function voice() {
    if (!synth) return null;
    const vs = synth.getVoices().filter(v => /^he|^iw/i.test(v.lang));
    return vs.find(v => v.localService) || vs[0] || null;
  }
  /** הטקסט של השלב הנוכחי בפאנל */
  function currentText() {
    const mv = $('#modeView'); if (!mv) return '';
    const title = (mv.querySelector('h2') || {}).textContent || '';
    const step = mv.querySelector('#bgBox') ? mv.querySelector('#bgBox').closest('.card') : mv.querySelector('.verify-box') ? mv.querySelector('.verify-box').closest('.card, .stack') : mv.querySelector('.card');
    const clean = el => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('input, select, button, .sr-only, .vres, svg').forEach(x => x.remove()); return c.textContent; };
    return (title + '. ' + clean(step)).replace(/\s+/g, ' ').trim().slice(0, 700);
  }
  function speak(text) {
    if (!synth) { UI.toast('הדפדפן לא תומך בהקראה'); return false; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text || currentText());
    u.lang = 'he-IL'; const v = voice(); if (v) u.voice = v; u.rate = 0.95;
    synth.speak(u); return true;
  }
  const stop = () => { if (synth) synth.cancel(); };
  function next() {
    const b = $('#bgNext:not([disabled])') || $('#modeView .navrow .btn.primary:not([disabled])') || $('.sticky-actions .btn.primary:not([disabled])');
    if (b) { b.click(); setTimeout(() => speak(), 250); return true; }
    speak('השלב לא אומת עדיין. מדוד והזן את הקריאה.'); return false;
  }
  function prev() { const b = $('#modeView .navrow .btn:not(.primary):not([disabled])'); if (b) { b.click(); setTimeout(() => speak(), 250); } }
  /** פקודה מזוהה → פעולה. מחזיר את שם הפעולה */
  function command(text) {
    const t = Search.norm(text);
    if (/(^| )(הבא|הלאה|קדימה|next)( |$)/.test(t)) { next(); return 'next'; }
    if (/(^| )(הקודם|אחורה|back)( |$)/.test(t)) { prev(); return 'prev'; }
    if (/(^| )(שוב|חזור|תקריא|הקרא|קרא)( |$)/.test(t)) { speak(); return 'repeat'; }
    if (/(^| )(עצור|שקט|stop)( |$)/.test(t)) { stop(); return 'stop'; }
    return '';
  }
  function startListening() {
    if (!Rec) { UI.toast('הדפדפן לא תומך בזיהוי דיבור'); return; }
    if (listening) return;
    rec = new Rec(); rec.lang = 'he-IL'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = e => { const r = e.results[e.results.length - 1]; if (r && r.isFinal) { const a = command(r[0].transcript); if (a) UI.toast('פקודה: ' + r[0].transcript.trim()); } };
    rec.onend = () => { if (listening) { try { rec.start(); } catch (x) { listening = false; sync(); } } };
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { listening = false; sync(); UI.toast('אין הרשאה למיקרופון'); } };
    try { rec.start(); listening = true; } catch (x) { listening = false; }
    sync();
  }
  function stopListening() { listening = false; if (rec) { try { rec.stop(); } catch (x) { /* */ } } sync(); }
  /** הפעלה עם גילוי נאות על פרטיות */
  async function toggleListening() {
    if (listening) { stopListening(); return; }
    if (!ProStore.get('voiceAck', false)) {
      const body = document.createElement('div'); body.className = 'stack';
      body.innerHTML = `<p class="lead">פקודות קוליות: אמור ״הבא״, ״הקודם״, ״שוב״ או ״עצור״.</p>
        <div class="note warn">${ICON.warn}<span><b>פרטיות:</b> בחלק מהדפדפנים (למשל Chrome) זיהוי הדיבור מתבצע בשרת של ספק הדפדפן – הקול נשלח אליו. המעבדה עצמה לא שומרת ולא שולחת הקלטות. אפשר לעבוד בלי פקודות קוליות: כפתור ״הבא״ הגדול עושה אותו דבר.</span></div>`;
      const foot = document.createElement('div'); foot.className = 'row';
      const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn primary'; ok.textContent = 'הפעל מיקרופון';
      const no = document.createElement('button'); no.type = 'button'; no.className = 'btn ghost'; no.textContent = 'ביטול';
      foot.append(ok, no);
      const res = await new Promise(r => { ok.addEventListener('click', () => r(true)); no.addEventListener('click', () => r(false)); Legal.open('פקודות קוליות', body, foot, false); });
      Legal.close();
      if (!res) return;
      ProStore.set('voiceAck', true);
    }
    startListening();
  }
  function sync() {
    const m = $('#vbMic'); if (m) { m.setAttribute('aria-pressed', String(listening)); m.textContent = listening ? 'מקשיב…' : 'פקודה קולית'; m.hidden = !Rec; }
    const bar = $('#voiceBar'); if (bar) bar.hidden = !Level.workshop();
  }
  function barInit() {
    const bar = document.createElement('div'); bar.className = 'voice-bar'; bar.id = 'voiceBar'; bar.hidden = true;
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'סרגל ידיים עסוקות');
    bar.innerHTML = '<button type="button" class="btn" id="vbRead">הקרא</button><button type="button" class="btn" id="vbMic" aria-pressed="false">פקודה קולית</button><button type="button" class="btn primary" id="vbNext">הבא</button>';
    $('#app').appendChild(bar);
    $('#vbRead').addEventListener('click', () => speak());
    $('#vbNext').addEventListener('click', next);
    $('#vbMic').addEventListener('click', toggleListening);
    if (!synth) $('#vbRead').hidden = true;
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
  return { speak, stop, next, prev, command, currentText, toggleListening, stopListening, canSpeak, canListen, listening: () => listening, barInit, sync };
})();

const Photos = (() => {
  const MAX_SIDE = 1280, QUALITY = 0.72, MAX_PER = 12;
  const urls = new Map();
  /** דחיסה וקידוד מחדש (מסיר EXIF, כולל מיקום) */
  async function compress(file) {
    if (!/^image\//.test(file.type)) throw new Error('not-image');
    if (file.size > 25 * 1048576) throw new Error('too-big');
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await new Promise((res, rej) => { const i = new Image(); const u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = rej; i.src = u; }); }
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', QUALITY));
  }
  async function add(files) {
    const ids = [];
    for (const f of [...files].slice(0, MAX_PER)) {
      try { const b = await compress(f); const id = 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await Persist.putBlob(id, b); ids.push(id); }
      catch (e) { UI.toast(e.message === 'too-big' ? 'תמונה גדולה מ-25MB' : e.message === 'locked' ? 'פתח את הנעילה כדי להוסיף תמונות' : 'לא הצלחנו לקרוא את התמונה'); }
    }
    return ids;
  }
  async function url(id) {
    if (urls.has(id)) return urls.get(id);
    const b = await Persist.getBlob(id); if (!b) return null;
    const u = URL.createObjectURL(b); urls.set(id, u); return u;
  }
  async function fill(root) {
    for (const img of $$('img[data-photo]', root)) { const u = await url(img.dataset.photo); if (u) img.src = u; else img.alt = 'התמונה לא זמינה'; }
  }
  const remove = ids => (ids || []).forEach(id => { Persist.delBlob(id).catch(() => {}); const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } });
  const thumbs = (ids, removable) => (ids || []).filter(Sec.isId).map(id => `<figure class="thumb"><img data-photo="${esc(id)}" alt="תמונה מהתיקון" width="96" height="72">${removable ? `<button type="button" class="btn sm ghost" data-action="ph-del" data-id="${esc(id)}" aria-label="הסר תמונה">הסר</button>` : ''}</figure>`).join('');
  return { compress, add, url, fill, remove, thumbs, MAX_PER };
})();

(window.BootHooks = window.BootHooks || []).push(() => { Voice.barInit(); if (Voice.canSpeak()) window.speechSynthesis.getVoices(); });

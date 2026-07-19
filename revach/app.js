/* ============================================================
   רווח (Revach) — track your work & earnings, get insights,
   and save toward goals. 100% client-side, data in localStorage.
   ============================================================ */

'use strict';

/* -------------------- Storage -------------------- */
const KEY = {
  jobs: 'revach_jobs_v1',
  goals: 'revach_goals_v1',
  settings: 'revach_settings_v1',
};

const store = {
  load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage may be blocked */ } },
};

let jobs = store.load(KEY.jobs, []);
let goals = store.load(KEY.goals, []);
let settings = store.load(KEY.settings, { weeklyGoal: 0, currency: '₪' });

function persist() {
  store.save(KEY.jobs, jobs);
  store.save(KEY.goals, goals);
  store.save(KEY.settings, settings);
}

/* -------------------- Helpers -------------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const CUR = () => settings.currency || '₪';

function money(n) {
  const rounded = Math.round(Number(n) || 0);
  return CUR() + rounded.toLocaleString('he-IL');
}
function moneyShort(n) {
  n = Math.round(Number(n) || 0);
  if (n >= 1000) return CUR() + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
  return CUR() + n;
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

function todayISO() { return toISO(new Date()); }
function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

// Week starts on Sunday (Israel)
function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a, b) { return toISO(a) === toISO(b); }

function niceDate(iso) {
  const d = parseISO(iso), t = new Date();
  if (sameDay(d, t)) return 'היום';
  if (sameDay(d, addDays(t, -1))) return 'אתמול';
  return `${d.getDate()} ב${MONTHS[d.getMonth()]}`;
}

function sum(arr, f) { return arr.reduce((s, x) => s + (f ? f(x) : x), 0); }

/* -------------------- Goal allocation --------------------
   Each goal saves from every job:
   - type 'percent': contribution = amount * value/100
   - type 'fixed':   contribution = min(value, amount)
   Saved is the sum of contributions across all jobs, capped at target.
--------------------------------------------------------- */
function goalContribution(goal, job) {
  const amt = Number(job.amount) || 0;
  if (goal.type === 'percent') return amt * (Number(goal.value) || 0) / 100;
  return Math.min(Number(goal.value) || 0, amt);
}
function goalSaved(goal) {
  const raw = sum(jobs, j => goalContribution(goal, j));
  return Math.min(raw, Number(goal.target) || 0);
}
function goalRawSaved(goal) { return sum(jobs, j => goalContribution(goal, j)); }

// Average weekly contribution to estimate ETA
function weeklyContribution(goal) {
  if (!jobs.length) return 0;
  const dates = jobs.map(j => parseISO(j.date).getTime());
  const span = Math.max(1, (Math.max(...dates) - Math.min(...dates)) / (7 * 864e5));
  return goalRawSaved(goal) / span;
}

/* -------------------- Stats -------------------- */
function weekRange(offset = 0) {
  const start = addDays(startOfWeek(new Date()), offset * 7);
  return { start, end: addDays(start, 7) };
}
function jobsInRange(start, end) {
  return jobs.filter(j => { const d = parseISO(j.date); return d >= start && d < end; });
}
function weekTotal(offset = 0) {
  const { start, end } = weekRange(offset);
  return sum(jobsInRange(start, end), j => Number(j.amount) || 0);
}

function stats() {
  const thisWeek = weekTotal(0);
  const lastWeek = weekTotal(-1);
  const thisWeekJobs = jobsInRange(weekRange(0).start, weekRange(0).end);
  const unpaid = sum(jobs.filter(j => !j.paid), j => Number(j.amount) || 0);
  const total = sum(jobs, j => Number(j.amount) || 0);

  // change %
  let change = null;
  if (lastWeek > 0) change = Math.round((thisWeek - lastWeek) / lastWeek * 100);
  else if (thisWeek > 0) change = 100;

  // most profitable weekday (all time)
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  jobs.forEach(j => { byDay[parseISO(j.date).getDay()] += Number(j.amount) || 0; });
  let bestDay = null, bestDayVal = 0;
  byDay.forEach((v, i) => { if (v > bestDayVal) { bestDayVal = v; bestDay = i; } });

  // top client (all time)
  const byClient = {};
  jobs.forEach(j => { const c = (j.client || '').trim() || 'ללא לקוח'; byClient[c] = (byClient[c] || 0) + (Number(j.amount) || 0); });
  const clientArr = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
  const topClient = clientArr[0] || null;

  return { thisWeek, lastWeek, change, unpaid, total, thisWeekJobs, byDay, bestDay, bestDayVal, byClient, clientArr, topClient };
}

/* ==========================================================
   RENDERING
   ========================================================== */
const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function inner(screen) { return $(`#screen-${screen} .screen-inner`); }

/* ---------- HOME ---------- */
function renderHome() {
  const c = inner('home'); c.innerHTML = '';
  const s = stats();

  if (jobs.length === 0) {
    c.appendChild(emptyState(
      '👋', 'ברוך הבא לרווח!',
      'כאן תרכז את כל העבודות שעשית, תראה כמה הרווחת, ותחסוך למטרות שלך. בוא נתחיל — הוסף עבודה ראשונה.',
      'הוספת עבודה ראשונה', () => openJobSheet()
    ));
    const demo = el('button', 'link-btn center', 'או טען נתוני דוגמה כדי לראות איך זה עובד');
    demo.style.display = 'block'; demo.style.margin = '4px auto';
    demo.onclick = loadDemo;
    c.appendChild(demo);
    return;
  }

  // Hero
  const hero = el('div', 'hero');
  const changeHtml = s.change === null ? '' :
    `<span class="pill ${s.change >= 0 ? 'up' : 'down'}">${s.change >= 0 ? '▲' : '▼'} ${Math.abs(s.change)}%</span>`;
  const changeText = s.change === null ? 'השבוע הראשון שלך 🎉'
    : s.change >= 0 ? 'יותר מהשבוע שעבר' : 'פחות מהשבוע שעבר';
  hero.innerHTML = `
    <div class="hero-label">הרווחת השבוע</div>
    <div class="hero-amount">${money(s.thisWeek)}</div>
    <div class="hero-sub">${changeHtml} <span>${changeText}</span></div>
    <div class="hero-stats">
      <div class="hero-stat"><div class="v">${s.thisWeekJobs.length}</div><div class="l">עבודות השבוע</div></div>
      <div class="hero-stat"><div class="v">${money(s.unpaid)}</div><div class="l">ממתין לתשלום</div></div>
    </div>`;

  // mini goal badges in hero
  if (goals.length) {
    const badges = el('div', 'mini-goal-badges');
    goals.slice(0, 3).forEach(g => {
      const pct = Math.min(100, Math.round(goalSaved(g) / (g.target || 1) * 100));
      badges.appendChild(el('div', 'mini-goal', `${g.emoji} ${pct}%`));
    });
    hero.appendChild(badges);
  }
  c.appendChild(hero);

  // Weekly goal progress (if set)
  if (settings.weeklyGoal > 0) {
    const pct = Math.min(100, Math.round(s.thisWeek / settings.weeklyGoal * 100));
    const left = Math.max(0, settings.weeklyGoal - s.thisWeek);
    const card = el('div', 'card');
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>🎯 יעד שבועי</b>
        <span style="font-size:13px;color:var(--text-soft)">${money(s.thisWeek)} / ${money(settings.weeklyGoal)}</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div style="font-size:13px;color:var(--text-soft)">${left > 0 ? `עוד ${money(left)} ליעד השבועי 💪` : 'הגעת ליעד השבועי! 🎉'}</div>`;
    c.appendChild(card);
  }

  // Insights
  c.appendChild(el('div', 'section-title', '💡 תובנות'));
  insightTiles(s).forEach(t => c.appendChild(t));

  // Recent jobs preview
  c.appendChild(el('div', 'section-title', '📋 עבודות אחרונות'));
  const recent = [...jobs].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created).slice(0, 3);
  recent.forEach(j => c.appendChild(jobRow(j)));
  const seeAll = el('button', 'link-btn center', 'לכל העבודות ←');
  seeAll.style.cssText = 'display:block;margin:2px auto 8px';
  seeAll.onclick = () => nav('jobs');
  c.appendChild(seeAll);
}

function insightTiles(s) {
  const tiles = [];
  const add = (ico, bg, t, sub) => {
    const e = el('div', 'insight');
    e.innerHTML = `<div class="insight-ico ${bg}">${ico}</div><div class="insight-txt"><div class="t">${t}</div><div class="s">${sub}</div></div>`;
    tiles.push(e);
  };

  if (s.change !== null && s.lastWeek > 0) {
    if (s.change >= 0) add('📈', 'bg-green', `עלייה של ${s.change}% מהשבוע שעבר`, `${money(s.thisWeek)} השבוע לעומת ${money(s.lastWeek)}`);
    else add('📉', 'bg-red', `ירידה של ${Math.abs(s.change)}% מהשבוע שעבר`, `${money(s.thisWeek)} השבוע לעומת ${money(s.lastWeek)}`);
  }
  if (s.bestDay !== null && s.bestDayVal > 0) add('📅', 'bg-blue', `יום ${DAY_NAMES[s.bestDay]} הכי רווחי לך`, `סה״כ ${money(s.bestDayVal)} בימי ${DAY_NAMES[s.bestDay]}`);
  if (s.topClient) add('👤', 'bg-purple', `הלקוח הכי רווחי: ${s.topClient[0]}`, `${money(s.topClient[1])} סה״כ`);
  if (s.unpaid > 0) add('⏳', 'bg-amber', `${money(s.unpaid)} עדיין לא שולמו`, `${jobs.filter(j => !j.paid).length} עבודות ממתינות לתשלום`);

  // goal nudge
  const closest = goals.map(g => ({ g, left: (g.target || 0) - goalSaved(g), pct: goalSaved(g) / (g.target || 1) }))
    .filter(x => x.left > 0).sort((a, b) => b.pct - a.pct)[0];
  if (closest) add(closest.g.emoji, 'bg-green', `עוד ${money(closest.left)} ל"${closest.g.name}"`, `כבר חסכת ${Math.round(closest.pct * 100)}% מהמטרה`);

  if (!tiles.length) add('✨', 'bg-green', 'הוסף עוד עבודות', 'ככל שתרשום יותר, כך התובנות ידייקו');
  return tiles;
}

/* ---------- INSIGHTS ---------- */
function renderInsights() {
  const c = inner('insights'); c.innerHTML = '';
  if (jobs.length === 0) {
    c.appendChild(emptyState('📊', 'אין עדיין נתונים', 'הוסף כמה עבודות וכאן יופיעו גרפים ותובנות על ההכנסות שלך.', 'הוספת עבודה', () => openJobSheet()));
    return;
  }
  const s = stats();

  // Summary strip
  const strip = el('div', 'card');
  strip.style.cssText = 'display:flex;text-align:center;padding:16px 8px';
  strip.innerHTML = `
    <div style="flex:1"><div style="font-size:22px;font-weight:900;color:var(--green)">${moneyShort(s.total)}</div><div style="font-size:12px;color:var(--text-soft)">סה״כ הכנסות</div></div>
    <div style="flex:1;border-inline:1px solid var(--border)"><div style="font-size:22px;font-weight:900">${jobs.length}</div><div style="font-size:12px;color:var(--text-soft)">עבודות</div></div>
    <div style="flex:1"><div style="font-size:22px;font-weight:900;color:var(--amber)">${moneyShort(s.unpaid)}</div><div style="font-size:12px;color:var(--text-soft)">ממתין</div></div>`;
  c.appendChild(strip);

  // 6-week trend
  c.appendChild(weeklyTrendChart());
  // by weekday
  c.appendChild(weekdayChart(s));
  // top clients
  c.appendChild(topClientsChart(s));
  // paid vs unpaid
  c.appendChild(paidDonut(s));
}

function weeklyTrendChart() {
  const card = el('div', 'chart-card');
  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const { start } = weekRange(-i);
    weeks.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, val: weekTotal(-i), isNow: i === 0 });
  }
  const max = Math.max(1, ...weeks.map(w => w.val));
  const avg = sum(weeks, w => w.val) / weeks.length;
  let bars = '';
  weeks.forEach(w => {
    const h = Math.round(w.val / max * 100);
    bars += `<div class="bar-col">
      <div class="bar-val">${w.val ? moneyShort(w.val) : ''}</div>
      <div class="bar ${w.isNow ? '' : 'dim'}" style="height:${h}%"></div>
      <div class="bar-lbl">${w.label}</div></div>`;
  });
  card.innerHTML = `<div class="chart-title">מגמת הכנסה — 6 שבועות</div>
    <div class="chart-note">ממוצע שבועי: ${money(avg)}</div>
    <div class="bar-chart">${bars}</div>`;
  return card;
}

function weekdayChart(s) {
  const card = el('div', 'chart-card');
  const max = Math.max(1, ...s.byDay);
  let bars = '';
  for (let i = 0; i < 7; i++) {
    const h = Math.round(s.byDay[i] / max * 100);
    const best = i === s.bestDay && s.bestDayVal > 0;
    bars += `<div class="bar-col">
      <div class="bar-val">${s.byDay[i] ? moneyShort(s.byDay[i]) : ''}</div>
      <div class="bar ${best ? '' : 'dim'}" style="height:${h}%"></div>
      <div class="bar-lbl">${DAY_SHORT[i]}</div></div>`;
  }
  card.innerHTML = `<div class="chart-title">הכנסה לפי יום בשבוע</div>
    <div class="chart-note">${s.bestDay !== null && s.bestDayVal > 0 ? `יום ${DAY_NAMES[s.bestDay]} הכי רווחי לך` : 'כל הימים'}</div>
    <div class="bar-chart">${bars}</div>`;
  return card;
}

function topClientsChart(s) {
  const card = el('div', 'chart-card');
  const top = s.clientArr.slice(0, 5);
  const max = Math.max(1, ...top.map(c => c[1]));
  const colors = ['var(--green)', 'var(--blue)', 'var(--purple)', 'var(--amber)', 'var(--red)'];
  let rows = '';
  top.forEach((c, i) => {
    const w = Math.max(14, Math.round(c[1] / max * 100));
    rows += `<div class="hbar-row">
      <div class="hbar-name">${c[0]}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${w}%;background:${colors[i]}">${w > 30 ? money(c[1]) : ''}</div></div>
      <div class="hbar-val">${w <= 30 ? money(c[1]) : ''}</div></div>`;
  });
  card.innerHTML = `<div class="chart-title">לקוחות מובילים</div>
    <div class="chart-note">מי מכניס לך הכי הרבה</div>${rows}`;
  return card;
}

function paidDonut(s) {
  const card = el('div', 'chart-card');
  const paid = s.total - s.unpaid;
  const total = s.total || 1;
  const paidPct = paid / total;
  const r = 45, C = 2 * Math.PI * r;
  const paidLen = C * paidPct;
  card.innerHTML = `
    <div class="chart-title">שולם מול ממתין</div>
    <div class="chart-note">מצב התשלומים שלך</div>
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--amber)" stroke-width="16"/>
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--green)" stroke-width="16"
          stroke-dasharray="${paidLen} ${C}" stroke-dashoffset="0"
          transform="rotate(-90 60 60)" stroke-linecap="round"/>
        <text x="60" y="56" text-anchor="middle" font-size="20" font-weight="900" fill="var(--text)">${Math.round(paidPct * 100)}%</text>
        <text x="60" y="74" text-anchor="middle" font-size="10" fill="var(--text-soft)">שולם</text>
      </svg>
      <div class="donut-legend">
        <div class="legend-row"><span class="legend-dot" style="background:var(--green)"></span> שולם <b>${money(paid)}</b></div>
        <div class="legend-row"><span class="legend-dot" style="background:var(--amber)"></span> ממתין <b>${money(s.unpaid)}</b></div>
      </div>
    </div>`;
  return card;
}

/* ---------- GOALS ---------- */
function renderGoals() {
  const c = inner('goals'); c.innerHTML = '';

  const head = el('div', '');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:4px 4px 14px';
  head.innerHTML = `<div style="font-size:22px;font-weight:900">🎯 המטרות שלי</div>`;
  const addBtn = el('button', 'btn btn-primary btn-sm', '+ מטרה');
  addBtn.onclick = () => openGoalSheet();
  head.appendChild(addBtn);
  c.appendChild(head);

  if (goals.length === 0) {
    c.appendChild(emptyState('🎯', 'הגדר מטרה ראשונה',
      'חופשה? פלייסטיישן? טיול לירושלים? הגדר מטרה, ובחר כמה מכל עבודה יילך אליה. נעקוב אחרי ההתקדמות בשבילך.',
      'יצירת מטרה', () => openGoalSheet()));
    return;
  }

  goals.forEach(g => c.appendChild(goalCard(g)));

  const totalAlloc = goals.filter(g => g.type === 'percent').reduce((s, g) => s + Number(g.value), 0);
  if (totalAlloc > 100) {
    const warn = el('div', 'card');
    warn.style.cssText = 'background:var(--amber-soft);color:var(--amber);font-size:13px;font-weight:600';
    warn.innerHTML = `⚠️ סך ההקצאות באחוזים הוא ${totalAlloc}% — יותר מ-100% מההכנסה. זה בסדר למעקב, אבל שים לב שלא כל הכסף באמת קיים פעמיים.`;
    c.appendChild(warn);
  }
}

function goalCard(g) {
  const saved = goalSaved(g);
  const target = Number(g.target) || 0;
  const pct = Math.min(100, Math.round(saved / (target || 1) * 100));
  const left = Math.max(0, target - saved);
  const done = saved >= target && target > 0;

  const card = el('div', 'goal-card');
  const allocLabel = g.type === 'percent' ? `${g.value}% מכל עבודה` : `${money(g.value)} מכל עבודה`;

  // ETA
  let etaHtml = '';
  if (!done && left > 0) {
    const wc = weeklyContribution(g);
    if (wc > 0) {
      const weeksLeft = Math.ceil(left / wc);
      const eta = addDays(new Date(), weeksLeft * 7);
      etaHtml = `<div class="goal-eta">⏱️ בקצב הנוכחי: עוד כ-${weeksLeft} ${weeksLeft === 1 ? 'שבוע' : 'שבועות'} (${eta.getDate()} ב${MONTHS[eta.getMonth()]})</div>`;
    }
  }

  card.innerHTML = `
    <div class="goal-top">
      <div class="goal-emoji">${g.emoji}</div>
      <div style="flex:1;min-width:0">
        <div class="goal-name">${g.name}</div>
        <div class="goal-meta">${allocLabel}</div>
      </div>
      ${done ? '<span class="goal-done-badge">הושג! 🎉</span>' : '<button class="goal-del" data-del="' + g.id + '">🗑️</button>'}
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="goal-nums"><span class="saved">${money(saved)} ${done ? '' : `(${pct}%)`}</span><span class="left">${done ? 'מוכן!' : `מתוך ${money(target)}`}</span></div>
    ${etaHtml}`;

  const del = card.querySelector('[data-del]');
  if (del) del.onclick = () => { if (confirm(`למחוק את המטרה "${g.name}"?`)) { goals = goals.filter(x => x.id !== g.id); persist(); renderAll(); toast('המטרה נמחקה'); } };
  return card;
}

/* ---------- JOBS LIST ---------- */
function renderJobs() {
  const c = inner('jobs'); c.innerHTML = '';
  const head = el('div', '');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:4px 4px 14px';
  head.innerHTML = `<div style="font-size:22px;font-weight:900">📋 העבודות שלי</div>`;
  const addBtn = el('button', 'btn btn-primary btn-sm', '+ עבודה');
  addBtn.onclick = () => openJobSheet();
  head.appendChild(addBtn);
  c.appendChild(head);

  if (jobs.length === 0) {
    c.appendChild(emptyState('📋', 'עוד לא רשמת עבודות', 'רשום מה עשית, למי, וכמה הרווחת — לוקח 10 שניות.', 'הוספת עבודה', () => openJobSheet()));
    return;
  }

  const sorted = [...jobs].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  let lastGroup = '';
  sorted.forEach(j => {
    const g = niceDate(j.date);
    if (g !== lastGroup) { c.appendChild(el('div', 'date-group-label', g)); lastGroup = g; }
    c.appendChild(jobRow(j, true));
  });
}

function jobRow(j, tappable) {
  const row = el('div', 'job-row');
  const initial = (j.title || '?').trim().charAt(0) || '💼';
  row.innerHTML = `
    <div class="job-avatar">${initial}</div>
    <div class="job-main">
      <div class="job-title">${j.title || 'עבודה'}</div>
      <div class="job-sub">${j.client ? j.client + ' · ' : ''}${niceDate(j.date)}</div>
    </div>
    <div class="job-right">
      <div class="job-amount">${money(j.amount)}</div>
      <span class="status-chip ${j.paid ? 'status-paid' : 'status-unpaid'}">${j.paid ? 'שולם' : 'ממתין'}</span>
    </div>`;
  if (tappable) row.onclick = () => openJobSheet(j);
  return row;
}

/* ---------- Empty state ---------- */
function emptyState(emoji, title, text, btnLabel, onClick) {
  const e = el('div', 'empty');
  e.innerHTML = `<div class="empty-emoji">${emoji}</div><div class="empty-title">${title}</div><div class="empty-text">${text}</div>`;
  if (btnLabel) {
    const b = el('button', 'btn btn-primary', btnLabel);
    b.style.maxWidth = '260px'; b.style.margin = '0 auto';
    b.onclick = onClick;
    e.appendChild(b);
  }
  return e;
}

/* ==========================================================
   SHEETS (add/edit job, add goal, settings)
   ========================================================== */
function openSheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.remove('hidden');
  $('#sheetBackdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  $('#sheet').classList.add('hidden');
  $('#sheetBackdrop').classList.add('hidden');
  document.body.style.overflow = '';
}
$('#sheetBackdrop').onclick = closeSheet;

/* ----- Job sheet ----- */
const RECENT_TITLES = () => [...new Set(jobs.map(j => j.title).filter(Boolean))].slice(0, 6);
const RECENT_CLIENTS = () => [...new Set(jobs.map(j => j.client).filter(Boolean))].slice(0, 8);

function openJobSheet(existing) {
  const j = existing || { title: '', client: '', amount: '', date: todayISO(), paid: true };
  const isEdit = !!existing;

  openSheet(`
    <div class="sheet-title">${isEdit ? 'עריכת עבודה' : 'הוספת עבודה'}</div>
    <div class="field">
      <label>מה עשית?</label>
      <input type="text" id="f-title" placeholder="לדוגמה: תיקון חשמל, עיצוב לוגו, משמרת" value="${escAttr(j.title)}" />
      ${RECENT_TITLES().length ? `<div class="chips" id="title-chips">${RECENT_TITLES().map(t => `<button class="chip" data-t="${escAttr(t)}">${t}</button>`).join('')}</div>` : ''}
    </div>
    <div class="field">
      <label>כמה הרווחת?</label>
      <div class="amount-input-wrap">
        <span class="cur">${CUR()}</span>
        <input type="number" id="f-amount" inputmode="decimal" placeholder="0" value="${j.amount}" />
      </div>
    </div>
    <div class="field">
      <label>למי? (לקוח)</label>
      <input type="text" id="f-client" placeholder="שם הלקוח (אופציונלי)" value="${escAttr(j.client)}" />
      ${RECENT_CLIENTS().length ? `<div class="chips" id="client-chips">${RECENT_CLIENTS().map(t => `<button class="chip" data-c="${escAttr(t)}">${t}</button>`).join('')}</div>` : ''}
    </div>
    <div class="row2">
      <div class="field">
        <label>תאריך</label>
        <input type="date" id="f-date" value="${j.date}" />
      </div>
      <div class="field">
        <label>סטטוס תשלום</label>
        <div class="toggle-group">
          <div class="toggle-opt ${j.paid ? 'on' : ''}" id="t-paid">שולם ✓</div>
          <div class="toggle-opt ${!j.paid ? 'on' : ''}" id="t-unpaid">ממתין</div>
        </div>
      </div>
    </div>
    <button class="btn btn-primary mt8" id="f-save">${isEdit ? 'שמירה' : 'הוספה'}</button>
    ${isEdit ? '<button class="btn btn-danger mt8" id="f-delete">מחיקת עבודה</button>' : ''}
  `);

  let paid = j.paid;
  $('#t-paid').onclick = () => { paid = true; $('#t-paid').classList.add('on'); $('#t-unpaid').classList.remove('on'); };
  $('#t-unpaid').onclick = () => { paid = false; $('#t-unpaid').classList.add('on'); $('#t-paid').classList.remove('on'); };

  const tc = $('#title-chips'); if (tc) tc.querySelectorAll('.chip').forEach(ch => ch.onclick = () => $('#f-title').value = ch.dataset.t);
  const cc = $('#client-chips'); if (cc) cc.querySelectorAll('.chip').forEach(ch => ch.onclick = () => $('#f-client').value = ch.dataset.c);

  $('#f-save').onclick = () => {
    const title = $('#f-title').value.trim();
    const amount = parseFloat($('#f-amount').value);
    const client = $('#f-client').value.trim();
    const date = $('#f-date').value || todayISO();
    if (!amount || amount <= 0) { toast('הכנס סכום 💰'); $('#f-amount').focus(); return; }
    if (isEdit) {
      Object.assign(existing, { title, amount, client, date, paid });
    } else {
      jobs.push({ id: uid(), title, amount, client, date, paid, created: Date.now() });
    }
    persist(); closeSheet(); renderAll();
    toast(isEdit ? 'העבודה עודכנה ✓' : `נוסף! ${money(amount)} 🎉`);
    celebrateGoals();
  };

  if (isEdit) $('#f-delete').onclick = () => {
    if (confirm('למחוק את העבודה?')) { jobs = jobs.filter(x => x.id !== existing.id); persist(); closeSheet(); renderAll(); toast('העבודה נמחקה'); }
  };

  setTimeout(() => { if (!isEdit) $('#f-title').focus(); }, 350);
}

/* ----- Goal sheet ----- */
const GOAL_EMOJIS = ['🎯', '🏖️', '✈️', '🕌', '🎮', '🚗', '🏠', '📱', '💻', '💍', '🎸', '👟', '🎓', '💰', '🎁', '🏋️'];

function openGoalSheet() {
  openSheet(`
    <div class="sheet-title">מטרה חדשה 🎯</div>
    <div class="field">
      <label>בחר אייקון</label>
      <div class="emoji-grid" id="emoji-grid">
        ${GOAL_EMOJIS.map((e, i) => `<button class="emoji-opt ${i === 0 ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <label>שם המטרה</label>
      <input type="text" id="g-name" placeholder="לדוגמה: חופשה ביוון, פלייסטיישן 5" />
    </div>
    <div class="field">
      <label>כמה זה עולה? (יעד)</label>
      <div class="amount-input-wrap">
        <span class="cur">${CUR()}</span>
        <input type="number" id="g-target" inputmode="decimal" placeholder="0" />
      </div>
    </div>
    <div class="field">
      <label>כמה להקצות מכל עבודה?</label>
      <div class="toggle-group">
        <div class="toggle-opt on" id="g-type-percent">אחוז מכל עבודה</div>
        <div class="toggle-opt" id="g-type-fixed">סכום קבוע</div>
      </div>
    </div>
    <div class="field">
      <div class="amount-input-wrap">
        <span class="cur" id="g-val-cur">%</span>
        <input type="number" id="g-value" inputmode="decimal" placeholder="10" />
      </div>
      <div class="hint" id="g-hint">מכל עבודה, 10% ילכו למטרה הזו.</div>
    </div>
    <button class="btn btn-primary mt8" id="g-save">יצירת מטרה</button>
  `);

  let emoji = GOAL_EMOJIS[0], type = 'percent';
  const grid = $('#emoji-grid');
  grid.querySelectorAll('.emoji-opt').forEach(b => b.onclick = () => {
    grid.querySelectorAll('.emoji-opt').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); emoji = b.dataset.e;
  });

  const updateHint = () => {
    const v = $('#g-value').value || (type === 'percent' ? '10' : '100');
    $('#g-hint').textContent = type === 'percent'
      ? `מכל עבודה, ${v}% ילכו למטרה הזו.`
      : `מכל עבודה, ${money(v)} ילכו למטרה הזו.`;
    $('#g-val-cur').textContent = type === 'percent' ? '%' : CUR();
  };
  $('#g-type-percent').onclick = () => { type = 'percent'; $('#g-type-percent').classList.add('on'); $('#g-type-fixed').classList.remove('on'); updateHint(); };
  $('#g-type-fixed').onclick = () => { type = 'fixed'; $('#g-type-fixed').classList.add('on'); $('#g-type-percent').classList.remove('on'); updateHint(); };
  $('#g-value').oninput = updateHint;

  $('#g-save').onclick = () => {
    const name = $('#g-name').value.trim();
    const target = parseFloat($('#g-target').value);
    const value = parseFloat($('#g-value').value);
    if (!name) { toast('תן שם למטרה'); $('#g-name').focus(); return; }
    if (!target || target <= 0) { toast('הכנס יעד סכום'); $('#g-target').focus(); return; }
    if (!value || value <= 0) { toast('כמה להקצות מכל עבודה?'); $('#g-value').focus(); return; }
    goals.push({ id: uid(), name, emoji, target, type, value, created: Date.now() });
    persist(); closeSheet(); renderAll(); toast(`המטרה "${name}" נוצרה 🎯`);
  };

  setTimeout(() => $('#g-name').focus(), 350);
}

/* ----- Settings sheet ----- */
function openSettings() {
  openSheet(`
    <div class="sheet-title">⚙️ הגדרות</div>
    <div class="field">
      <label>יעד הכנסה שבועי (אופציונלי)</label>
      <div class="amount-input-wrap">
        <span class="cur">${CUR()}</span>
        <input type="number" id="s-weekly" inputmode="decimal" placeholder="0" value="${settings.weeklyGoal || ''}" />
      </div>
      <div class="hint">נראה לך התקדמות ליעד במסך הבית.</div>
    </div>
    <div class="field">
      <label>מטבע</label>
      <select id="s-cur">
        ${['₪', '$', '€', '£'].map(c => `<option ${c === CUR() ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-primary mt8" id="s-save">שמירה</button>
    <button class="btn btn-ghost mt8" id="s-export">ייצוא נתונים (גיבוי)</button>
    <button class="btn btn-danger mt16" id="s-reset">איפוס — מחיקת כל הנתונים</button>
    <div class="hint center mt16">הנתונים נשמרים על המכשיר הזה בלבד. רווח · גרסה 1.0</div>
  `);

  $('#s-save').onclick = () => {
    settings.weeklyGoal = parseFloat($('#s-weekly').value) || 0;
    settings.currency = $('#s-cur').value;
    persist(); closeSheet(); renderAll(); toast('נשמר ✓');
  };
  $('#s-export').onclick = () => {
    const data = JSON.stringify({ jobs, goals, settings }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `revach-backup-${todayISO()}.json`; a.click();
    toast('הגיבוי הורד ✓');
  };
  $('#s-reset').onclick = () => {
    if (confirm('למחוק את כל העבודות והמטרות? אי אפשר לבטל.')) {
      jobs = []; goals = []; settings = { weeklyGoal: 0, currency: CUR() };
      persist(); closeSheet(); renderAll(); toast('הכל אופס');
    }
  };
}

/* ==========================================================
   Navigation, toast, misc
   ========================================================== */
let current = 'home';
function nav(screen) {
  current = screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.dataset.screen !== screen));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === screen));
  renderScreen(screen);
  window.scrollTo(0, 0);
}
function renderScreen(screen) {
  ({ home: renderHome, insights: renderInsights, goals: renderGoals, jobs: renderJobs }[screen] || renderHome)();
}
function renderAll() { renderScreen(current); }

document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => nav(b.dataset.nav));
$('#fabAdd').onclick = () => openJobSheet();
$('#settingsBtn').onclick = openSettings;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 250); }, 2200);
}

// celebrate reaching a goal after adding a job
let prevDone = new Set();
function snapshotDone() { prevDone = new Set(goals.filter(g => goalSaved(g) >= g.target && g.target > 0).map(g => g.id)); }
function celebrateGoals() {
  goals.forEach(g => {
    const done = goalSaved(g) >= g.target && g.target > 0;
    if (done && !prevDone.has(g.id)) { setTimeout(() => toast(`🎉 הגעת למטרה "${g.name}"!`), 1200); }
  });
  snapshotDone();
}

function escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

/* ----- Demo data ----- */
function loadDemo() {
  const t = new Date();
  const d = n => toISO(addDays(t, n));
  jobs = [
    { id: uid(), title: 'תיקון חשמל', client: 'דני כהן', amount: 450, date: d(0), paid: true, created: Date.now() - 9e6 },
    { id: uid(), title: 'התקנת מזגן', client: 'משפחת לוי', amount: 800, date: d(0), paid: true, created: Date.now() - 8e6 },
    { id: uid(), title: 'ייעוץ', client: 'סטארטאפ ניר', amount: 600, date: d(0), paid: false, created: Date.now() - 7e6 },
    { id: uid(), title: 'תיקון חשמל', client: 'דני כהן', amount: 350, date: d(-3), paid: true, created: Date.now() - 6e6 },
    { id: uid(), title: 'משמרת ערב', client: 'קפה מרכז', amount: 320, date: d(-5), paid: true, created: Date.now() - 5e6 },
    { id: uid(), title: 'התקנת גופים', client: 'משפחת לוי', amount: 500, date: d(-8), paid: false, created: Date.now() - 4e6 },
    { id: uid(), title: 'תיקון חשמל', client: 'עמותת אור', amount: 700, date: d(-9), paid: true, created: Date.now() - 3e6 },
    { id: uid(), title: 'משמרת ערב', client: 'קפה מרכז', amount: 320, date: d(-12), paid: true, created: Date.now() - 2e6 },
    { id: uid(), title: 'ייעוץ', client: 'סטארטאפ ניר', amount: 900, date: d(-15), paid: true, created: Date.now() - 1e6 },
  ];
  goals = [
    { id: uid(), name: 'טיול לירושלים', emoji: '🕌', target: 800, type: 'percent', value: 10, created: Date.now() },
    { id: uid(), name: 'פלייסטיישן 5', emoji: '🎮', target: 2500, type: 'fixed', value: 100, created: Date.now() },
    { id: uid(), name: 'חופשה ביוון', emoji: '🏖️', target: 6000, type: 'percent', value: 15, created: Date.now() },
  ];
  settings.weeklyGoal = 2000;
  persist(); snapshotDone(); renderAll();
  toast('נטענו נתוני דוגמה ✨');
}

/* ----- Boot ----- */
snapshotDone();
nav('home');

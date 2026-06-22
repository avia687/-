// Frontend for the Polymarket Trader Scanner.
// Vanilla JS — no build step. Talks to the /api endpoints served by server.js.

const $ = (sel) => document.querySelector(sel);
const fmtUsd = (n) =>
  (n < 0 ? "-$" : "$") +
  Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtCompact = (n) => {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};
const signClass = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const signNum = (n) => (n > 0 ? "+" : "") + fmtUsd(n);

// ---- watchlist (followed traders) persisted in localStorage ----
const WATCH_KEY = "pm_watchlist";
const loadWatch = () => {
  try {
    return JSON.parse(localStorage.getItem(WATCH_KEY) || "{}");
  } catch {
    return {};
  }
};
let watchlist = loadWatch();
const saveWatch = () => localStorage.setItem(WATCH_KEY, JSON.stringify(watchlist));
const isFollowed = (w) => !!watchlist[w];
function toggleFollow(trader) {
  if (watchlist[trader.wallet]) delete watchlist[trader.wallet];
  else
    watchlist[trader.wallet] = {
      wallet: trader.wallet,
      name: trader.name,
      profit: trader.profit,
      followedAt: Date.now(),
    };
  saveWatch();
  updateWatchCount();
}
const updateWatchCount = () =>
  ($("#watchCount").textContent = Object.keys(watchlist).length);

// ---- state ----
const state = {
  window: "all",
  sort: "score",
  minProfit: 0,
  minVolume: 0,
  q: "",
  onlyWatch: false,
  traders: [],
};

// ---- rendering ----
function avatarHtml(t, big) {
  const initial = (t.name || "?").trim().charAt(0).toUpperCase();
  if (t.avatar)
    return `<div class="avatar"><img src="${t.avatar}" alt="" onerror="this.parentNode.textContent='${initial}'"></div>`;
  return `<div class="avatar">${initial}</div>`;
}

function scoreChip(score) {
  const cls = score >= 66 ? "" : score >= 33 ? "mid" : "low";
  return `<span class="score-chip ${cls}">${score.toFixed(0)}</span>`;
}

function renderStats(data) {
  const t = data.traders;
  const totalProfit = t.reduce((s, x) => s + Math.max(x.profit, 0), 0);
  const avgRoi = t.length ? t.reduce((s, x) => s + x.roi, 0) / t.length : 0;
  const top = t[0];
  $("#stats").innerHTML = `
    <div class="stat"><div class="label">סוחרים שנסרקו</div><div class="value">${data.totalScanned}</div></div>
    <div class="stat"><div class="label">רווח מצטבר (מוצג)</div><div class="value pos">${fmtCompact(totalProfit)}</div></div>
    <div class="stat"><div class="label">תשואה ממוצעת</div><div class="value ${signClass(avgRoi)}">${avgRoi.toFixed(1)}%</div></div>
    <div class="stat"><div class="label">הסוחר המוביל</div><div class="value" style="font-size:1.05rem">${top ? top.name : "—"}</div></div>`;
}

function renderBoard() {
  let rows = state.traders;
  if (state.onlyWatch) rows = rows.filter((t) => isFollowed(t.wallet));

  const body = $("#boardBody");
  $("#resultCount").textContent = `(${rows.length})`;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">לא נמצאו סוחרים שמתאימים לסינון.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((t) => {
      const rankCls = t.rank <= 3 ? `rank-${t.rank}` : "";
      return `<tr data-wallet="${t.wallet}">
      <td><span class="rank-badge ${rankCls}">${t.rank}</span></td>
      <td>
        <div class="trader-cell">
          ${avatarHtml(t)}
          <div class="trader-meta">
            <div class="name">${escapeHtml(t.name)}</div>
            <div class="wallet">${shortWallet(t.wallet)}</div>
          </div>
        </div>
      </td>
      <td class="num">${scoreChip(t.score)}</td>
      <td class="num ${signClass(t.profit)}">${signNum(t.profit)}</td>
      <td class="num ${signClass(t.roi)}">${t.roi.toFixed(1)}%</td>
      <td class="num muted">${fmtCompact(t.volume)}</td>
      <td class="num">
        <button class="follow-btn ${isFollowed(t.wallet) ? "active" : ""}" data-follow="${t.wallet}">
          ${isFollowed(t.wallet) ? "★ עוקב" : "☆ עקוב"}
        </button>
      </td>
    </tr>`;
    })
    .join("");
}

// ---- data ----
async function scan() {
  const status = $("#boardStatus");
  status.classList.remove("hidden");
  status.innerHTML = `<span class="spinner"></span> סורק את Polymarket…`;

  const params = new URLSearchParams({
    window: state.window,
    sort: state.sort,
    limit: "100",
  });
  if (state.minProfit) params.set("minProfit", state.minProfit);
  if (state.minVolume) params.set("minVolume", state.minVolume);
  if (state.q) params.set("q", state.q);

  try {
    const res = await fetch(`/api/traders?${params}`);
    const data = await res.json();
    state.traders = data.traders;

    const badge = $("#sourceBadge");
    badge.className = `source-badge ${data.source}`;
    badge.textContent = data.source === "live" ? "● נתונים חיים" : "● מצב הדגמה";
    badge.title =
      data.source === "live"
        ? "מחובר ל‑Polymarket בזמן אמת"
        : "ה‑API של Polymarket לא זמין מכאן — מוצגים נתוני דמו ריאליסטיים";

    $("#updatedAt").textContent =
      "עודכן: " + new Date(data.updatedAt).toLocaleTimeString("he-IL");

    renderStats(data);
    renderBoard();
    status.classList.add("hidden");
  } catch (err) {
    status.classList.remove("hidden");
    status.innerHTML = `⚠️ שגיאה בטעינת הנתונים: ${escapeHtml(err.message)}`;
  }
}

async function openTrader(wallet) {
  const overlay = $("#drawerOverlay");
  const drawer = $("#drawer");
  const body = $("#drawerBody");
  overlay.classList.add("open");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  body.innerHTML = `<div class="empty"><span class="spinner"></span> טוען פרופיל…</div>`;

  const summary = state.traders.find((t) => t.wallet === wallet) || { wallet, name: shortWallet(wallet), profit: 0, roi: 0, volume: 0, score: 0 };

  try {
    const res = await fetch(`/api/traders/${wallet}`);
    const d = await res.json();
    renderProfile(summary, d);
  } catch (err) {
    body.innerHTML = `<div class="empty">שגיאה: ${escapeHtml(err.message)}</div>`;
  }
}

function renderProfile(t, d) {
  const followed = isFollowed(t.wallet);
  const positions = (d.positions || [])
    .map(
      (p) => `<div class="pos-row">
        <div class="top">
          <span class="market">${escapeHtml(p.market)}</span>
          <span class="${signClass(p.pnl)}">${signNum(p.pnl)}</span>
        </div>
        <div class="top">
          <span class="sub">
            <span class="outcome-${(p.outcome || "").toLowerCase() === "no" ? "no" : "yes"}">${escapeHtml(p.outcome || "—")}</span>
            · ${p.size.toLocaleString()} מניות @ ${p.avgPrice}¢ → ${p.curPrice}¢
          </span>
          <span class="sub">${fmtUsd(p.value)} (${p.pnlPct > 0 ? "+" : ""}${p.pnlPct}%)</span>
        </div>
      </div>`
    )
    .join("") || `<div class="empty">אין פוזיציות פתוחות.</div>`;

  const activity = (d.activity || [])
    .map((a) => {
      const side = (a.side || a.type || "").toUpperCase();
      const sideCls = side.includes("SELL") ? "side-sell" : "side-buy";
      const sideHe = side.includes("SELL") ? "מכירה" : "קנייה";
      return `<div class="act-row">
        <div class="top">
          <span class="sub"><span class="${sideCls}">${sideHe}</span> · ${escapeHtml(a.outcome || "")}</span>
          <span class="sub">${a.timestamp ? new Date(a.timestamp).toLocaleDateString("he-IL") : ""}</span>
        </div>
        <div class="top">
          <span class="market" style="font-size:.82rem">${escapeHtml(a.market)}</span>
          <span class="sub">${fmtUsd(a.usdValue)} @ ${a.price}¢</span>
        </div>
      </div>`;
    })
    .join("") || `<div class="empty">אין פעילות אחרונה.</div>`;

  $("#drawerBody").innerHTML = `
    <div class="profile-head">
      ${avatarHtml(t, true)}
      <div>
        <h2>${escapeHtml(t.name)}</h2>
        <div class="wallet">${t.wallet}</div>
      </div>
    </div>

    <div class="profile-actions">
      <button class="primary-btn" id="profileFollow" data-follow="${t.wallet}">
        ${followed ? "★ עוקב — בטל מעקב" : "☆ עקוב אחרי הסוחר"}
      </button>
      <a class="ghost-btn" href="${d.profileUrl}" target="_blank" rel="noopener">↗ פרופיל ב‑Polymarket</a>
    </div>

    <div class="metric-grid">
      <div class="metric"><div class="label">רווח (Leaderboard)</div><div class="value ${signClass(t.profit)}">${signNum(t.profit)}</div></div>
      <div class="metric"><div class="label">ציון סורק</div><div class="value">${t.score.toFixed(0)}<span class="muted" style="font-size:.9rem">/100</span></div></div>
      <div class="metric"><div class="label">שווי תיק נוכחי</div><div class="value">${fmtUsd(d.totalValue || 0)}</div></div>
      <div class="metric"><div class="label">רווח לא ממומש</div><div class="value ${signClass(d.unrealizedPnl || 0)}">${signNum(d.unrealizedPnl || 0)}</div></div>
      <div class="metric"><div class="label">אחוז הצלחה</div><div class="value">${(d.winRate || 0).toFixed(0)}%</div></div>
      <div class="metric"><div class="label">פוזיציות פתוחות</div><div class="value">${d.openPositions || 0}</div></div>
    </div>

    <div class="section-title">פוזיציות פתוחות <span class="tag">מה הוא מחזיק עכשיו</span></div>
    ${positions}

    <div class="section-title">פעילות אחרונה <span class="tag">איתותי העתקה</span></div>
    ${activity}
  `;

  $("#profileFollow").addEventListener("click", () => {
    toggleFollow(t);
    renderProfile(t, d);
    renderBoard();
  });
}

function closeDrawer() {
  $("#drawerOverlay").classList.remove("open");
  $("#drawer").classList.remove("open");
  $("#drawer").setAttribute("aria-hidden", "true");
}

// ---- helpers ----
function shortWallet(w) {
  return w && w.length > 10 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function debounce(fn, ms) {
  let id;
  return (...a) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...a), ms);
  };
}

// ---- events ----
$("#windowSeg").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-window]");
  if (!btn) return;
  state.window = btn.dataset.window;
  $("#windowSeg .active")?.classList.remove("active");
  btn.classList.add("active");
  scan();
});
$("#sortSel").addEventListener("change", (e) => {
  state.sort = e.target.value;
  scan();
});
$("#minProfit").addEventListener("input", debounce((e) => {
  state.minProfit = Number(e.target.value) || 0;
  scan();
}, 400));
$("#minVolume").addEventListener("input", debounce((e) => {
  state.minVolume = Number(e.target.value) || 0;
  scan();
}, 400));
$("#search").addEventListener("input", debounce((e) => {
  state.q = e.target.value.trim();
  scan();
}, 350));
$("#scanBtn").addEventListener("click", scan);

$("#boardBody").addEventListener("click", (e) => {
  const followBtn = e.target.closest("button[data-follow]");
  if (followBtn) {
    e.stopPropagation();
    const w = followBtn.dataset.follow;
    const trader = state.traders.find((t) => t.wallet === w);
    if (trader) {
      toggleFollow(trader);
      renderBoard();
    }
    return;
  }
  const row = e.target.closest("tr[data-wallet]");
  if (row) openTrader(row.dataset.wallet);
});

$("#watchlistBtn").addEventListener("click", () => {
  state.onlyWatch = !state.onlyWatch;
  $("#watchlistBtn").classList.toggle("active");
  $("#watchlistBtn").style.borderColor = state.onlyWatch ? "var(--gold)" : "";
  renderBoard();
});

$("#drawerClose").addEventListener("click", closeDrawer);
$("#drawerOverlay").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

// ---- init ----
updateWatchCount();
scan();

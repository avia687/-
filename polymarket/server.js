// Polymarket Trader Scanner — server.
//
// Serves the static frontend and a small JSON API that:
//   1. Scans Polymarket's public leaderboard for profitable traders.
//   2. Ranks/filters them (see src/scanner.js).
//   3. Serves per-trader detail (positions, activity, value).
//
// Live Polymarket data is used when reachable; otherwise it transparently
// falls back to deterministic demo data so the site always works.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTraders, getTraderDetail } from "./src/polymarket.js";
import { scoreTraders, scanTraders } from "./src/scanner.js";
import { getDemoTraders, getDemoTraderDetail } from "./src/demo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4010;

// Force demo data (skip live calls entirely) with DATA_MODE=demo.
const FORCE_DEMO = (process.env.DATA_MODE || "").toLowerCase() === "demo";

// In-memory cache so we don't hammer Polymarket on every page load.
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60_000);
const cache = new Map();

async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.val;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}

// Returns { traders, source } where source is "live" or "demo".
async function loadTraderUniverse(window) {
  if (FORCE_DEMO) return { traders: getDemoTraders(), source: "demo" };
  return cached(`universe:${window}`, CACHE_TTL_MS, async () => {
    try {
      const traders = await getTraders({ window, limit: 100 });
      if (traders.length) return { traders, source: "live" };
      throw new Error("empty live leaderboard");
    } catch (err) {
      console.warn(`[scanner] live leaderboard unavailable, using demo: ${err.message}`);
      return { traders: getDemoTraders(), source: "demo" };
    }
  });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// GET /api/traders — ranked, filtered leaderboard of profitable traders.
app.get("/api/traders", async (req, res) => {
  try {
    const window = ["1d", "7d", "30d", "all"].includes(req.query.window)
      ? req.query.window
      : "all";
    const { traders, source } = await loadTraderUniverse(window);

    // Score on the full universe, then filter/sort/slice for this request.
    scoreTraders(traders);
    const ranked = scanTraders(traders, {
      sort: req.query.sort || "score",
      minProfit: Number(req.query.minProfit) || 0,
      minVolume: Number(req.query.minVolume) || 0,
      minRoi: req.query.minRoi !== undefined ? Number(req.query.minRoi) : -Infinity,
      q: req.query.q || "",
      limit: Number(req.query.limit) || 50,
    });

    res.json({
      source,
      window,
      count: ranked.length,
      totalScanned: traders.length,
      updatedAt: Date.now(),
      traders: ranked,
    });
  } catch (err) {
    console.error("[/api/traders]", err);
    res.status(500).json({ error: "scan_failed", message: err.message });
  }
});

// GET /api/traders/:wallet — detail for one trader.
app.get("/api/traders/:wallet", async (req, res) => {
  const wallet = String(req.params.wallet || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    return res.status(400).json({ error: "bad_wallet" });
  }
  try {
    if (FORCE_DEMO) {
      return res.json({ source: "demo", ...getDemoTraderDetail(wallet) });
    }
    const detail = await cached(`detail:${wallet}`, CACHE_TTL_MS, async () => {
      try {
        const d = await getTraderDetail(wallet);
        if (d.positions.length || d.activity.length || d.totalValue) {
          return { source: "live", ...d };
        }
        throw new Error("empty live detail");
      } catch (err) {
        console.warn(`[scanner] live detail unavailable for ${wallet}: ${err.message}`);
        return { source: "demo", ...getDemoTraderDetail(wallet) };
      }
    });
    res.json(detail);
  } catch (err) {
    console.error("[/api/traders/:wallet]", err);
    res.status(500).json({ error: "detail_failed", message: err.message });
  }
});

// ---------------------------------------------------------------------------
// Static frontend
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Polymarket Trader Scanner running on http://localhost:${PORT}`);
  console.log(`Data mode: ${FORCE_DEMO ? "DEMO (forced)" : "LIVE (with demo fallback)"}`);
});

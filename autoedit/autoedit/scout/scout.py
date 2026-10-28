"""Scout agent: find recent successful (and regular) videos in a niche across platforms.

Success is relative, not raw views:
  views/followers, engagement rate ((likes + 2*comments + 3*shares) / views), view velocity (views/day),
  each turned into a percentile within the niche & platform, plus a recency bonus (<=90 days).
Top quantile -> 'success', bottom quantile -> 'regular' (control group the model learns the difference from).
"""
from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone

import numpy as np

from .. import db, settings
from . import keywords as kw
from .sources import SourceBlocked, all_sources

log = logging.getLogger(__name__)


def _age_days(published_at: str | None) -> float:
    if not published_at:
        return 30.0
    try:
        dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    except ValueError:
        return 30.0
    return max(0.5, (datetime.now(timezone.utc) - dt).total_seconds() / 86400)


def raw_metrics(v: dict) -> dict:
    views = max(1, int(v.get("views") or 0))
    likes, comments, shares = int(v.get("likes") or 0), int(v.get("comments") or 0), int(v.get("shares") or 0)
    followers = v.get("followers")
    age = _age_days(v.get("published_at"))
    return {
        "views_per_follower": views / max(int(followers), 100) if followers else None,
        "engagement": (likes + 2 * comments + 3 * shares) / views,
        "velocity": views / age,
        "age_days": age,
        "views": views,
    }


def _pct_rank(values: list[float | None]) -> list[float | None]:
    arr = [(v, i) for i, v in enumerate(values) if v is not None]
    out: list[float | None] = [None] * len(values)
    if not arr:
        return out
    arr.sort()
    n = len(arr)
    for rank, (_, i) in enumerate(arr):
        out[i] = rank / max(1, n - 1)
    return out


def relabel(niche: str) -> dict:
    """Recompute success scores and labels for every video of the niche, per platform."""
    cfg = settings.load()["scout"]
    vids = db.rows("SELECT * FROM videos WHERE niche=?", (niche,))
    counts = {"success": 0, "regular": 0, "unlabeled": 0}
    by_plat: dict[str, list[dict]] = {}
    for v in vids:
        by_plat.setdefault(v["platform"], []).append(v)
    for plat, group in by_plat.items():
        ms = [raw_metrics(v) for v in group]
        vpf = _pct_rank([m["views_per_follower"] for m in ms])
        eng = _pct_rank([m["engagement"] for m in ms])
        vel = _pct_rank([math.log1p(m["velocity"]) for m in ms])
        scores = []
        for m, a, b, c in zip(ms, vpf, eng, vel):
            parts = [(a, 0.4), (b, 0.3), (c, 0.3)]
            have = [(x, w) for x, w in parts if x is not None]
            s = sum(x * w for x, w in have) / sum(w for _, w in have) if have else 0.0
            recency = 1.0 if m["age_days"] <= cfg["max_age_days"] else 0.85
            scores.append(s * recency)
        hi = float(np.quantile(scores, cfg["success_quantile"])) if len(scores) >= 4 else 2.0
        lo = float(np.quantile(scores, cfg["regular_quantile"])) if len(scores) >= 4 else -1.0
        with db.connect() as con:
            for v, s, m in zip(group, scores, ms):
                if s >= hi and m["views"] >= cfg["min_views"]:
                    label = "success"
                elif s <= lo:
                    label = "regular"
                else:
                    label = None
                counts[label or "unlabeled"] += 1
                con.execute("UPDATE videos SET success_score=?, label=? WHERE id=?", (round(s, 4), label, v["id"]))
    return counts


def run(niche: str, platforms: list[str] | None = None, max_keywords: int | None = None, sources=None) -> dict:
    cfg = settings.load()["scout"]
    platforms = platforms or cfg["platforms"]
    run_id = db.start_run("scout", niche)
    errors: list[str] = []
    kw.ensure_seeded(niche, settings.get("languages", ["he", "en"]))
    picked = kw.pick(niche, max_keywords or cfg["keywords_per_run"])
    sources = sources if sources is not None else all_sources(platforms)
    new = seen = 0
    per_source: dict[str, int] = {}
    for k in picked:
        q = k["keyword"]
        hits = 0
        for src in sources:
            if not src.available():
                continue
            try:
                found = src.search(q, niche, cfg["max_age_days"], cfg["per_keyword"])
            except SourceBlocked as e:
                errors.append(str(e))
                log.warning("source blocked, switching: %s", e)
                continue
            except Exception as e:  # never crash the scout on a single source
                errors.append(f"{src.name}: {e}"[:300])
                log.exception("source %s failed", src.name)
                continue
            for v in found:
                seen += 1
                if db.upsert_video(v):
                    new += 1
                    hits += 1
                    per_source[src.name] = per_source.get(src.name, 0) + 1
        kw.credit(niche, q, hits)
    labels = relabel(niche)
    if labels["success"] >= 5:
        kw.expand_from_successes(niche)
    summary = {"keywords": [k["keyword"] for k in picked], "seen": seen, "new": new, "per_source": per_source, "labels": labels}
    db.finish_run(run_id, "ok" if not errors or new else ("partial" if seen else "failed"), summary, errors)
    return {**summary, "errors": errors}


def top_videos(niche: str, limit: int = 10, days: int | None = None) -> list[dict]:
    sql = ("SELECT v.*, f.why, f.hook_text, f.vector FROM videos v LEFT JOIN features f ON f.video_id=v.id "
           "WHERE v.niche=? AND v.label='success'")
    args: list = [niche]
    if days:
        sql += " AND v.published_at >= datetime('now', ?)"
        args.append(f"-{int(days)} days")
    sql += " ORDER BY v.published_at DESC, v.success_score DESC LIMIT ?"
    args.append(limit)
    out = db.rows(sql, tuple(args))
    for r in out:
        r["metrics"] = raw_metrics(r)
        r["tags"] = json.loads(r["tags"] or "[]")
    return out

"""Feedback loop from my own published videos: register posts, pull stats at 24h / 72h / 7d,
record A/B variants. Stats come from the YouTube Data API (if key), YouTube Analytics (retention,
if OAuth token), or public metadata via yt-dlp for TikTok / Instagram / YouTube."""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from .. import config, db, settings

log = logging.getLogger(__name__)

YT_ID = re.compile(r"(?:v=|/shorts/|youtu\.be/)([\w-]{11})")


def platform_of(url: str) -> str:
    u = url.lower()
    if "tiktok" in u:
        return "tiktok"
    if "instagram" in u:
        return "reels"
    if "/shorts/" in u:
        return "shorts"
    if "youtu" in u:
        return "youtube"
    if "linkedin" in u:
        return "linkedin"
    return "other"


def add_post(url: str, niche: str, plan: dict | None = None, job_id: str | None = None, variant: str | None = None,
             published_at: str | None = None, plan_path: str | None = None) -> int:
    from .features import plan_to_vector

    feats = json.dumps(plan_to_vector(plan)) if plan else None
    pub = published_at or db.now()
    with db.connect() as con:
        con.execute("INSERT OR IGNORE INTO my_posts (url, platform, niche, job_id, variant, plan_path, features, published_at, added_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?)", (url, platform_of(url), niche, job_id, variant, plan_path, feats, pub, db.now()))
        pid = con.execute("SELECT id FROM my_posts WHERE url=?", (url,)).fetchone()[0]
    if job_id:
        db.execute("UPDATE ab_tests SET chosen=?, post_id=? WHERE job_id=?", (variant, pid, job_id))
    return pid


def record_ab(job_id: str, niche: str, platform: str, variants: list[dict]) -> int:
    return db.execute("INSERT INTO ab_tests (job_id, niche, platform, variants, created_at) VALUES (?,?,?,?,?)",
                      (job_id, niche, platform, json.dumps(variants, ensure_ascii=False), db.now()))


def fetch_stats(url: str) -> dict | None:
    m = YT_ID.search(url)
    key = os.environ.get("YOUTUBE_API_KEY")
    if m and key:
        try:
            r = requests.get("https://www.googleapis.com/youtube/v3/videos",
                             params={"part": "statistics", "id": m.group(1), "key": key}, timeout=20)
            items = r.json().get("items", []) if r.ok else []
            if items:
                st = items[0]["statistics"]
                res = {"views": int(st.get("viewCount", 0)), "likes": int(st.get("likeCount", 0)),
                       "comments": int(st.get("commentCount", 0)), "shares": None, "source": "youtube_api"}
                res.update(youtube_retention(m.group(1)) or {})
                return res
        except Exception as e:
            log.warning("YouTube API stats failed: %s", e)
    try:
        import yt_dlp

        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
            info = ydl.extract_info(url, download=False)
        return {"views": info.get("view_count"), "likes": info.get("like_count"), "comments": info.get("comment_count"),
                "shares": info.get("repost_count"), "source": "ytdlp"}
    except Exception as e:
        log.warning("stats unavailable for %s: %s", url, e)
        return None


def youtube_retention(video_id: str) -> dict | None:
    """Average view % from YouTube Analytics API (needs `autoedit auth-youtube` once)."""
    tok_path = config.WORK_DIR / "youtube_oauth.json"
    if not tok_path.exists():
        return None
    tok = json.loads(tok_path.read_text())
    try:
        r = requests.post("https://oauth2.googleapis.com/token", data={
            "client_id": tok["client_id"], "client_secret": tok["client_secret"],
            "refresh_token": tok["refresh_token"], "grant_type": "refresh_token"}, timeout=20)
        access = r.json()["access_token"]
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        q = requests.get("https://youtubeanalytics.googleapis.com/v2/reports", headers={"Authorization": f"Bearer {access}"},
                         params={"ids": "channel==MINE", "startDate": "2020-01-01", "endDate": today,
                                 "metrics": "averageViewPercentage,averageViewDuration,shares", "filters": f"video=={video_id}"},
                         timeout=20).json()
        row = (q.get("rows") or [[None, None, None]])[0]
        return {"retention": (row[0] or 0) / 100 if row[0] is not None else None, "avg_view_sec": row[1], "shares": row[2]}
    except Exception as e:
        log.warning("YouTube Analytics failed: %s", e)
        return None


def due_checkpoints(now: datetime | None = None) -> list[tuple[dict, str]]:
    now = now or datetime.now(timezone.utc)
    hours = settings.get("feedback.checkpoints_hours", [24, 72, 168])
    out = []
    for p in db.rows("SELECT * FROM my_posts"):
        pub = datetime.fromisoformat(p["published_at"].replace("Z", "+00:00"))
        if pub.tzinfo is None:
            pub = pub.replace(tzinfo=timezone.utc)
        for h in hours:
            cp = f"{h}h"
            if now >= pub + timedelta(hours=h) and not db.one("SELECT 1 FROM post_metrics WHERE post_id=? AND checkpoint=?", (p["id"], cp)):
                out.append((p, cp))
    return out


def record(post_id: int, checkpoint: str, stats: dict) -> None:
    db.execute("INSERT OR REPLACE INTO post_metrics (post_id, checkpoint, ts, views, likes, comments, shares, retention, avg_view_sec, source) "
               "VALUES (?,?,?,?,?,?,?,?,?,?)", (post_id, checkpoint, db.now(), stats.get("views"), stats.get("likes"),
                                                stats.get("comments"), stats.get("shares"), stats.get("retention"),
                                                stats.get("avg_view_sec"), stats.get("source")))


def run(fetcher=fetch_stats) -> dict:
    run_id = db.start_run("feedback")
    done, errors = 0, []
    for post, cp in due_checkpoints():
        try:
            st = fetcher(post["url"])
            if st is None:
                errors.append(f"{post['url']}: no stats")
                continue
            record(post["id"], cp, st)
            done += 1
        except Exception as e:
            errors.append(f"{post['url']}: {e}"[:300])
    db.finish_run(run_id, "ok" if not errors else "partial", {"recorded": done}, errors)
    return {"recorded": done, "errors": errors}


def my_performance(niche: str | None = None) -> list[dict]:
    sql = ("SELECT p.id, p.url, p.platform, p.niche, p.variant, p.published_at, m.checkpoint, m.views, m.likes, m.comments, "
           "m.shares, m.retention FROM my_posts p LEFT JOIN post_metrics m ON m.post_id=p.id")
    args: tuple = ()
    if niche:
        sql += " WHERE p.niche=?"
        args = (niche,)
    return db.rows(sql + " ORDER BY p.published_at, m.checkpoint", args)

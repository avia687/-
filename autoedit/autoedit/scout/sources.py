"""Video discovery sources. Each returns normalized video dicts; failures raise SourceBlocked so
the scout can switch to another source instead of crashing.

- YouTubeAPI: official YouTube Data API v3 (search.list + videos.list + channels.list), quota-aware.
- YtDlpSource: yt-dlp searches (YouTube search, TikTok hashtag/search, Instagram hashtag) - best effort,
  public data only, polite delays; platforms change often, so errors are expected and handled.
"""
from __future__ import annotations

import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

import requests

from .. import db, settings

log = logging.getLogger(__name__)


class SourceBlocked(RuntimeError):
    """Quota exhausted, rate-limited, login wall or ToS-protected endpoint."""


def _iso_duration(s: str) -> float:
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return 0.0
    d, h, mi, se = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + se


class Quota:
    def __init__(self, source: str, daily: int):
        self.source, self.daily = source, daily

    def _day(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def used(self) -> int:
        r = db.one("SELECT used, blocked_until FROM quota WHERE source=? AND day=?", (self.source, self._day()))
        return r["used"] if r else 0

    def blocked(self) -> bool:
        r = db.one("SELECT blocked_until FROM quota WHERE source=? AND day=?", (self.source, self._day()))
        return bool(r and r["blocked_until"] and r["blocked_until"] > db.now())

    def spend(self, units: int) -> None:
        if self.used() + units > self.daily:
            raise SourceBlocked(f"{self.source}: daily quota budget reached ({self.daily})")
        db.execute("INSERT INTO quota (source, day, used) VALUES (?,?,?) ON CONFLICT(source, day) DO UPDATE SET used=used+?",
                   (self.source, self._day(), units, units))

    def block(self, hours: float = 24) -> None:
        until = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat(timespec="seconds")
        db.execute("INSERT INTO quota (source, day, used, blocked_until) VALUES (?,?,0,?) ON CONFLICT(source, day) "
                   "DO UPDATE SET blocked_until=?", (self.source, self._day(), until, until))


class YouTubeAPI:
    name = "youtube_api"
    platform = "youtube"
    BASE = os.environ.get("YOUTUBE_API_BASE", "https://www.googleapis.com/youtube/v3")

    def __init__(self, key: str | None = None):
        self.key = key or os.environ.get("YOUTUBE_API_KEY")
        self.quota = Quota(self.name, int(settings.get("scout.youtube_daily_quota", 8000)))
        self.delay = float(settings.get("scout.request_delay_sec", 1.5))

    def available(self) -> bool:
        return bool(self.key) and not self.quota.blocked()

    def _get(self, endpoint: str, params: dict, cost: int) -> dict:
        self.quota.spend(cost)
        for attempt in range(3):
            r = requests.get(f"{self.BASE}/{endpoint}", params={**params, "key": self.key}, timeout=30)
            if r.status_code == 200:
                time.sleep(self.delay * 0.2)
                return r.json()
            if r.status_code == 403 and "quota" in r.text.lower():
                self.quota.block(24)
                raise SourceBlocked("YouTube API quota exceeded")
            if r.status_code in (403, 400, 401):
                raise SourceBlocked(f"YouTube API {r.status_code}: {r.text[:200]}")
            time.sleep(2 ** attempt * self.delay)
        raise SourceBlocked(f"YouTube API unavailable ({r.status_code})")

    def search(self, query: str, niche: str, max_age_days: int, limit: int, shorts: bool = True,
               lang: str | None = None) -> list[dict]:
        after = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        params = {"part": "snippet", "q": query, "type": "video", "order": "viewCount", "publishedAfter": after,
                  "maxResults": min(50, limit), "safeSearch": "moderate"}
        if shorts:
            params["videoDuration"] = "short"
        if lang:
            params["relevanceLanguage"] = lang
        res = self._get("search", params, 100)
        ids = [it["id"]["videoId"] for it in res.get("items", []) if it.get("id", {}).get("videoId")]
        if not ids:
            return []
        vids = self._get("videos", {"part": "snippet,statistics,contentDetails", "id": ",".join(ids)}, 1)
        chan_ids = list({v["snippet"]["channelId"] for v in vids.get("items", [])})
        subs = {}
        if chan_ids:
            ch = self._get("channels", {"part": "statistics", "id": ",".join(chan_ids[:50])}, 1)
            subs = {c["id"]: int(c["statistics"].get("subscriberCount", 0) or 0) for c in ch.get("items", [])}
        out = []
        for v in vids.get("items", []):
            st, sn = v.get("statistics", {}), v["snippet"]
            dur = _iso_duration(v.get("contentDetails", {}).get("duration"))
            out.append({
                "id": f"youtube:{v['id']}", "platform": "shorts" if dur <= 60 else "youtube",
                "url": f"https://www.youtube.com/watch?v={v['id']}" if dur > 60 else f"https://www.youtube.com/shorts/{v['id']}",
                "niche": niche, "title": sn.get("title"), "description": (sn.get("description") or "")[:2000],
                "channel_id": sn.get("channelId"), "channel_title": sn.get("channelTitle"),
                "followers": subs.get(sn.get("channelId")), "views": int(st.get("viewCount", 0) or 0),
                "likes": int(st.get("likeCount", 0) or 0), "comments": int(st.get("commentCount", 0) or 0),
                "shares": None, "duration": dur, "published_at": sn.get("publishedAt"), "fetched_at": db.now(),
                "query": query, "source": self.name, "tags": sn.get("tags", [])[:20],
            })
        return out

    def stats(self, video_ids: list[str]) -> dict[str, dict]:
        res = self._get("videos", {"part": "statistics", "id": ",".join(video_ids[:50])}, 1)
        return {v["id"]: {k: int(v["statistics"].get(f"{k[:-1]}Count", 0) or 0) if k != "views" else
                          int(v["statistics"].get("viewCount", 0) or 0) for k in ("views", "likes", "comments")}
                for v in res.get("items", [])}


class YtDlpSource:
    """yt-dlp powered discovery (no API key). Public metadata only, with polite pacing."""

    def __init__(self, platform: str):
        self.platform = platform
        self.name = f"ytdlp_{platform}"
        self.quota = Quota(self.name, 400)
        self.delay = float(settings.get("scout.request_delay_sec", 1.5))

    def available(self) -> bool:
        return not self.quota.blocked()

    def _targets(self, query: str, limit: int) -> list[str]:
        q = query.lstrip("#")
        if self.platform == "youtube":
            return [f"ytsearch{limit}:{query} #shorts"]
        if self.platform == "tiktok":
            if query.startswith("#"):
                return [f"https://www.tiktok.com/tag/{q}"]
            return [f"https://www.tiktok.com/search?q={requests.utils.quote(query)}"]
        if self.platform == "instagram":
            return [f"https://www.instagram.com/explore/tags/{re.sub(r'[^\\w]', '', q)}/"]
        return []

    def search(self, query: str, niche: str, max_age_days: int, limit: int, **_) -> list[dict]:
        import yt_dlp

        out = []
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
        opts = {"quiet": True, "no_warnings": True, "skip_download": True, "extract_flat": "in_playlist",
                "playlistend": limit, "socket_timeout": 20, "retries": 2, "sleep_interval_requests": self.delay}
        for target in self._targets(query, limit):
            self.quota.spend(1)
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(target, download=False)
            except Exception as e:
                msg = str(e).lower()
                if any(s in msg for s in ("login", "429", "rate", "blocked", "403", "unsupported url", "captcha")):
                    self.quota.block(12)
                raise SourceBlocked(f"{self.name}: {str(e)[:200]}") from e
            entries = (info or {}).get("entries") or []
            for e in entries[:limit]:
                if not e:
                    continue
                full = e
                if e.get("view_count") is None and e.get("url"):
                    try:
                        with yt_dlp.YoutubeDL({**opts, "extract_flat": False}) as ydl:
                            full = ydl.extract_info(e["url"], download=False)
                        time.sleep(self.delay)
                    except Exception:
                        continue
                ts = full.get("timestamp") or 0
                up = full.get("upload_date")
                pub = datetime.fromtimestamp(ts, timezone.utc) if ts else (
                    datetime.strptime(up, "%Y%m%d").replace(tzinfo=timezone.utc) if up else None)
                if pub and pub < cutoff:
                    continue
                vid = full.get("id") or e.get("id")
                plat = "shorts" if self.platform == "youtube" and (full.get("duration") or 0) <= 60 else (
                    "reels" if self.platform == "instagram" else self.platform)
                out.append({
                    "id": f"{self.platform}:{vid}", "platform": plat, "url": full.get("webpage_url") or e.get("url"),
                    "niche": niche, "title": full.get("title"), "description": (full.get("description") or "")[:2000],
                    "channel_id": full.get("channel_id") or full.get("uploader_id"),
                    "channel_title": full.get("channel") or full.get("uploader"),
                    "followers": full.get("channel_follower_count"), "views": full.get("view_count"),
                    "likes": full.get("like_count"), "comments": full.get("comment_count"), "shares": full.get("repost_count"),
                    "duration": full.get("duration"), "published_at": pub.isoformat() if pub else None,
                    "fetched_at": db.now(), "query": query, "source": self.name, "tags": (full.get("tags") or [])[:20],
                })
        return out


def all_sources(platforms: list[str]) -> list:
    srcs = []
    if "youtube" in platforms or "shorts" in platforms:
        srcs.append(YouTubeAPI())
        srcs.append(YtDlpSource("youtube"))
    if "tiktok" in platforms:
        srcs.append(YtDlpSource("tiktok"))
    if "instagram" in platforms or "reels" in platforms:
        srcs.append(YtDlpSource("instagram"))
    return srcs

"""Stock B-roll from free libraries (Pexels, Pixabay APIs) with a local cache, falling back to
the user's own library in assets/broll/<niche>/."""
from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path

import requests

from .. import config

log = logging.getLogger(__name__)


def _cache_dir() -> Path:
    d = config.WORK_DIR / "broll_cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _download(url: str, dest: Path) -> Path | None:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    try:
        with requests.get(url, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(1 << 16):
                    f.write(chunk)
        return dest
    except Exception as e:
        log.warning("b-roll download failed: %s", e)
        dest.unlink(missing_ok=True)
        return None


def pexels(query: str, portrait: bool) -> Path | None:
    key = os.environ.get("PEXELS_API_KEY")
    if not key:
        return None
    try:
        r = requests.get("https://api.pexels.com/videos/search", headers={"Authorization": key},
                         params={"query": query, "per_page": 8, "orientation": "portrait" if portrait else "landscape",
                                 "size": "medium"}, timeout=30)
        r.raise_for_status()
        for v in r.json().get("videos", []):
            files = sorted([f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4" and (f.get("height") or 0) >= 720],
                           key=lambda f: abs((f.get("height") or 0) - (1920 if portrait else 1080)))
            if files and 2 <= (v.get("duration") or 0) <= 40:
                return _download(files[0]["link"], _cache_dir() / f"pexels_{v['id']}.mp4")
    except Exception as e:
        log.warning("Pexels search failed: %s", e)
    return None


def pixabay(query: str, portrait: bool) -> Path | None:
    key = os.environ.get("PIXABAY_API_KEY")
    if not key:
        return None
    try:
        r = requests.get("https://pixabay.com/api/videos/", params={"key": key, "q": query, "per_page": 8, "safesearch": "true"},
                         timeout=30)
        r.raise_for_status()
        for h in r.json().get("hits", []):
            vids = h.get("videos", {})
            best = vids.get("large") or vids.get("medium")
            if best and best.get("url"):
                return _download(best["url"], _cache_dir() / f"pixabay_{h['id']}.mp4")
    except Exception as e:
        log.warning("Pixabay search failed: %s", e)
    return None


def local(query: str, niche: str) -> Path | None:
    d = config.BROLL_DIR / niche
    files = [p for p in (list(d.glob("*")) if d.exists() else []) + list(config.BROLL_DIR.glob("*"))
             if p.suffix.lower() in (".mp4", ".mov", ".jpg", ".jpeg", ".png", ".webm")]
    if not files:
        return None
    q = set(query.lower().split())
    scored = sorted(files, key=lambda p: -len(q & set(p.stem.lower().replace("-", " ").replace("_", " ").split())))
    if q & set(scored[0].stem.lower().replace("-", " ").replace("_", " ").split()):
        return scored[0]
    return files[int(hashlib.md5(query.encode()).hexdigest(), 16) % len(files)]


def find(query: str, niche: str, portrait: bool = True) -> dict | None:
    for name, fn in (("pexels", lambda: pexels(query, portrait)), ("pixabay", lambda: pixabay(query, portrait)),
                     ("local", lambda: local(query, niche))):
        p = fn()
        if p:
            return {"path": str(p), "source": name, "query": query}
    return None

"""Smart export: one EDL -> every platform (length, aspect and pacing adapted), rendered straight from the
sources (single encode, no double compression), H.264/H.265 with per-platform bitrate; 3 thumbnails;
title / description / hashtags per platform; optional scheduling via Metricool."""
from __future__ import annotations

import copy
import json
import logging
import os
from pathlib import Path

import cv2
import numpy as np
import requests

from .. import config, db, llm, timeline
from ..render import render
from . import motion

log = logging.getLogger(__name__)

ENCODE = {
    "tiktok": {"vcodec": "libx264", "crf": 17, "maxrate": "16M", "bufsize": "32M", "abitrate": "192k"},
    "reels": {"vcodec": "libx264", "crf": 18, "maxrate": "12M", "bufsize": "24M", "abitrate": "192k"},
    "shorts": {"vcodec": "libx264", "crf": 17, "maxrate": "16M", "bufsize": "32M", "abitrate": "192k"},
    "facebook": {"vcodec": "libx264", "crf": 18, "maxrate": "12M", "bufsize": "24M", "abitrate": "192k"},
    "youtube": {"vcodec": "libx264", "crf": 17, "maxrate": "20M", "bufsize": "40M", "abitrate": "256k"},
    "linkedin": {"vcodec": "libx264", "crf": 19, "maxrate": "10M", "bufsize": "20M", "abitrate": "192k"},
}


def adapt(plan: dict, platform: str) -> dict:
    """Same edit, re-targeted: aspect & safe areas, max length (trim body before the payoff)."""
    p = copy.deepcopy(plan)
    spec = config.PLATFORMS[platform]
    W, H = config.ASPECTS[spec["aspect"]]
    p["meta"].update({"platform": platform, "aspect": spec["aspect"], "width": W, "height": H})
    total = timeline.total_duration(p)
    limit = spec["max_duration"]
    while total > limit and len(p["clips"]) > 3:
        k = len(p["clips"]) - 2  # keep the ending; remove the last body clip
        removed = (p["clips"][k]["out"] - p["clips"][k]["in"]) / p["clips"][k].get("speed", 1.0)
        p["clips"].pop(k)
        p["transitions"] = [t for t in p["transitions"] if t["after_clip"] < k - 1 or t["after_clip"] > k]
        for t in p["transitions"]:
            if t["after_clip"] > k:
                t["after_clip"] -= 1
        total -= removed
        for g in p.get("graphics", []):
            if g["start"] > timeline.total_duration(p) - 0.5:
                g["start"] = max(0, g["start"] - removed)
                g["end"] = max(g["start"] + 0.5, g["end"] - removed)
    return p


def export_all(plan: dict, out_dir: Path, platforms: list[str], codec: str = "h264", progress=None) -> list[dict]:
    progress = progress or (lambda f, m: None)
    out_dir.mkdir(parents=True, exist_ok=True)
    res = []
    for k, plat in enumerate(platforms):
        p = adapt(plan, plat)
        enc = dict(ENCODE[plat])
        if codec == "h265":
            enc["vcodec"] = "libx265"
            enc["crf"] = enc["crf"] + 4
        from .enhance import capabilities

        if codec == "h264" and capabilities().get("nvenc"):
            enc = {**enc, "vcodec": "h264_nvenc", "bitrate": enc["maxrate"]}
        out = out_dir / f"{plat}.mp4"
        render(p, out, out_dir / f"w_{plat}", encoder=enc,
               progress=lambda f, m, k=k: progress((k + f) / len(platforms), f"{plat}: {m}"))
        res.append({"platform": plat, "path": str(out), "aspect": p["meta"]["aspect"],
                    "duration": round(timeline.total_duration(p), 2)})
    return res


# ------------------------------------------------------------------ thumbnails
def thumbnails(plan: dict, video: str, out_dir: Path, n: int = 3) -> list[str]:
    """Pick frames with a sharp, expressive face (or the most striking frame) and add a bold title."""
    out_dir.mkdir(parents=True, exist_ok=True)
    from .ingest import faces_and_emotion, sharpness

    cap = cv2.VideoCapture(video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cands = []
    for i in np.linspace(total * 0.08, total * 0.85, 16).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
        ok, f = cap.read()
        if not ok:
            continue
        g = cv2.cvtColor(cv2.resize(f, (360, int(360 * f.shape[0] / f.shape[1]))), cv2.COLOR_BGR2GRAY)
        fe = faces_and_emotion(f)
        hsv = cv2.cvtColor(cv2.resize(f, (160, 160)), cv2.COLOR_BGR2HSV)
        s = (np.log1p(sharpness(g)) / 6 + fe["faces"] * 0.4 + fe["expressive"] * 1.2 + hsv[..., 1].mean() / 255
             - abs(g.mean() / 255 - 0.5))
        cands.append((s, i / fps, f))
    cap.release()
    cands.sort(key=lambda x: -x[0])
    picked, times = [], []
    for s, t, f in cands:
        if all(abs(t - u) > 1.5 for u in times):
            picked.append(f)
            times.append(t)
        if len(picked) >= n:
            break
    concept = plan.get("meta", {}).get("concept", {})
    titles = [concept.get("title") or plan.get("title", {}).get("text") or ""]
    titles += [plan.get("title", {}).get("text") or "", concept.get("cta") or ""]
    brand = plan.get("brand") or {}
    accent = brand.get("accent_color") or plan.get("captions", {}).get("highlight_color", "#FFE14D")
    paths = []
    for k, f in enumerate(picked):
        H, W = f.shape[:2]
        f = cv2.convertScaleAbs(f, alpha=1.12, beta=6)  # thumbnails want extra punch
        grad = np.linspace(0, 0.65, H // 2, dtype=np.float32)[:, None, None]
        f[H // 2:] = (f[H // 2:] * (1 - grad)).astype(np.uint8)
        text = (titles[k % len(titles)] or titles[0]).strip()
        if text:
            from ..captions import wrap_words
            from ..overlays import blit, hex_bgr

            size = int(H * 0.075)
            y = int(H * 0.72)
            for ln in wrap_words(text.split(), 12 if H > W else 22):
                b, g_, r = hex_bgr(accent)
                im = motion.text_rgba(" ".join(ln), "Heebo Black", size, fill=(20, 20, 20, 255), box=(r, g_, b, 255))
                blit(f, im, W // 2, y)
                y += int(im.shape[0] * 1.05)
        p = out_dir / f"thumb_{k + 1}.jpg"
        cv2.imwrite(str(p), f, [cv2.IMWRITE_JPEG_QUALITY, 92])
        paths.append(str(p))
    return paths


# ------------------------------------------------------------------ metadata
META_SCHEMA = {
    "type": "object",
    "properties": {p: {"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"},
                                                         "hashtags": {"type": "array", "items": {"type": "string"}}},
                       "required": ["title", "description", "hashtags"], "additionalProperties": False}
                   for p in ("tiktok", "reels", "shorts", "youtube", "linkedin", "facebook")},
    "required": ["tiktok", "reels", "shorts", "youtube", "linkedin", "facebook"],
    "additionalProperties": False,
}


def metadata(plan: dict, info: dict) -> dict:
    niche = info.get("niche", "business")
    lang = info.get("language", "he")
    tags = [r["keyword"] for r in db.rows("SELECT keyword FROM keywords WHERE niche=? AND kind='hashtag' ORDER BY hits DESC LIMIT 8", (niche,))]
    from ..scout.keywords import SEEDS

    tags += [k for k in SEEDS.get(niche, {}).get(lang, []) + SEEDS.get(niche, {}).get("en", []) if k.startswith("#")]
    tags = list(dict.fromkeys(tags))[:10]
    words = " ".join(w["text"] for w in timeline.output_words(plan))[:1500]
    if llm.available():
        res = llm.ask_json(
            "You write native, high-performing post copy for each social platform (Hebrew stays Hebrew).",
            f"Video concept: {json.dumps(info, ensure_ascii=False)}\nSpoken words: {words!r}\nKnown good hashtags: {tags}\n"
            "Write a title, a description and 3-8 hashtags for each platform, following each platform's conventions "
            "(TikTok: short hooky caption; YouTube: searchable title + 2-line description; LinkedIn: professional insight).",
            META_SCHEMA, effort="low")
        if res:
            return res
    title = info.get("title") or ""
    cta = info.get("cta") or ""
    story = info.get("story") or words[:140]
    base = {"title": title, "description": f"{story}\n{cta}".strip(), "hashtags": tags[:6]}
    return {"tiktok": {**base, "description": f"{title} {cta}".strip()},
            "reels": base, "shorts": {**base, "hashtags": (tags[:4] + ["#shorts"])},
            "youtube": {**base, "title": f"{title} | {niche}" if title else niche},
            "linkedin": {**base, "hashtags": tags[:3]}, "facebook": base}


# ------------------------------------------------------------------ scheduling
def schedule_metricool(video_url: str, text: str, when_iso: str, networks: list[str]) -> dict:
    """Schedule a post through Metricool's API (needs METRICOOL_API_TOKEN, METRICOOL_USER_ID, METRICOOL_BLOG_ID).
    The video must be reachable by URL (e.g. uploaded to your Drive / CDN)."""
    tok, uid, blog = (os.environ.get(k) for k in ("METRICOOL_API_TOKEN", "METRICOOL_USER_ID", "METRICOOL_BLOG_ID"))
    if not (tok and uid and blog):
        return {"ok": False, "error": "Metricool keys missing (METRICOOL_API_TOKEN / METRICOOL_USER_ID / METRICOOL_BLOG_ID)"}
    body = {"publicationDate": {"dateTime": when_iso, "timezone": "Asia/Jerusalem"}, "text": text,
            "providers": [{"network": n} for n in networks], "media": [video_url], "autoPublish": True}
    try:
        r = requests.post("https://app.metricool.com/api/v2/scheduler/posts", params={"userId": uid, "blogId": blog},
                          headers={"X-Mc-Auth": tok, "Content-Type": "application/json"}, json=body, timeout=30)
        return {"ok": r.ok, "status": r.status_code, "response": r.text[:500]}
    except Exception as e:
        return {"ok": False, "error": str(e)}

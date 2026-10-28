"""Feature extraction for the learner: analyze scouted videos, and map our own edit plans
into the same feature space so the trained model can score edits before export."""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

from .. import config, db, settings
from ..style import analyze

log = logging.getLogger(__name__)

HOOK_TYPES = ["bold_claim", "question", "number_list", "pattern_interrupt", "negative", "story", "visual", "curiosity_gap"]
LOOKS = ["punchy", "warm", "bright_clean", "cinematic", "neutral"]

# style features the editor can actually act on -> where they live in a style profile
ACTIONABLE = {
    "avg_shot_sec": ("pacing", "avg_shot_sec"),
    "cuts_per_min": ("pacing", "cuts_per_min"),
    "words_per_sec": ("pacing", "words_per_sec"),
    "first_cut_sec": ("hook", "first_cut_sec"),
    "caption_position": ("captions", "position"),
    "punch_in_per_min": ("zoom", "punch_in_per_min"),
    "transitions_per_min": ("transitions", "per_min"),
    "music_bpm": ("music", "bpm"),
    "sfx_per_min": ("sfx", "per_min"),
    "sfx_on_cuts": ("sfx", "on_cuts"),
    "broll_ratio": ("broll", "ratio"),
    "duration": ("structure", "avg_duration"),
}


def collect(niche: str, limit: int | None = None) -> dict:
    """Download + analyze labeled videos that have no features yet."""
    cfg = settings.load()["scout"]
    limit = limit or cfg["analyze_per_run"]
    todo = db.rows("SELECT * FROM videos WHERE niche=? AND label IS NOT NULL AND status='new' "
                   "ORDER BY (label='success') DESC, success_score DESC LIMIT ?", (niche, limit))
    done, failed = 0, []
    dl_dir = config.WORK_DIR / "scouted" / niche
    for v in todo:
        try:
            if v["url"].startswith(("http://", "https://")):
                path, _ = analyze.download(v["url"], dl_dir)
            else:
                path = Path(v["url"])
            res = analyze.analyze_video(str(path), {"webpage_url": v["url"]})
            store(v["id"], niche, res)
            db.execute("UPDATE videos SET status='analyzed', error=NULL WHERE id=?", (v["id"],))
            done += 1
            if not cfg["keep_media"] and v["url"].startswith("http"):
                Path(path).unlink(missing_ok=True)
        except Exception as e:
            log.warning("analysis failed for %s: %s", v["id"], e)
            db.execute("UPDATE videos SET status='failed', error=? WHERE id=?", (str(e)[:500], v["id"]))
            failed.append(f"{v['id']}: {str(e)[:200]}")
    if not cfg["keep_media"]:
        shutil.rmtree(dl_dir, ignore_errors=True)
    return {"analyzed": done, "failed": failed}


def store(video_id: str, niche: str, res: dict) -> None:
    p = res["profile"]
    db.execute("INSERT OR REPLACE INTO features (video_id, niche, vector, profile, hook_text, transcript, topic, why, analyzed_at) "
               "VALUES (?,?,?,?,?,?,?,?,?)",
               (video_id, niche, json.dumps(res["features"]), json.dumps(p, ensure_ascii=False), res.get("hook_text", ""),
                res.get("transcript_text", "")[:6000], json.dumps(p.get("topic", []), ensure_ascii=False),
                p.get("why_it_works"), db.now()))


def plan_to_vector(plan: dict) -> dict:
    """Map an edit plan to the learner's feature space."""
    from ..score import plan_features

    f = plan_features(plan)
    meta = plan.get("meta", {})
    color = plan.get("color", {})
    vec = {
        "duration": f["duration"], "avg_shot_sec": f["avg_shot_sec"], "cuts_per_min": f["cuts_per_min"],
        "words_per_sec": f["words_per_sec"], "first_cut_sec": f["first_change_sec"],
        "caption_presence": 1.0 if f["captions"] else 0.0,
        "caption_position": float(plan.get("captions", {}).get("position", 0.64)),
        "punch_in_per_min": f["punch_per_min"],
        "transitions_per_min": len([t for t in plan.get("transitions", []) if t.get("type") != "cut"]) / max(f["duration"] / 60, 1e-6),
        "music_present": 1.0 if f["music"] else 0.0, "music_bpm": float(plan.get("music", {}).get("bpm") or 0),
        "sfx_per_min": f["sfx_per_min"], "sfx_on_cuts": len([t for t in plan.get("transitions", []) if t.get("sfx")]) / max(1, len(plan.get("clips", [])) - 1),
        "broll_ratio": f["broll_ratio"], "face_ratio": 0.8,
        "saturation": 0.36 * float(color.get("saturation", 1.0)), "brightness": 0.42 * float(color.get("brightness", 0.5)) / 0.5,
        "contrast": 0.3 * float(color.get("contrast", 0.55)), "warmth": float(color.get("warmth", 0.0)),
        "has_cta": 1.0 if f["has_cta"] else 0.0, "vertical": 1.0 if meta.get("height", 1920) > meta.get("width", 1080) else 0.0,
        "text_overlay_hook": 1.0 if f["has_title"] else 0.0,
    }
    for h in HOOK_TYPES:
        vec[f"hook_{h}"] = float(meta.get("hook_type") == h)
    look = color.get("look", "neutral")
    for lk in LOOKS:
        vec[f"look_{lk}"] = float(look == lk)
    return vec


def dataset(niche: str, platform: str | None = None) -> tuple[list[dict], list[int], list[float], list[str]]:
    """X (dicts), y (1=success), sample weights, ids. Includes my own posts with extra weight."""
    sql = ("SELECT v.id, v.label, v.success_score, v.platform, f.vector FROM videos v JOIN features f ON f.video_id=v.id "
           "WHERE v.niche=? AND v.label IN ('success','regular')")
    args: list = [niche]
    if platform:
        sql += " AND v.platform=?"
        args.append(platform)
    X, y, w, ids = [], [], [], []
    for r in db.rows(sql, tuple(args)):
        X.append(json.loads(r["vector"]))
        y.append(1 if r["label"] == "success" else 0)
        w.append(1.0)
        ids.append(r["id"])
    mine = my_posts_dataset(niche)
    mw = float(settings.get("learn.my_posts_weight", 3.0))
    for vec, label, pid in mine:
        X.append(vec)
        y.append(label)
        w.append(mw)
        ids.append(f"mine:{pid}")
    return X, y, w, ids


def my_posts_dataset(niche: str) -> list[tuple[dict, int, int]]:
    """My published edits, labelled against my own baseline (above my median velocity = success)."""
    posts = db.rows("SELECT * FROM my_posts WHERE niche=? AND features IS NOT NULL", (niche,))
    perf = []
    for p in posts:
        m = db.one("SELECT * FROM post_metrics WHERE post_id=? ORDER BY ts DESC LIMIT 1", (p["id"],))
        if not m or not m["views"]:
            continue
        eng = ((m["likes"] or 0) + 2 * (m["comments"] or 0) + 3 * (m["shares"] or 0)) / max(1, m["views"])
        ret = m["retention"] if m["retention"] is not None else 0.5
        perf.append((p, m["views"], eng, ret))
    if len(perf) < 4:
        return []
    import numpy as np

    v_med = float(np.median([x[1] for x in perf]))
    e_med = float(np.median([x[2] for x in perf]))
    out = []
    for p, views, eng, ret in perf:
        score = 0.5 * (views >= v_med) + 0.3 * (eng >= e_med) + 0.2 * (ret >= 0.5)
        out.append((json.loads(p["features"]), 1 if score >= 0.5 else 0, p["id"]))
    return out

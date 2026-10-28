"""Critic agent: watches a rendered draft and scores it against the editorial rulebook
(hook, retention, pacing, technical quality, sound, readability, payoff, restraint). Every failed check
comes with a concrete fix the Director can apply. With Claude available, a vision review of a contact
sheet of the draft is blended in."""
from __future__ import annotations

import base64
import json
import logging
import re
import tempfile
from pathlib import Path

import cv2
import numpy as np

from .. import config, llm, timeline
from ..media import run

log = logging.getLogger(__name__)
PRINCIPLES = (Path(__file__).with_name("editing_principles.md")).read_text(encoding="utf-8")


def _frames(path: str, fps: float = 2.0, width: int = 270) -> list[tuple[float, np.ndarray]]:
    cap = cv2.VideoCapture(path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, int(round(src_fps / fps)))
    out, i = [], 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, f = cap.retrieve()
            if ok:
                out.append((i / src_fps, cv2.resize(f, (width, int(width * f.shape[0] / f.shape[1])))))
        i += 1
    cap.release()
    return out


def _loudness(path: str) -> dict:
    try:
        err = run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], quiet=False).stderr
        i_val = float(re.search(r"I:\s+(-?[\d.]+) LUFS", err.split("Summary:")[-1]).group(1))
        tp = re.search(r"Peak:\s+(-?[\d.]+) dBFS", err.split("Summary:")[-1])
        return {"lufs": i_val, "true_peak": float(tp.group(1)) if tp else None}
    except Exception:
        return {"lufs": None, "true_peak": None}


def _silences(path: str, min_len: float = 1.2) -> list[tuple[float, float]]:
    try:
        err = run(["ffmpeg", "-hide_banner", "-i", path, "-af", f"silencedetect=n=-45dB:d={min_len}", "-f", "null", "-"],
                  quiet=False).stderr
    except Exception:
        return []
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: (-?[\d.]+)", err)]
    return list(zip(starts, ends))


def visual_changes(plan: dict) -> list[float]:
    lay = timeline.layout(plan)
    ow = timeline.output_words(plan, lay)
    ch = [c["t0"] for c in lay[1:]]
    ch += [t for p in plan.get("punch", []) if (t := timeline.word_time(ow, p["word"])) is not None]
    ch += [t for b in plan.get("broll", []) if "word" in b and (t := timeline.word_time(ow, b["word"])) is not None]
    ch += [g["start"] for g in plan.get("graphics", [])]
    if plan.get("title", {}).get("text"):
        ch.append(0.0)
    ch += [t for e in plan.get("emojis", []) if (t := timeline.word_time(ow, e["word"])) is not None]
    return sorted(set(round(x, 2) for x in ch))


def critique(plan: dict, video: str, profile: dict) -> dict:
    meta = plan["meta"]
    lay = timeline.layout(plan)
    dur = lay[-1]["t1"]
    spec = config.PLATFORMS.get(meta.get("platform", "tiktok"), config.PLATFORMS["tiktok"])
    mode = meta.get("mode", "aroll")
    checks, fixes = [], []

    def add(key, weight, score, note, fix=None):
        checks.append({"key": key, "weight": weight, "score": float(np.clip(score, 0, 1)), "note": note})
        if fix and score < 0.8:
            fixes.append(fix)

    frames = _frames(video)
    lum = np.array([f.mean() / 255 for _, f in frames]) if frames else np.array([0.5])
    sharp = np.array([cv2.Laplacian(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() for _, f in frames]) if frames else np.array([100])
    changes = visual_changes(plan)

    # 1. hook ---------------------------------------------------------------
    first_change = min([c for c in changes if c > 0.0] or [dur])
    has_text = bool(plan.get("title", {}).get("text")) or any(g["type"] == "kinetic_title" and g["start"] < 0.6 for g in plan.get("graphics", []))
    opener = lay[0] if lay else {}
    weak_open = opener.get("brand") == "intro" or opener.get("fade_in")
    hook_score = 0.45 * has_text + 0.35 * (first_change <= 3.0) + 0.2 * (not weak_open)
    add("hook", 20, hook_score, "פתיחה חזקה: טקסט על המסך ושינוי ויזואלי ב-3 השניות הראשונות, בלי לוגו או פתיח איטי",
        {"op": "strengthen_hook"})
    # 2. retention / stagnation ---------------------------------------------
    pts = [0.0] + changes + [dur]
    gaps = np.diff(sorted(set(pts)))
    longest = float(gaps.max()) if len(gaps) else dur
    allowed = max(3.0, 1.9 * float(profile.get("pacing", {}).get("avg_shot_sec", 2.2)))
    add("retention", 15, 1.0 if longest <= allowed else allowed / longest,
        f"קטע הכי ארוך בלי שינוי ויזואלי: {longest:.1f} שנ' (מותר עד {allowed:.1f})",
        {"op": "break_stagnation", "max_gap": allowed})
    # 3. pacing ---------------------------------------------------------------
    from .director import PACE

    target = float(profile.get("pacing", {}).get("avg_shot_sec", 2.2))
    if mode == "montage":
        target = min(3.0, target * PACE.get(meta.get("concept", {}).get("content_type") or "high_energy", 1.0))
    shots = [c["t0"] for c in lay[1:]] + [t for p in plan.get("punch", []) for t in [p.get("word")] if t is not None]
    shots += [b.get("word") for b in plan.get("broll", []) if b.get("word") is not None]
    avg_shot = dur / max(1, len(shots) + 1)
    pace = float(np.exp(-((np.log(avg_shot / target)) ** 2) / 0.5))
    add("pacing", 12, pace, f"קצב: שינוי כל {avg_shot:.1f} שנ' (יעד הנישה {target:.1f})",
        {"op": "faster" if avg_shot > target else "slower"})
    # 4. technical image quality ---------------------------------------------
    black = float(np.mean(lum < 0.04))
    frozen = 0.0
    if len(frames) > 3 and mode == "aroll":
        diffs = [np.abs(frames[i][1].astype(np.int16) - frames[i - 1][1]).mean() for i in range(1, len(frames))]
        frozen = float(np.mean(np.array(diffs) < 0.3))
    expo = float(np.mean((lum > 0.12) & (lum < 0.85)))
    rel_sharp = float(np.mean(sharp > 25))
    tech = 0.35 * expo + 0.35 * rel_sharp + 0.3 * (1 - min(1.0, 4 * black + 2 * frozen))
    bad = [k for k, c in enumerate(lay) if any(abs(t - (c["t0"] + c["t1"]) / 2) < (c["t1"] - c["t0"]) / 2 and (l < 0.04 or s < 12)
                                                for (t, _), l, s in zip(frames, lum, sharp))]
    add("technical", 15, tech, f"חשיפה תקינה ב-{expo:.0%} מהפריימים, חדות ב-{rel_sharp:.0%}, פריימים שחורים {black:.0%}",
        {"op": "drop_bad_shots", "clips": bad[:3]} if bad else None)
    # 5. sound ---------------------------------------------------------------
    ld = _loudness(video)
    lufs_ok = 1.0 if ld["lufs"] is None else float(np.exp(-((ld["lufs"] - spec["lufs"]) / 2.0) ** 2))
    peak_ok = 1.0 if (ld["true_peak"] is None or ld["true_peak"] <= -0.5) else 0.6
    sil = _silences(video)
    sound = 0.5 * lufs_ok + 0.2 * peak_ok + 0.3 * (1.0 if not sil else max(0.0, 1 - 0.3 * len(sil)))
    add("sound", 12, sound, f"עוצמה {ld['lufs']} LUFS (יעד {spec['lufs']}), שתיקות ארוכות: {len(sil)}",
        {"op": "fix_audio", "silences": sil[:5]})
    # 6. readability ---------------------------------------------------------
    words = timeline.output_words(plan, lay)
    has_speech = len(words) > 3
    cap_on = plan.get("captions", {}).get("enabled", True)
    read = 1.0 if (not has_speech or cap_on) else 0.0
    add("captions", 8, read, "כתוביות קריאות כשיש דיבור (רוב הצפיות בלי קול)", {"op": "captions_on"})
    # 7. payoff ---------------------------------------------------------------
    pay = bool(plan.get("cta", {}).get("text")) or any(g["type"] == "end_card" for g in plan.get("graphics", []))
    add("payoff", 8, 1.0 if pay else 0.0, "סיום עם payoff וקריאה לפעולה", {"op": "add_cta"})
    # 8. restraint: every effect needs a reason --------------------------------
    n_tr = len([t for t in plan.get("transitions", []) if t.get("type") not in ("cut", None)])
    tr_per_min = n_tr / max(dur / 60, 1e-6)
    tr_cap = max(4.0, float(profile.get("transitions", {}).get("per_min", 4)) * 1.6)
    n_sfx = len([t for t in plan.get("transitions", []) if t.get("sfx")]) + len(plan.get("emojis", []))
    sfx_cap = max(6.0, float(profile.get("sfx", {}).get("per_min", 7)) * 1.6)
    restraint = 0.5 * min(1.0, tr_cap / max(tr_per_min, 1e-6)) + 0.5 * min(1.0, sfx_cap / max(n_sfx / max(dur / 60, 1e-6), 1e-6))
    add("restraint", 10, restraint, f"{tr_per_min:.1f} מעברים לדקה - אפקט רק כשיש לו סיבה", {"op": "reduce_effects"})

    total_w = sum(c["weight"] for c in checks)
    score = sum(c["weight"] * c["score"] for c in checks) / total_w * 100
    review = vision_review(frames, plan) if llm.available() else None
    if review:
        score = 0.5 * score + 0.5 * review["score"]
        fixes += [f for f in review.get("fixes", []) if f.get("op")]
    notes = [c["note"] for c in sorted(checks, key=lambda c: c["weight"] * (1 - c["score"]), reverse=True) if c["score"] < 0.8]
    if review:
        notes = review.get("notes_he", [])[:4] + notes
    return {"score": int(round(score)), "checks": checks, "notes": notes[:6], "fixes": fixes,
            "loudness": ld, "longest_static": round(longest, 2), "reviewer": "claude+rules" if review else "rules"}


REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer"},
        "notes_he": {"type": "array", "items": {"type": "string"}},
        "fixes": {"type": "array", "items": {"type": "object", "properties": {
            "op": {"type": "string", "enum": ["strengthen_hook", "break_stagnation", "faster", "slower", "drop_bad_shots",
                                              "reduce_effects", "add_cta", "captions_on", "music_down", "music_up"]},
            "reason": {"type": "string"}}, "required": ["op", "reason"], "additionalProperties": False}},
    },
    "required": ["score", "notes_he", "fixes"],
    "additionalProperties": False,
}


def vision_review(frames, plan) -> dict | None:
    if not frames:
        return None
    picks = frames[:: max(1, len(frames) // 12)][:12]
    tiles = [cv2.putText(f.copy(), f"{t:.1f}s", (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2) for t, f in picks]
    while len(tiles) % 4:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)])
    p = Path(tempfile.mkdtemp()) / "sheet.jpg"
    cv2.imwrite(str(p), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    meta = plan["meta"]
    return llm.ask_json(
        "You are a demanding senior short-form video editor reviewing a draft. Judge it strictly by this rulebook:\n\n" + PRINCIPLES,
        f"Contact sheet of the draft (timestamps on frames). Niche {meta.get('niche')}, platform {meta.get('platform')}, "
        f"mode {meta.get('mode')}, concept {json.dumps(meta.get('concept', {}), ensure_ascii=False)}.\n"
        "Score 0-100 like a pro who would only publish 90+. Give up to 4 notes in Hebrew and the fixes to apply.",
        REVIEW_SCHEMA, images=[p], effort="medium")

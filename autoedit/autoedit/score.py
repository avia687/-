"""Virality score (1-100) of an edit plan against the niche profile, with concrete suggestions.
When a trained success model exists for the niche (learning engine), its prediction is blended in."""
from __future__ import annotations

import math

from . import config, timeline


def plan_features(plan: dict) -> dict:
    lay = timeline.layout(plan)
    dur = lay[-1]["t1"] if lay else 0.0
    owords = timeline.output_words(plan, lay)
    changes = sorted({round(c["t0"], 2) for c in lay[1:]} |
                     {round(t, 2) for p in plan.get("punch", []) if (t := timeline.word_time(owords, p["word"])) is not None} |
                     {round(t, 2) for b in plan.get("broll", []) if "word" in b and (t := timeline.word_time(owords, b["word"])) is not None})
    shots = len(changes) + 1
    gaps = [b["start"] - a["end"] for a, b in zip(owords, owords[1:])]
    sfx_count = sum(1 for t in plan.get("transitions", []) if t.get("sfx")) + len(plan.get("emojis", []))
    broll_time = sum(b.get("dur", 1.8) for b in plan.get("broll", []))
    first_change = changes[0] if changes else dur
    return {
        "duration": dur,
        "avg_shot_sec": dur / shots if shots else dur,
        "cuts_per_min": (shots - 1) / max(dur / 60, 1e-6),
        "words_per_sec": len(owords) / max(dur, 1e-6),
        "max_gap": max(gaps) if gaps else 0.0,
        "first_change_sec": first_change,
        "has_title": bool(plan.get("title", {}).get("text")),
        "has_cta": bool(plan.get("cta", {}).get("text")),
        "captions": bool(plan.get("captions", {}).get("enabled", True)) and len(owords) > 0,
        "music": bool(plan.get("music", {}).get("enabled", True) and plan.get("music", {}).get("path")),
        "sfx_per_min": sfx_count / max(dur / 60, 1e-6),
        "punch_per_min": len(plan.get("punch", [])) / max(dur / 60, 1e-6),
        "emoji_per_min": len(plan.get("emojis", [])) / max(dur / 60, 1e-6),
        "broll_ratio": broll_time / max(dur, 1e-6),
        "hook_type": plan.get("meta", {}).get("hook_type"),
        "progress_bar": bool(plan.get("progress_bar", {}).get("enabled", True)),
    }


def _closeness(value: float, target: float, tolerance: float) -> float:
    """1.0 at target, decaying smoothly with relative distance."""
    if target <= 0:
        return 1.0
    rel = abs(value - target) / (target * tolerance)
    return math.exp(-rel * rel)


def score_plan(plan: dict, profile: dict, model_prob: float | None = None) -> dict:
    f = plan_features(plan)
    platform = plan.get("meta", {}).get("platform", "tiktok")
    spec = config.PLATFORMS.get(platform, config.PLATFORMS["tiktok"])
    lo, hi = spec["ideal"]
    target_dur = min(max(profile.get("structure", {}).get("avg_duration", (lo + hi) / 2), lo), hi * 1.3)
    pacing = profile.get("pacing", {})
    checks = []

    def add(key, weight, value, tip):
        checks.append({"key": key, "weight": weight, "score": max(0.0, min(1.0, value)), "tip": tip})

    hook_ok = (0.5 * f["has_title"] + 0.5 * (f["first_change_sec"] <= max(2.0, profile.get("hook", {}).get("first_cut_sec", 1.5) * 1.6)))
    add("hook", 20, hook_ok, "חזקו את ה-hook: כותרת על המסך ושינוי ויזואלי ב-2 השניות הראשונות")
    add("pacing", 16, _closeness(f["avg_shot_sec"], pacing.get("avg_shot_sec", 2.2), 0.6),
        f"קצב חיתוכים: שוט ממוצע {f['avg_shot_sec']:.1f} שנ' לעומת {pacing.get('avg_shot_sec', 2.2):.1f} בנישה")
    add("duration", 12, 1.0 if lo <= f["duration"] <= hi * 1.25 else _closeness(f["duration"], target_dur, 0.5),
        f"אורך {f['duration']:.0f} שנ'; האורך המומלץ לפלטפורמה {lo}–{hi} שנ'")
    add("dead_air", 10, 1.0 if f["max_gap"] < 0.6 else _closeness(f["max_gap"], 0.3, 2.0),
        "יש שתיקות ארוכות. כדאי לקצר אותן")
    add("captions", 10, 1.0 if f["captions"] else 0.0, "הוסיפו כתוביות: רוב הצפיות הן בלי קול")
    add("words_per_sec", 6, _closeness(f["words_per_sec"], pacing.get("words_per_sec", 2.9), 0.45),
        "קצב הדיבור איטי מהנישה. כדאי לחתוך עוד או להאיץ קלות (x1.1)")
    add("cta", 6, 1.0 if f["has_cta"] else 0.0, "הוסיפו קריאה לפעולה בסוף")
    add("music", 5, 1.0 if (f["music"] or not profile.get("music", {}).get("present", True)) else 0.2, "הוסיפו מוזיקת רקע")
    add("sfx", 5, _closeness(f["sfx_per_min"], profile.get("sfx", {}).get("per_min", 7), 0.8), "התאימו את כמות האפקטים הקוליים לנישה")
    add("zooms", 5, _closeness(f["punch_per_min"], profile.get("zoom", {}).get("punch_in_per_min", 6), 0.8),
        "הוסיפו זום-אין על משפטי מפתח")
    add("visual_extras", 5, 0.5 * _closeness(f["emoji_per_min"], profile.get("overlays", {}).get("emoji_per_min", 4), 1.0)
        + 0.5 * (1.0 if profile.get("broll", {}).get("ratio", 0) < 0.08 or f["broll_ratio"] > 0.04 else 0.3),
        "הוסיפו B-roll או אימוג'י במקומות המתאימים")
    total_w = sum(c["weight"] for c in checks)
    rule_score = sum(c["weight"] * c["score"] for c in checks) / total_w * 100
    score = rule_score if model_prob is None else 0.6 * rule_score + 0.4 * model_prob * 100
    suggestions = [c["tip"] for c in sorted(checks, key=lambda c: c["weight"] * (1 - c["score"]), reverse=True)
                   if c["score"] < 0.75][:5]
    return {"score": int(round(max(1, min(100, score)))), "rule_score": round(rule_score, 1),
            "model_prob": model_prob, "checks": checks, "features": f, "suggestions": suggestions}

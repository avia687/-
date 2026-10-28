"""Winning hook templates, opening formulas and CTA patterns from top transcripts (Claude),
with a statistical fallback; plus plain-language "why it worked" explanations."""
from __future__ import annotations

import json
import re
from collections import Counter

from .. import db, llm

SCHEMA = {
    "type": "object",
    "properties": {
        "hook_templates": {"type": "array", "items": {"type": "string"}},
        "opening_formulas": {"type": "array", "items": {"type": "string"}},
        "cta_patterns": {"type": "array", "items": {"type": "string"}},
        "differences_he": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["hook_templates", "opening_formulas", "cta_patterns", "differences_he"],
    "additionalProperties": False,
}

FEATURE_HE = {
    "avg_shot_sec": "אורך שוט ממוצע", "cuts_per_min": "חיתוכים בדקה", "words_per_sec": "קצב דיבור",
    "first_cut_sec": "זמן עד החיתוך הראשון", "caption_presence": "כתוביות על המסך", "caption_position": "מיקום כתוביות",
    "punch_in_per_min": "זומים בדקה", "transitions_per_min": "מעברים בדקה", "music_present": "מוזיקת רקע",
    "music_bpm": "קצב המוזיקה (BPM)", "sfx_per_min": "אפקטים קוליים בדקה", "sfx_on_cuts": "SFX על חיתוכים",
    "broll_ratio": "שיעור B-roll", "face_ratio": "פנים בפריים", "saturation": "רוויית צבע", "brightness": "בהירות",
    "contrast": "ניגודיות", "warmth": "חמימות צבע", "has_cta": "קריאה לפעולה", "vertical": "וידאו אנכי",
    "duration": "אורך הסרטון", "text_overlay_hook": "כותרת על המסך ב-hook",
    "hook_question": "hook מסוג שאלה", "hook_number_list": "hook עם מספר/רשימה", "hook_pattern_interrupt": "hook שובר דפוס",
    "hook_bold_claim": "hook של טענה נועזת", "hook_negative": "hook שלילי/אזהרה", "hook_story": "hook סיפורי",
    "hook_visual": "hook ויזואלי", "hook_curiosity_gap": "hook של סקרנות",
    "look_punchy": "לוק צבע חזק", "look_warm": "לוק חם", "look_bright_clean": "לוק בהיר ונקי",
    "look_cinematic": "לוק קולנועי", "look_neutral": "לוק טבעי",
}

CTA_RE = re.compile(r"(follow|subscribe|save|comment|share|link in bio|עקבו|הירשמו|שמרו|תגיבו|שתפו|לינק)[^.!?]{0,40}", re.I)


def _texts(niche: str, label: str, limit: int) -> list[dict]:
    return db.rows("SELECT v.title, f.hook_text, f.transcript, f.vector FROM videos v JOIN features f ON f.video_id=v.id "
                   "WHERE v.niche=? AND v.label=? ORDER BY v.success_score " + ("DESC" if label == "success" else "ASC") +
                   " LIMIT ?", (niche, label, limit))


def extract(niche: str) -> dict:
    top = _texts(niche, "success", 25)
    reg = _texts(niche, "regular", 15)
    if not top:
        return {}
    res = None
    if llm.available():
        res = llm.ask_json(
            "You analyze what makes short-form videos go viral. Be concrete and reusable.",
            f"Niche: {niche}.\nSUCCESSFUL videos (title | first 3 seconds | transcript excerpt):\n" +
            "\n".join(f"- {t['title']} | {t['hook_text']} | {(t['transcript'] or '')[:300]}" for t in top) +
            "\n\nREGULAR (under-performing) videos:\n" +
            "\n".join(f"- {t['title']} | {t['hook_text']}" for t in reg) +
            "\n\nExtract: hook_templates (fill-in-the-blank templates like 'Stop doing X if you want Y'), "
            "opening_formulas (structure of the first 5 seconds), cta_patterns (how winners close), and "
            "differences_he (3-5 bullet points in Hebrew: what successful videos do that regular ones don't).",
            SCHEMA, effort="medium")
    if not res:
        res = heuristic(top, reg)
    res["source"] = "claude" if llm.available() and "heuristic" not in res else "heuristic"
    return res


def heuristic(top: list[dict], reg: list[dict]) -> dict:
    def hook_dist(rows):
        c = Counter()
        for r in rows:
            v = json.loads(r["vector"] or "{}")
            for k, val in v.items():
                if k.startswith("hook_") and val:
                    c[k] += 1
        return c

    ht, hr = hook_dist(top), hook_dist(reg)
    openers = Counter(" ".join((r["hook_text"] or "").split()[:2]).lower() for r in top if r["hook_text"])
    ctas = Counter(m.group(0).strip().lower() for r in top for m in CTA_RE.finditer(r["transcript"] or ""))
    diffs = []
    for k, n in ht.most_common(3):
        share_t = n / max(1, len(top))
        share_r = hr.get(k, 0) / max(1, len(reg))
        if share_t > share_r:
            diffs.append(f"{FEATURE_HE.get(k, k)}: {share_t:.0%} מהמצליחים לעומת {share_r:.0%} מהרגילים")
    return {
        "hook_templates": [r["hook_text"] for r in top[:6] if r["hook_text"]],
        "opening_formulas": [f"פתיחה ב-\"{o}\"" for o, _ in openers.most_common(4) if o],
        "cta_patterns": [c for c, _ in ctas.most_common(5)],
        "differences_he": diffs,
        "heuristic": True,
    }


def explain(vector: dict, importances: list[dict], regular_medians: dict | None = None, why: str | None = None) -> str:
    """Short Hebrew explanation of why a video succeeded."""
    if why:
        return why
    parts = []
    for imp in importances[:10]:
        f = imp["feature"]
        v = vector.get(f)
        if v is None:
            continue
        ref = (regular_medians or {}).get(f, imp.get("regular_median"))
        if f.startswith(("hook_", "look_")) and v >= 0.5 and imp["direction"] == "higher":
            parts.append(FEATURE_HE.get(f, f))
        elif ref and isinstance(v, (int, float)) and ref > 0:
            ratio = v / ref
            if imp["direction"] == "higher" and ratio > 1.25:
                parts.append(f"{FEATURE_HE.get(f, f)} גבוה פי {ratio:.1f} מהרגילים")
            elif imp["direction"] == "lower" and ratio < 0.8:
                parts.append(f"{FEATURE_HE.get(f, f)} נמוך ב-{(1 - ratio):.0%} מהרגילים")
        if len(parts) >= 3:
            break
    return "; ".join(parts) if parts else "ביצועים חזקים ביחס לגודל הערוץ"

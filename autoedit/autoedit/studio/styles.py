"""The three versions a beginner chooses between (Viral / Cinematic / Premium), fitting an edit to a
target length, and plain-language explanations of what the AI did."""
from __future__ import annotations

from .. import timeline
from . import brand as brand_mod

STYLES = {
    "viral": {"he": "ויראלי", "desc": "מהיר, hook חזק, הרבה תנועה"},
    "cinematic": {"he": "קולנועי", "desc": "אלגנטי, שוטים ארוכים, מינימום אפקטים"},
    "premium": {"he": "פרימיום", "desc": "נקי ויוקרתי, תנועה מבוקרת"},
}


def order(chosen: str | None) -> list[str]:
    names = list(STYLES)
    if chosen in names:
        names.remove(chosen)
        names.insert(0, chosen)
    return names


def mood_for(style: str, default: str) -> str:
    return {"viral": "energetic", "cinematic": "emotional", "premium": "luxury"}.get(style, default)


def apply(plan: dict, style: str) -> dict:
    """Post-process a Director draft into the requested style. Never adds effects without a reason:
    cinematic/premium remove effects, viral keeps what the Director chose."""
    plan["meta"]["style"] = style
    cap = plan.setdefault("captions", {})
    if style == "viral":
        cap.update(brand_mod.CAPTION_PRESETS["bold_pop"])
        plan.setdefault("music", {})["volume_db"] = plan["music"].get("volume_db", -19) + 1.5
        plan.setdefault("progress_bar", {})["enabled"] = plan["meta"].get("mode") != "montage"
    elif style == "cinematic":
        cap.update(brand_mod.CAPTION_PRESETS["minimal"])
        plan["punch"] = plan.get("punch", [])[::3]
        plan["emojis"] = []
        for t in plan.get("transitions", []):
            if t.get("type") not in ("cut", None):
                t["type"] = "cut"
            if t.get("sfx") in ("impact", "click", "pop"):
                t["sfx"] = None
        if plan["meta"].get("mode") == "montage":
            for c in plan["clips"][1:]:
                c.setdefault("fade_in", 0.35)
        plan.setdefault("color", {})["look"] = "cinematic"
        plan.setdefault("progress_bar", {})["enabled"] = False
        if plan.get("title", {}).get("sfx"):
            plan["title"]["sfx"] = "riser"
    elif style == "premium":
        cap.update(brand_mod.CAPTION_PRESETS["clean_box"])
        plan["punch"] = plan.get("punch", [])[:2]
        plan["emojis"] = []
        for t in plan.get("transitions", []):
            if t.get("type") in ("whip", "flash"):
                t["type"] = "zoom"
            if t.get("sfx") not in (None, "whoosh"):
                t["sfx"] = "whoosh"
            t["sfx_db"] = -19
        plan.setdefault("color", {})["look"] = "bright_clean" if plan["meta"].get("niche") == "realestate" else "neutral"
        plan.setdefault("progress_bar", {})["enabled"] = False
        if plan.get("title", {}).get("sfx"):
            plan["title"]["sfx"] = None
    # brand kit and learned preferences always win over the style preset
    if plan.get("brand", {}).get("caption_font"):
        cap["font"] = cap["font_he"] = plan["brand"]["caption_font"]
    if plan.get("brand", {}).get("accent_color"):
        cap["highlight_color"] = plan["brand"]["accent_color"]
    return brand_mod.apply_preferences(plan)


def fit_duration(plan: dict, seconds: float | None) -> float:
    """Trim the body (never the hook or the ending) until the edit fits the requested length."""
    if not seconds:
        return 0.0
    removed = 0.0
    limit = seconds * 1.12
    while timeline.total_duration(plan) > limit and len(plan["clips"]) > 3:
        lay = timeline.layout(plan)
        body = [c for c in lay[1:-1] if c.get("role") not in ("hook", "cta", "intro")]
        if not body:
            break
        # drop the weakest body clip: the shortest one carries the least content
        victim = min(body, key=lambda c: c["t1"] - c["t0"])
        k = victim["index"]
        removed += victim["t1"] - victim["t0"]
        plan["clips"].pop(k)
        plan["transitions"] = [dict(t, after_clip=t["after_clip"] - (1 if t["after_clip"] > k else 0))
                               for t in plan.get("transitions", []) if t["after_clip"] != k]
    total = timeline.total_duration(plan)
    for g in plan.get("graphics", []):
        if g["type"] == "end_card":
            d = g["end"] - g["start"]
            g["start"], g["end"] = max(0.0, total - d), total
        g["end"] = min(g["end"], total)
    plan["graphics"] = [g for g in plan.get("graphics", []) if g["end"] - g["start"] > 0.3]
    return removed


def explain(plan: dict) -> list[str]:
    """What the AI did, in plain Hebrew, from the decisions actually stored in the plan."""
    out = []
    st = plan.get("stats", {})
    meta = plan.get("meta", {})
    if meta.get("mode") == "aroll" and st:
        cut = st.get("source_duration", 0) - st.get("kept_duration", 0)
        if cut > 0.5:
            out.append(f"הסרתי {cut:.1f} שניות של שתיקות, גמגומים וחזרות")
        n = st.get("removed_fillers", 0) + st.get("removed_repeats", 0)
        if n:
            out.append(f"ניקיתי {n} מילות מילוי ומשפטים חוזרים, בלי לפגוע בקצב הטבעי")
        if st.get("removed_greeting"):
            out.append("הורדתי את הברכה מהפתיחה כדי שהסרטון יתחיל ישר בעניין")
        clips = plan.get("clips", [])
        if clips and clips[0].get("role") == "hook" and len(clips) > 1 and clips[0]["in"] > clips[1]["in"]:
            out.append("העברתי את המשפט הכי חזק לפתיחה")
    if meta.get("mode") == "montage":
        out.append(f"בחרתי את השוטים הכי חזקים וחתכתי אותם על הביט של המוזיקה ({int(meta.get('bpm') or 0)} BPM)")
        par = sum(1 for c in plan.get("clips", []) if (c.get("motion") or {}).get("type") == "parallax")
        if par:
            out.append(f"הוספתי תנועת עומק תלת-ממדית ל-{par} תמונות")
        stats = [g for g in plan.get("graphics", []) if g["type"] == "stat"]
        if stats:
            out.append("הפכתי מספרים מהתיאור לכרטיסי נתונים מונפשים")
    if plan.get("punch"):
        out.append(f"הוספתי {len(plan['punch'])} זומים עדינים להדגשת רגעי מפתח")
    if plan.get("title", {}).get("text") or any(g["type"] == "kinetic_title" for g in plan.get("graphics", [])):
        out.append("כתבתי כותרת פתיחה שעוצרת גלילה")
    if plan.get("captions", {}).get("enabled") and timeline.output_words(plan):
        out.append("הוספתי כתוביות מילה-אחר-מילה עם הדגשת מילות מפתח")
    if plan.get("music", {}).get("enabled") and plan["music"].get("path"):
        out.append("התאמתי מוזיקה והנמכתי אותה אוטומטית מתחת לדיבור" if meta.get("mode") == "aroll"
                   else "התאמתי מוזיקה שמסתיימת בדיוק עם הסרטון")
    if any(s.get("match") for s in plan.get("sources", {}).values()):
        out.append("התאמתי צבעים בין השוטים כאילו צולמו באותה מצלמה")
    else:
        out.append("תיקנתי צבע ותאורה אוטומטית")
    out.append("איזנתי את עוצמת הקול לרמה המומלצת לרשתות")
    for r in (plan.get("critic") or {}).get("rounds", []):
        for a in r.get("applied", []) or []:
            if a.startswith("interrupt"):
                out.append("הוספתי שינוי ויזואלי בקטע שעלול היה לשעמם")
                break
    return out[:9]

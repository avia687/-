"""Free-language editing chat: "תקצר את ההתחלה", "מוזיקה יותר שקטה", "תוסיף כתובית בשנייה 12: מבצע!" ->
EDL operations, applied and remembered as preferences when they are about style (not content)."""
from __future__ import annotations

import re

from .. import llm, timeline
from . import brand as brand_mod

OPS = ["trim_start", "trim_end", "shorten_total", "music_volume", "music_off", "music_on", "add_text", "caption_size",
       "captions_off", "captions_on", "pace", "remove_clip", "change_title", "change_cta", "color_look", "progress_bar",
       "emoji_off", "zoom_more", "zoom_less", "edit_caption_word", "caption_preset"]

SCHEMA = {
    "type": "object",
    "properties": {
        "ops": {"type": "array", "items": {"type": "object", "properties": {
            "op": {"type": "string", "enum": OPS},
            "seconds": {"type": "number"}, "db": {"type": "number"}, "factor": {"type": "number"},
            "text": {"type": "string"}, "at": {"type": "number"}, "duration": {"type": "number"},
            "index": {"type": "integer"}, "value": {"type": "string"}, "remember": {"type": "boolean"}},
            "required": ["op"], "additionalProperties": False}},
        "reply": {"type": "string"},
    },
    "required": ["ops", "reply"],
    "additionalProperties": False,
}

HE_NUM = {"אחת": 1, "אחד": 1, "שתיים": 2, "שניים": 2, "שתי": 2, "שלוש": 3, "שלושה": 3, "ארבע": 4, "חמש": 5, "עשר": 10}


def _num(text: str, default: float) -> float:
    m = re.search(r"(\d+(?:\.\d+)?)", text)
    if m:
        return float(m.group(1))
    for w, v in HE_NUM.items():
        if w in text:
            return float(v)
    return default


def parse_heuristic(msg: str) -> list[dict]:
    t = msg.strip().lower()
    ops = []
    if re.search(r"(תקצר|קצר|תחתוך|חתוך).*(התחלה|פתיחה|ההתחלה)|trim.*(start|beginning)|shorter (start|intro)", t):
        ops.append({"op": "trim_start", "seconds": _num(t, 1.5)})
    elif re.search(r"(תקצר|קצר).*(סוף|הסוף)|trim.*end", t):
        ops.append({"op": "trim_end", "seconds": _num(t, 1.5)})
    elif re.search(r"(תקצר|קצר|יותר קצר)|shorter", t):
        ops.append({"op": "shorten_total", "factor": 0.8})
    if re.search(r"מוזיקה.*(שקט|נמוך|חלש)|(הנמך|תנמיך).*מוזיקה|music.*(quiet|lower|softer)", t):
        ops.append({"op": "music_volume", "db": -5, "remember": True})
    elif re.search(r"מוזיקה.*(חזק|רם|גבוה)|music.*(louder|up)", t):
        ops.append({"op": "music_volume", "db": 4, "remember": True})
    elif re.search(r"בלי מוזיקה|תוריד.*מוזיקה|no music|remove music", t):
        ops.append({"op": "music_off", "remember": True})
    m = re.search(r"(?:כתובית|טקסט|text|caption)[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:שנ|sec|s\b)?[^:：]*[:：]\s*(.+)$", msg)
    if m:
        ops.append({"op": "add_text", "at": float(m.group(1)), "text": m.group(2).strip(), "duration": 2.5})
    if re.search(r"כתוביות.*(גדול|יותר גדול)|bigger captions|captions bigger", t):
        ops.append({"op": "caption_size", "factor": 1.2, "remember": True})
    elif re.search(r"כתוביות.*(קטן)|smaller captions", t):
        ops.append({"op": "caption_size", "factor": 0.85, "remember": True})
    if re.search(r"בלי כתוביות|no captions", t):
        ops.append({"op": "captions_off"})
    if re.search(r"יותר (מהיר|קצבי|דינמי)|faster|more energy", t):
        ops.append({"op": "pace", "factor": 0.85, "remember": True})
    elif re.search(r"יותר (איטי|רגוע)|slower|calmer", t):
        ops.append({"op": "pace", "factor": 1.15, "remember": True})
    m = re.search(r"(?:תמחק|תוריד|מחק|remove|delete)\s+(?:את\s+)?(?:ה)?(?:קטע|שוט|clip|shot)\s*(?:מספר\s*)?(\d+)", t)
    if m:
        ops.append({"op": "remove_clip", "index": int(m.group(1)) - 1})
    m = re.search(r"(?:כותרת|title)\s*[:：]\s*(.+)$", msg)
    if m:
        ops.append({"op": "change_title", "text": m.group(1).strip()})
    if re.search(r"(צבע|צבעים).*(חמ)|warmer", t):
        ops.append({"op": "color_look", "value": "warm", "remember": True})
    elif re.search(r"(צבע|צבעים).*(קולנוע|דרמט)|cinematic", t):
        ops.append({"op": "color_look", "value": "cinematic", "remember": True})
    if re.search(r"בלי אימוג|no emoji", t):
        ops.append({"op": "emoji_off", "remember": True})
    if re.search(r"(פחות|בלי) זומים|less zoom", t):
        ops.append({"op": "zoom_less"})
    elif re.search(r"(יותר) זומים|more zoom", t):
        ops.append({"op": "zoom_more"})
    return ops


def parse(msg: str, plan: dict) -> tuple[list[dict], str]:
    ops = parse_heuristic(msg)
    if llm.available():
        lay = timeline.layout(plan)
        clips = [f"#{c['index'] + 1}: {c['t0']:.1f}-{c['t1']:.1f}s {c.get('role', '')}" for c in lay]
        res = llm.ask_json(
            "You are a video editor's assistant. Translate the creator's request into edit operations on the timeline. "
            "Times are in seconds of the finished video. Set remember=true only for stylistic preferences the creator "
            "would want on future videos too (music level, caption size, pace, look), not for content edits.",
            f"Timeline clips: {clips}\nTitle: {plan.get('title', {}).get('text') or ''}\nRequest: {msg!r}\n"
            "Reply in the creator's language with one short sentence describing what you changed.", SCHEMA, effort="low")
        if res and res["ops"]:
            return res["ops"], res["reply"]
    reply = "בוצע: " + ", ".join(o["op"] for o in ops) if ops else "לא הבנתי מה לשנות - נסו למשל: \"מוזיקה יותר שקטה\""
    return ops, reply


def apply(plan: dict, ops: list[dict]) -> list[str]:
    done = []
    lay = timeline.layout(plan)
    for o in ops:
        op = o["op"]
        if op == "trim_start" and plan["clips"]:
            sec = float(o.get("seconds", 1.5))
            while sec > 0 and plan["clips"]:
                c = plan["clips"][0]
                d = (c["out"] - c["in"]) / c.get("speed", 1.0)
                if d - sec > 0.5:
                    c["in"] += sec * c.get("speed", 1.0)
                    sec = 0
                else:
                    plan["clips"].pop(0)
                    sec -= d
                    plan["transitions"] = [dict(t, after_clip=t["after_clip"] - 1) for t in plan["transitions"] if t["after_clip"] > 0]
            for g in plan.get("graphics", []):
                if g["type"] != "kinetic_title":
                    g["start"] = max(0.0, g["start"] - float(o.get("seconds", 1.5)))
                    g["end"] = max(g["start"] + 0.5, g["end"] - float(o.get("seconds", 1.5)))
        elif op == "trim_end" and plan["clips"]:
            k = len(plan["clips"]) - 2 if len(plan["clips"]) > 1 else 0
            c = plan["clips"][k]
            c["out"] = max(c["in"] + 0.5, c["out"] - float(o.get("seconds", 1.5)) * c.get("speed", 1.0))
        elif op == "shorten_total":
            f = float(o.get("factor", 0.8))
            for c in plan["clips"][1:-1]:
                c["out"] = c["in"] + max(0.5, (c["out"] - c["in"]) * f)
        elif op == "music_volume":
            plan.setdefault("music", {})["volume_db"] = plan["music"].get("volume_db", -19) + float(o.get("db", -4))
            if o.get("remember"):
                brand_mod.remember("music_volume_db", brand_mod.preferences().get("music_volume_db", 0) + float(o.get("db", -4)))
        elif op == "music_off":
            plan.setdefault("music", {})["enabled"] = False
            if o.get("remember"):
                brand_mod.remember("music_enabled", False)
        elif op == "music_on":
            plan.setdefault("music", {})["enabled"] = True
        elif op == "add_text":
            plan.setdefault("graphics", []).append({"type": "kinetic_title", "text": o.get("text", ""), "start": float(o.get("at", 0)),
                                                    "end": float(o.get("at", 0)) + float(o.get("duration", 2.5))})
        elif op == "caption_size":
            plan.setdefault("captions", {})["size"] = float(plan["captions"].get("size", 0.068)) * float(o.get("factor", 1.2))
            if o.get("remember"):
                brand_mod.remember("caption_size", float(o.get("factor", 1.2)))
        elif op in ("captions_off", "captions_on"):
            plan.setdefault("captions", {})["enabled"] = op == "captions_on"
        elif op == "pace":
            f = float(o.get("factor", 0.85))
            for c in plan["clips"]:
                if plan["sources"][c["src"]]["kind"] == "image":
                    c["out"] = c["in"] + max(0.5, (c["out"] - c["in"]) * f)
                else:
                    c["speed"] = round(min(1.25, max(0.8, c.get("speed", 1.0) / f)), 3)
            if o.get("remember"):
                brand_mod.remember("pace", f)
        elif op == "remove_clip":
            k = int(o.get("index", -1))
            if 0 <= k < len(plan["clips"]) and len(plan["clips"]) > 1:
                plan["clips"].pop(k)
                plan["transitions"] = [dict(t, after_clip=t["after_clip"] - (1 if t["after_clip"] > k else 0))
                                       for t in plan["transitions"] if t["after_clip"] != k]
        elif op == "change_title":
            if plan.get("title", {}).get("text") is not None and plan["meta"].get("mode") != "montage":
                plan["title"]["text"] = o.get("text", "")
            for g in plan.get("graphics", []):
                if g["type"] == "kinetic_title" and g["start"] < 1:
                    g["text"] = o.get("text", "")
        elif op == "change_cta":
            if plan.get("cta"):
                plan["cta"]["text"] = o.get("text", "")
            for g in plan.get("graphics", []):
                if g["type"] == "end_card":
                    g["text"] = o.get("text", "")
        elif op == "color_look":
            plan.setdefault("color", {})["look"] = o.get("value", "neutral")
        elif op == "emoji_off":
            plan["emojis"] = []
            if o.get("remember"):
                brand_mod.remember("emoji", False)
        elif op == "zoom_less":
            plan["punch"] = plan.get("punch", [])[::2]
        elif op == "zoom_more":
            ow = timeline.output_words(plan, lay)
            have = {p["word"] for p in plan.get("punch", [])}
            for w in [w for w in ow if w["emph"] and w["i"] not in have][:3]:
                plan["punch"].append({"word": w["i"], "scale": 1.15, "hold": 1.2, "style": "snap", "sfx": None})
        elif op == "edit_caption_word":
            idx, txt = o.get("index"), o.get("text", "")
            for w in plan.get("words", []):
                if w["i"] == idx:
                    w["text"] = txt
        elif op == "caption_preset":
            plan.setdefault("captions", {}).update(brand_mod.CAPTION_PRESETS.get(o.get("value", "auto"), {}))
        else:
            continue
        done.append(op)
    # graphics must stay inside the new timeline
    total = timeline.total_duration(plan)
    for g in plan.get("graphics", []):
        if g["type"] == "end_card":
            d = g["end"] - g["start"]
            g["start"], g["end"] = max(0.0, total - d), total
    return done

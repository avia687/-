"""Brand Kit (set once, applied to every video) + preferences learned from chat corrections."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from .. import config, db

DEFAULT = {"name": "", "handle": "", "logo": None, "primary_color": None, "accent_color": None, "text_color": "#FFFFFF",
           "caption_font": None, "title_font": None, "intro": None, "outro": None, "caption_preset": "auto",
           "logo_position": "top-right", "watermark": True}

CAPTION_PRESETS = {
    "auto": {},
    "bold_pop": {"font": "Montserrat Black", "font_he": "Heebo Black", "uppercase": True, "highlight_mode": "color",
                 "words_per_group": 2, "animation": "pop"},
    "clean_box": {"font": "Montserrat ExtraBold", "font_he": "Heebo ExtraBold", "uppercase": False, "highlight_mode": "box",
                  "words_per_group": 3},
    "minimal": {"font": "Assistant ExtraBold", "font_he": "Assistant ExtraBold", "uppercase": False, "highlight_mode": "color",
                "words_per_group": 4, "animation": "none", "outline": 4, "size": 0.055},
    "rounded_fun": {"font": "Rubik ExtraBold", "font_he": "Rubik ExtraBold", "uppercase": False, "highlight_mode": "color",
                    "words_per_group": 2},
}


def brand_dir() -> Path:
    d = config.WORK_DIR / "brand"
    d.mkdir(parents=True, exist_ok=True)
    return d


def load() -> dict:
    p = brand_dir() / "brand.json"
    data = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    return {**DEFAULT, **data}


def save(data: dict) -> dict:
    cur = load()
    cur.update({k: v for k, v in data.items() if k in DEFAULT})
    (brand_dir() / "brand.json").write_text(json.dumps(cur, ensure_ascii=False, indent=1), encoding="utf-8")
    return cur


def store_asset(kind: str, src: Path) -> str:
    """Copy an uploaded logo / intro / outro / font into the brand folder. Fonts get registered for libass."""
    dest = brand_dir() / f"{kind}{src.suffix.lower()}"
    shutil.copy(src, dest)
    if kind in ("caption_font", "title_font") and src.suffix.lower() in (".ttf", ".otf"):
        from fontTools.ttLib import TTFont

        fam = TTFont(str(dest))["name"].getDebugName(1) or src.stem
        shutil.copy(dest, config.FONTS_DIR / dest.name.replace(kind, fam.replace(" ", "")))
        return fam
    return str(dest)


def apply(plan: dict, brand: dict | None = None) -> dict:
    """Apply the brand kit to an EDL: caption style/colours/fonts, logo, intro/outro clips."""
    b = brand or load()
    plan["brand"] = {k: b.get(k) for k in ("logo", "accent_color", "primary_color", "caption_font", "title_font", "name", "handle")}
    cap = plan.setdefault("captions", {})
    cap.update(CAPTION_PRESETS.get(b.get("caption_preset") or "auto", {}))
    if b.get("accent_color"):
        cap["highlight_color"] = b["accent_color"]
    if b.get("primary_color"):
        cap["box_color"] = b["primary_color"]
    if b.get("caption_font"):
        cap["font"] = cap["font_he"] = b["caption_font"]
    if b.get("accent_color"):
        plan.setdefault("progress_bar", {})["color"] = b["accent_color"]
    if not b.get("watermark"):
        plan["brand"]["logo"] = None
    from ..media import probe

    for kind, pos in (("intro", 0), ("outro", None)):
        f = b.get(kind)
        if f and Path(f).exists() and not any(c.get("brand") == kind for c in plan["clips"]):
            info = probe(f)
            sid = f"B_{kind}"
            plan["sources"][sid] = {"path": f, "kind": "video", "w": info.display_size[0], "h": info.display_size[1],
                                    "duration": info.duration, "has_audio": info.has_audio}
            # rulebook: never spend the first seconds on a logo -> intro (max 1.5s) goes right after the hook
            clip = {"src": sid, "in": 0.0, "out": min(info.duration, 1.5 if kind == "intro" else 3.0), "role": kind,
                    "brand": kind, "audio": info.has_audio}
            if pos == 0:
                plan["clips"].insert(1 if plan["clips"] else 0, clip)
            else:
                plan["clips"].append(clip)
    return plan


# ------------------------------------------------------------------ learned preferences
PREF_KEYS = {"music_volume_db", "caption_size", "pace", "caption_preset", "music_enabled", "progress_bar", "emoji"}


def remember(key: str, value) -> None:
    if key not in PREF_KEYS:
        return
    prefs = db.get_pref("style_prefs", {}) or {}
    prefs[key] = value
    db.set_pref("style_prefs", prefs)


def preferences() -> dict:
    return db.get_pref("style_prefs", {}) or {}


def apply_preferences(plan: dict) -> dict:
    p = preferences()
    if "music_volume_db" in p:
        plan.setdefault("music", {})["volume_db"] = plan.get("music", {}).get("volume_db", -19) + p["music_volume_db"]
    if "caption_size" in p:
        plan.setdefault("captions", {})["size"] = float(plan["captions"].get("size", 0.068)) * p["caption_size"]
    if p.get("music_enabled") is False:
        plan.setdefault("music", {})["enabled"] = False
    if p.get("progress_bar") is False:
        plan.setdefault("progress_bar", {})["enabled"] = False
    if p.get("emoji") is False:
        plan["emojis"] = []
    if "caption_preset" in p:
        plan.setdefault("captions", {}).update(CAPTION_PRESETS.get(p["caption_preset"], {}))
    return plan

"""Built-in starter style profiles per niche.

These encode well-known patterns of high-performing short-form content in each niche
and are used until you analyze your own reference videos (`autoedit analyze ...`).
Analyzed profiles are merged on top of these (see style/library.py).
"""
from __future__ import annotations

import copy
import json

from . import config

BASE = {
    "version": 1,
    "niche": "default",
    "name": "default",
    "sources": [],
    "pacing": {"avg_shot_sec": 2.4, "cuts_per_min": 25, "words_per_sec": 2.9, "max_silence": 0.28},
    "hook": {"type": "bold_claim", "has_text_overlay": True, "first_cut_sec": 1.5, "examples": []},
    "captions": {
        "enabled": True, "font": "Montserrat Black", "font_he": "Heebo Black", "size": 0.068,
        "color": "#FFFFFF", "highlight_color": "#FFE14D", "outline_color": "#000000", "outline": 7,
        "shadow": 3, "position": 0.64, "words_per_group": 3, "uppercase": True,
        "animation": "pop", "highlight_mode": "color", "box_color": "#7B2FF7",
    },
    "zoom": {"punch_in_per_min": 6, "scale": 1.14, "style": "snap", "camera_motion": "slow_push"},
    "transitions": {"types": {"cut": 0.75, "zoom": 0.15, "whip": 0.05, "flash": 0.05}, "per_min": 4},
    "music": {"present": True, "bpm": 110, "energy": "medium", "volume_db": -19, "duck_db": -11},
    "sfx": {"per_min": 7, "on_cuts": 0.3, "types": ["whoosh", "pop", "ding"]},
    "broll": {"ratio": 0.12, "avg_len": 1.8},
    "color": {"look": "neutral", "saturation": 1.08, "brightness": 0.5, "contrast": 0.55, "warmth": 0.0},
    "structure": {"hook_sec": 3, "cta": True, "segments": ["hook", "value", "cta"], "avg_duration": 35,
                  "cta_text_he": "עקבו לעוד טיפים 👇", "cta_text_en": "Follow for more 👇"},
    "overlays": {"emoji_per_min": 4, "title_card": True, "progress_bar": True},
}

NICHE_OVERRIDES = {
    "fitness": {
        "pacing": {"avg_shot_sec": 1.7, "cuts_per_min": 35, "words_per_sec": 3.2, "max_silence": 0.2},
        "hook": {"type": "pattern_interrupt", "examples": ["Stop doing this exercise", "תפסיקו לעשות בטן ככה"]},
        "captions": {"highlight_color": "#C6FF00", "font": "Montserrat Black", "words_per_group": 2, "position": 0.66},
        "zoom": {"punch_in_per_min": 9, "scale": 1.18, "style": "snap"},
        "transitions": {"types": {"cut": 0.6, "zoom": 0.2, "whip": 0.1, "flash": 0.1}, "per_min": 6},
        "music": {"bpm": 124, "energy": "high", "volume_db": -17, "duck_db": -10},
        "sfx": {"per_min": 10, "on_cuts": 0.45, "types": ["whoosh", "impact", "pop"]},
        "color": {"look": "punchy", "saturation": 1.15, "contrast": 0.65},
        "structure": {"avg_duration": 28, "cta_text_he": "שמרו לאימון הבא 💪", "cta_text_en": "Save this for your next workout 💪"},
        "overlays": {"emoji_per_min": 5},
    },
    "realestate": {
        "pacing": {"avg_shot_sec": 2.6, "cuts_per_min": 22, "words_per_sec": 2.7, "max_silence": 0.3},
        "hook": {"type": "number_list", "examples": ["This $2M home has a secret room", "3 טעויות שעולות לכם מאות אלפים"]},
        "captions": {"font": "Montserrat ExtraBold", "font_he": "Heebo ExtraBold", "highlight_color": "#FFD166",
                     "uppercase": False, "words_per_group": 3, "highlight_mode": "box", "box_color": "#1D3557"},
        "zoom": {"punch_in_per_min": 5, "scale": 1.1, "style": "smooth", "camera_motion": "slow_push"},
        "transitions": {"types": {"cut": 0.6, "zoom": 0.25, "whip": 0.1, "flash": 0.05}, "per_min": 4},
        "music": {"bpm": 92, "energy": "low", "volume_db": -20},
        "broll": {"ratio": 0.3, "avg_len": 2.2},
        "color": {"look": "bright_clean", "saturation": 1.1, "brightness": 0.58},
        "structure": {"avg_duration": 38, "cta_text_he": "רוצים ליווי? שלחו הודעה 🏡", "cta_text_en": "DM me to see it 🏡"},
    },
    "food": {
        "pacing": {"avg_shot_sec": 1.5, "cuts_per_min": 40, "words_per_sec": 3.0, "max_silence": 0.22},
        "hook": {"type": "visual", "examples": ["The crispiest potatoes ever", "המתכון שכולם מבקשים ממני"]},
        "captions": {"font": "Rubik ExtraBold", "font_he": "Rubik ExtraBold", "highlight_color": "#FF8A3D",
                     "uppercase": False, "words_per_group": 3},
        "zoom": {"punch_in_per_min": 8, "scale": 1.16},
        "music": {"bpm": 110, "energy": "medium", "volume_db": -18},
        "sfx": {"per_min": 9, "types": ["pop", "whoosh", "ding"]},
        "broll": {"ratio": 0.35, "avg_len": 1.4},
        "color": {"look": "warm", "saturation": 1.25, "warmth": 0.04},
        "structure": {"avg_duration": 30, "cta_text_he": "שמרו את המתכון 🍽️", "cta_text_en": "Save this recipe 🍽️"},
        "overlays": {"emoji_per_min": 6},
    },
    "business": {
        "pacing": {"avg_shot_sec": 2.2, "cuts_per_min": 28, "words_per_sec": 3.0, "max_silence": 0.25},
        "hook": {"type": "bold_claim", "examples": ["Nobody tells you this about money", "הטעות שעולה לעסקים קטנים הכי ביוקר"]},
        "captions": {"font": "Montserrat Black", "font_he": "Heebo Black", "highlight_color": "#00E5FF",
                     "words_per_group": 3, "highlight_mode": "box", "box_color": "#0047FF"},
        "zoom": {"punch_in_per_min": 7, "scale": 1.15},
        "music": {"bpm": 100, "energy": "medium", "volume_db": -21},
        "sfx": {"per_min": 6, "types": ["whoosh", "ding", "click"]},
        "color": {"look": "cinematic", "saturation": 1.0},
        "structure": {"avg_duration": 40, "cta_text_he": "עקבו לעוד תובנות עסקיות 📈", "cta_text_en": "Follow for more business tips 📈"},
    },
}


def deep_merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def default_profile(niche: str) -> dict:
    p = deep_merge(BASE, NICHE_OVERRIDES.get(niche, {}))
    p["niche"] = niche
    p["name"] = "default"
    return p


def write_default_profiles() -> None:
    for niche in config.NICHES:
        d = config.PROFILES_DIR / niche
        d.mkdir(parents=True, exist_ok=True)
        path = d / "default.json"
        if not path.exists():
            path.write_text(json.dumps(default_profile(niche), ensure_ascii=False, indent=2), encoding="utf-8")
    print("  default niche profiles written")

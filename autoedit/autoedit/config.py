"""Global configuration: paths, platform specs, niche defaults."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONTS_DIR = ASSETS / "fonts"
LUTS_DIR = ASSETS / "luts"
SFX_DIR = ASSETS / "sfx"
MUSIC_DIR = ASSETS / "music"
BROLL_DIR = ASSETS / "broll"
STICKERS_DIR = ASSETS / "stickers"
MODELS_DIR = ASSETS / "models"
PROFILES_DIR = ROOT / "profiles"
WORK_DIR = Path(os.environ.get("AUTOEDIT_WORK_DIR", ROOT / "workspace"))

# Whisper: large-v3-turbo is the best speed/quality tradeoff; Hebrew gets the
# ivrit.ai fine-tune which is dramatically more accurate on Hebrew speech.
WHISPER_MODEL = os.environ.get("AUTOEDIT_WHISPER_MODEL", "large-v3-turbo")
WHISPER_MODEL_HE = os.environ.get("AUTOEDIT_WHISPER_MODEL_HE", "ivrit-ai/whisper-large-v3-turbo-ct2")
WHISPER_DEVICE = os.environ.get("AUTOEDIT_WHISPER_DEVICE", "auto")

CLAUDE_MODEL = os.environ.get("AUTOEDIT_CLAUDE_MODEL", "claude-opus-5-5")

FPS = 30

PLATFORMS = {
    "tiktok": {"aspect": "9:16", "max_duration": 60, "ideal": (21, 34), "lufs": -14, "safe_bottom": 0.22, "safe_top": 0.10},
    "reels": {"aspect": "9:16", "max_duration": 90, "ideal": (15, 30), "lufs": -14, "safe_bottom": 0.25, "safe_top": 0.12},
    "shorts": {"aspect": "9:16", "max_duration": 60, "ideal": (25, 45), "lufs": -14, "safe_bottom": 0.18, "safe_top": 0.10},
    "youtube": {"aspect": "16:9", "max_duration": 60 * 30, "ideal": (240, 720), "lufs": -14, "safe_bottom": 0.10, "safe_top": 0.06},
}

ASPECTS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080), "4:5": (1080, 1350)}

NICHES = {
    "fitness": "כושר",
    "realestate": "נדל\"ן",
    "food": "אוכל",
    "business": "עסקים",
}


def platform_spec(platform: str) -> dict:
    p = platform.lower()
    if p not in PLATFORMS:
        raise ValueError(f"Unknown platform '{platform}'. Options: {', '.join(PLATFORMS)}")
    return PLATFORMS[p]


def ensure_dirs() -> None:
    for d in (FONTS_DIR, LUTS_DIR, SFX_DIR, MUSIC_DIR, BROLL_DIR, STICKERS_DIR, MODELS_DIR, PROFILES_DIR, WORK_DIR):
        d.mkdir(parents=True, exist_ok=True)

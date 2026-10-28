"""User settings from config.yaml (all automation knobs live here) + API keys from env/.env."""
from __future__ import annotations

import copy
import os
from functools import lru_cache
from pathlib import Path

import yaml

from . import config
from .profiles_default import deep_merge

DEFAULTS = {
    "niches": ["fitness", "realestate", "food", "business"],
    "languages": ["he", "en"],
    "scout": {
        "enabled": True,
        "platforms": ["youtube", "tiktok", "instagram"],
        "max_age_days": 90,
        "per_keyword": 25,
        "keywords_per_run": 6,
        "min_views": 5000,
        "success_quantile": 0.75,
        "regular_quantile": 0.40,
        "youtube_daily_quota": 8000,
        "request_delay_sec": 1.5,
        "analyze_per_run": 20,
        "keep_media": False,
    },
    "learn": {
        "min_samples": 16,
        "test_fraction": 0.25,
        "my_posts_weight": 3.0,
        "min_auc_gain": 0.0,
    },
    "feedback": {"checkpoints_hours": [24, 72, 168]},
    "schedule": {
        "timezone": "Asia/Jerusalem",
        "scout": "15 3 * * *",       # daily 03:15
        "feedback": "40 9 * * *",    # daily 09:40
        "learn": "30 4 * * 0",       # weekly, Sunday 04:30
    },
    "studio": {"variants": 3, "critic_target": 90, "critic_max_rounds": 5},
}

ENV_KEYS = ["ANTHROPIC_API_KEY", "YOUTUBE_API_KEY", "PEXELS_API_KEY", "PIXABAY_API_KEY", "ELEVENLABS_API_KEY",
            "METRICOOL_API_TOKEN", "METRICOOL_USER_ID", "METRICOOL_BLOG_ID", "BUFFER_ACCESS_TOKEN"]


def config_path() -> Path:
    return Path(os.environ.get("AUTOEDIT_CONFIG", config.ROOT / "config.yaml"))


def load_dotenv() -> None:
    p = config.ROOT / ".env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


@lru_cache(maxsize=1)
def load() -> dict:
    load_dotenv()
    p = config_path()
    user = yaml.safe_load(p.read_text(encoding="utf-8")) if p.exists() else {}
    return deep_merge(copy.deepcopy(DEFAULTS), user or {})


def reload() -> dict:
    load.cache_clear()
    return load()


def get(path: str, default=None):
    cur = load()
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur


def keys_status() -> dict:
    load_dotenv()
    return {k: bool(os.environ.get(k)) for k in ENV_KEYS}

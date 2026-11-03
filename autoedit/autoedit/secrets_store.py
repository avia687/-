"""API keys entered in Settings -> AI Services. Stored encrypted (Fernet) on this computer only, loaded into
the process environment at startup, never logged, never sent back to the browser."""
from __future__ import annotations

import json
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from . import config

SERVICES = {
    "ANTHROPIC_API_KEY": {"name": "Claude (Anthropic)", "what": "הבמאי, המבקר, העריכה בצ'אט והכותרות",
                          "where": "console.anthropic.com ← API Keys"},
    "YOUTUBE_API_KEY": {"name": "YouTube Data API", "what": "חיפוש סרטונים מצליחים בנישה",
                        "where": "console.cloud.google.com ← YouTube Data API v3 ← Credentials"},
    "PEXELS_API_KEY": {"name": "Pexels", "what": "B-roll חינמי ומורשה", "where": "pexels.com/api"},
    "PIXABAY_API_KEY": {"name": "Pixabay", "what": "B-roll חינמי (גיבוי)", "where": "pixabay.com/api/docs"},
    "ELEVENLABS_API_KEY": {"name": "ElevenLabs", "what": "קריינות טבעית ושכפול הקול שלך",
                           "where": "elevenlabs.io ← Profile ← API Keys"},
    "META_APP_ID": {"name": "Meta App ID", "what": "חיבור Instagram (OAuth רשמי)", "where": "developers.facebook.com ← My Apps"},
    "META_APP_SECRET": {"name": "Meta App Secret", "what": "חיבור Instagram (OAuth רשמי)",
                        "where": "developers.facebook.com ← App settings ← Basic"},
}


def _paths() -> tuple[Path, Path]:
    d = config.WORK_DIR / "secure"
    d.mkdir(parents=True, exist_ok=True)
    return d / "key", d / "secrets.enc"


def _fernet() -> Fernet:
    key_path, _ = _paths()
    if not key_path.exists():
        key_path.write_bytes(Fernet.generate_key())
        try:
            os.chmod(key_path, 0o600)
        except OSError:
            pass
    return Fernet(key_path.read_bytes())


def load() -> dict:
    _, data = _paths()
    if not data.exists():
        return {}
    try:
        return json.loads(_fernet().decrypt(data.read_bytes()))
    except (InvalidToken, ValueError):
        return {}


def save(values: dict) -> dict:
    cur = load()
    for k, v in values.items():
        if k not in SERVICES:
            continue
        v = (v or "").strip()
        if v:
            cur[k] = v
        else:
            cur.pop(k, None)
            os.environ.pop(k, None)
    _, data = _paths()
    data.write_bytes(_fernet().encrypt(json.dumps(cur).encode()))
    apply_env()
    return status()


def apply_env() -> None:
    for k, v in load().items():
        os.environ[k] = v


def status() -> list[dict]:
    stored = load()
    return [{"key": k, **meta, "configured": bool(stored.get(k) or os.environ.get(k)),
             "source": "app" if k in stored else ("env" if os.environ.get(k) else None)} for k, meta in SERVICES.items()]


def test(key: str) -> dict:
    """Check a key really works with one cheap request."""
    import requests

    v = os.environ.get(key) or load().get(key)
    if not v:
        return {"ok": False, "message": "לא הוגדר מפתח"}
    try:
        if key == "ANTHROPIC_API_KEY":
            import anthropic

            anthropic.Anthropic(api_key=v).models.list(limit=1)
        elif key == "YOUTUBE_API_KEY":
            r = requests.get("https://www.googleapis.com/youtube/v3/videoCategories",
                             params={"part": "snippet", "regionCode": "IL", "key": v}, timeout=15)
            r.raise_for_status()
        elif key == "PEXELS_API_KEY":
            requests.get("https://api.pexels.com/videos/search", headers={"Authorization": v},
                         params={"query": "city", "per_page": 1}, timeout=15).raise_for_status()
        elif key == "PIXABAY_API_KEY":
            requests.get("https://pixabay.com/api/videos/", params={"key": v, "q": "city", "per_page": 3},
                         timeout=15).raise_for_status()
        elif key == "ELEVENLABS_API_KEY":
            requests.get("https://api.elevenlabs.io/v1/user", headers={"xi-api-key": v}, timeout=15).raise_for_status()
        else:
            return {"ok": True, "message": "נשמר (ייבדק בחיבור)"}
        return {"ok": True, "message": "מחובר ועובד"}
    except Exception as e:
        status_code = getattr(getattr(e, "response", None), "status_code", None) or getattr(e, "status_code", None)
        if status_code in (401, 403):
            return {"ok": False, "message": "המפתח לא התקבל - בדוק שהעתקת אותו במלואו"}
        return {"ok": False, "message": "לא הצלחתי להתחבר כרגע - בדוק חיבור לאינטרנט ונסה שוב"}

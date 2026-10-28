"""SQLite store for the learning engine (scouted videos, features, my posts, model runs, job runs)."""
from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,            -- '<platform>:<native id>'
    platform TEXT, url TEXT, niche TEXT, title TEXT, description TEXT,
    channel_id TEXT, channel_title TEXT, followers INTEGER,
    views INTEGER, likes INTEGER, comments INTEGER, shares INTEGER,
    duration REAL, published_at TEXT, fetched_at TEXT,
    query TEXT, source TEXT, tags TEXT,
    success_score REAL, label TEXT,  -- 'success' | 'regular' | NULL (unlabeled)
    status TEXT DEFAULT 'new',      -- new | analyzed | failed | skipped
    error TEXT
);
CREATE INDEX IF NOT EXISTS ix_videos_niche ON videos(niche, platform, label, status);
CREATE TABLE IF NOT EXISTS features (
    video_id TEXT PRIMARY KEY, niche TEXT, vector TEXT, profile TEXT,
    hook_text TEXT, transcript TEXT, topic TEXT, why TEXT, analyzed_at TEXT
);
CREATE TABLE IF NOT EXISTS keywords (
    niche TEXT, keyword TEXT, kind TEXT, origin TEXT, added_at TEXT,
    uses INTEGER DEFAULT 0, hits INTEGER DEFAULT 0, last_used TEXT,
    PRIMARY KEY (niche, keyword)
);
CREATE TABLE IF NOT EXISTS my_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE, platform TEXT, niche TEXT,
    job_id TEXT, variant TEXT, plan_path TEXT, features TEXT,
    published_at TEXT, added_at TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS post_metrics (
    post_id INTEGER, checkpoint TEXT, ts TEXT, views INTEGER, likes INTEGER, comments INTEGER,
    shares INTEGER, retention REAL, avg_view_sec REAL, source TEXT,
    PRIMARY KEY (post_id, checkpoint)
);
CREATE TABLE IF NOT EXISTS ab_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, niche TEXT, platform TEXT,
    variants TEXT, chosen TEXT, created_at TEXT, post_id INTEGER
);
CREATE TABLE IF NOT EXISTS model_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, niche TEXT, platform TEXT, created_at TEXT,
    n_train INTEGER, n_test INTEGER, auc REAL, accuracy REAL, baseline_auc REAL,
    importances TEXT, promoted INTEGER, profile_version TEXT, model_path TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, niche TEXT, started TEXT, finished TEXT,
    status TEXT, summary TEXT, errors TEXT
);
CREATE TABLE IF NOT EXISTS quota (
    source TEXT, day TEXT, used INTEGER, blocked_until TEXT, PRIMARY KEY (source, day)
);
CREATE TABLE IF NOT EXISTS prefs (
    key TEXT PRIMARY KEY, value TEXT, updated TEXT
);
"""

_lock = threading.RLock()
_DB_PATH: Path | None = None


def db_path() -> Path:
    global _DB_PATH
    if _DB_PATH is None:
        _DB_PATH = config.WORK_DIR / "autoedit.db"
    return _DB_PATH


def set_db_path(p: str | Path) -> None:
    global _DB_PATH
    _DB_PATH = Path(p)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect():
    p = db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        con = sqlite3.connect(p, timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript(SCHEMA)
        try:
            yield con
            con.commit()
        finally:
            con.close()


def rows(sql: str, args: tuple = ()) -> list[dict]:
    with connect() as con:
        return [dict(r) for r in con.execute(sql, args).fetchall()]


def one(sql: str, args: tuple = ()) -> dict | None:
    r = rows(sql, args)
    return r[0] if r else None


def execute(sql: str, args: tuple = ()) -> int:
    with connect() as con:
        cur = con.execute(sql, args)
        return cur.lastrowid


def upsert_video(v: dict) -> bool:
    """Insert a scouted video; refresh its stats if it already exists. Returns True if new."""
    cols = ["id", "platform", "url", "niche", "title", "description", "channel_id", "channel_title", "followers",
            "views", "likes", "comments", "shares", "duration", "published_at", "fetched_at", "query", "source", "tags"]
    vals = [v.get(c) if c != "tags" else json.dumps(v.get("tags") or [], ensure_ascii=False) for c in cols]
    with connect() as con:
        exists = con.execute("SELECT 1 FROM videos WHERE id=?", (v["id"],)).fetchone()
        if exists:
            con.execute("UPDATE videos SET views=?, likes=?, comments=?, shares=?, followers=COALESCE(?, followers), "
                        "fetched_at=? WHERE id=?",
                        (v.get("views"), v.get("likes"), v.get("comments"), v.get("shares"), v.get("followers"),
                         v.get("fetched_at"), v["id"]))
            return False
        con.execute(f"INSERT INTO videos ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", vals)
        return True


def start_run(kind: str, niche: str | None = None) -> int:
    return execute("INSERT INTO runs (kind, niche, started, status) VALUES (?,?,?,?)", (kind, niche, now(), "running"))


def finish_run(run_id: int, status: str, summary: dict, errors: list) -> None:
    execute("UPDATE runs SET finished=?, status=?, summary=?, errors=? WHERE id=?",
            (now(), status, json.dumps(summary, ensure_ascii=False), json.dumps(errors[-50:], ensure_ascii=False), run_id))


def get_pref(key: str, default=None):
    r = one("SELECT value FROM prefs WHERE key=?", (key,))
    return json.loads(r["value"]) if r else default


def set_pref(key: str, value) -> None:
    execute("INSERT INTO prefs (key, value, updated) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, "
            "updated=excluded.updated", (key, json.dumps(value, ensure_ascii=False), now()))

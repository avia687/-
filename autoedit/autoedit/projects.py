"""Projects: the user's work, saved continuously. Every change is a version (undo / redo / restore),
nothing is lost on a crash: metadata lives in SQLite, plans and media on disk under workspace/projects."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from . import config, db

SCHEMA = """CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT, created TEXT, updated TEXT, status TEXT,
    platform TEXT, goal TEXT, style TEXT, target_seconds REAL, brief TEXT,
    thumbnail TEXT, selected INTEGER DEFAULT 1, duration REAL, job_id TEXT, deleted INTEGER DEFAULT 0)"""

STATUS_HE = {"queued": "בתור", "working": "בעבודה", "ready": "מוכן לבדיקה", "exported": "יוצא",
             "failed": "צריך את תשומת לבך", "interrupted": "הופסק"}


def _ensure() -> None:
    with db.connect() as con:
        con.execute(SCHEMA)


def project_dir(pid: str) -> Path:
    d = config.WORK_DIR / "jobs" / pid  # projects share the job folder: media, versions, renders
    d.mkdir(parents=True, exist_ok=True)
    return d


def create(pid: str, name: str, **fields) -> dict:
    _ensure()
    cols = ["platform", "goal", "style", "target_seconds", "brief", "job_id"]
    db.execute(f"INSERT OR REPLACE INTO projects (id, name, created, updated, status, {','.join(cols)}) "
               f"VALUES (?,?,?,?,?,{','.join('?' * len(cols))})",
               (pid, name, db.now(), db.now(), "queued", *[fields.get(c) for c in cols]))
    return get(pid)


def update(pid: str, **fields) -> None:
    _ensure()
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    db.execute(f"UPDATE projects SET {sets}, updated=? WHERE id=?", (*fields.values(), db.now(), pid))


def get(pid: str) -> dict | None:
    _ensure()
    return db.one("SELECT * FROM projects WHERE id=? AND deleted=0", (pid,))


def list_all() -> list[dict]:
    _ensure()
    return db.rows("SELECT * FROM projects WHERE deleted=0 ORDER BY updated DESC")


def delete(pid: str, remove_files: bool = True) -> None:
    _ensure()
    db.execute("UPDATE projects SET deleted=1, updated=? WHERE id=?", (db.now(), pid))
    if remove_files:
        shutil.rmtree(config.WORK_DIR / "jobs" / pid, ignore_errors=True)
        shutil.rmtree(config.WORK_DIR / "uploads" / pid, ignore_errors=True)


def recover_interrupted() -> list[str]:
    """After a crash/restart: work that was in progress is marked so the user can resume it."""
    _ensure()
    stuck = [p["id"] for p in db.rows("SELECT id FROM projects WHERE status IN ('queued','working') AND deleted=0")]
    for pid in stuck:
        update(pid, status="interrupted")
    return stuck


# ------------------------------------------------------------------ versions (per variant)
def _vdir(pid: str, k: int) -> Path:
    d = project_dir(pid) / f"v{k}" / "history"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _state(pid: str, k: int) -> dict:
    p = _vdir(pid, k) / "state.json"
    return json.loads(p.read_text()) if p.exists() else {"pointer": 0, "count": 0, "notes": {}}


def _write_state(pid: str, k: int, st: dict) -> None:
    (_vdir(pid, k) / "state.json").write_text(json.dumps(st, ensure_ascii=False))


def _write_current(pid: str, k: int, plan: dict) -> None:
    (project_dir(pid) / f"v{k}" / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1, default=str),
                                                          encoding="utf-8")


def record(pid: str, k: int, plan: dict, note: str) -> int:
    """Autosave a new version (drops any redo history after the current pointer)."""
    st = _state(pid, k)
    d = _vdir(pid, k)
    for n in range(st["pointer"] + 1, st["count"] + 1):
        (d / f"{n:04d}.json").unlink(missing_ok=True)
        st["notes"].pop(str(n), None)
    n = st["pointer"] + 1
    (d / f"{n:04d}.json").write_text(json.dumps(plan, ensure_ascii=False, default=str), encoding="utf-8")
    st.update(pointer=n, count=n)
    st["notes"][str(n)] = {"note": note, "ts": db.now()}
    _write_state(pid, k, st)
    _write_current(pid, k, plan)
    if get(pid):
        update(pid)
    return n


def history(pid: str, k: int) -> dict:
    st = _state(pid, k)
    return {"pointer": st["pointer"], "count": st["count"],
            "versions": [{"n": int(n), **v} for n, v in sorted(st["notes"].items(), key=lambda x: int(x[0]))],
            "can_undo": st["pointer"] > 1, "can_redo": st["pointer"] < st["count"]}


def restore(pid: str, k: int, n: int) -> dict:
    st = _state(pid, k)
    if not 1 <= n <= st["count"]:
        raise ValueError("no such version")
    plan = json.loads((_vdir(pid, k) / f"{n:04d}.json").read_text(encoding="utf-8"))
    st["pointer"] = n
    _write_state(pid, k, st)
    _write_current(pid, k, plan)
    return plan


def undo(pid: str, k: int) -> dict | None:
    st = _state(pid, k)
    return restore(pid, k, st["pointer"] - 1) if st["pointer"] > 1 else None


def redo(pid: str, k: int) -> dict | None:
    st = _state(pid, k)
    return restore(pid, k, st["pointer"] + 1) if st["pointer"] < st["count"] else None


def duplicate(pid: str, k: int) -> int:
    """Copy the current version of a variant into a new variant slot (to try another direction)."""
    root = project_dir(pid)
    plan = json.loads((root / f"v{k}" / "plan.json").read_text(encoding="utf-8"))
    new_k = max(int(p.name[1:]) for p in root.glob("v[0-9]*") if p.name[1:].isdigit()) + 1
    (root / f"v{new_k}").mkdir(parents=True, exist_ok=True)
    record(pid, new_k, plan, f"שכפול של גרסה {k}")
    return new_k

"""Background task queue (Huey on SQLite: persistent, no Redis needed) + job progress store.
The web server starts an in-process consumer; `huey_consumer autoedit.tasks.huey` also works."""
from __future__ import annotations

import json
import logging
import os
import traceback

from huey import SqliteHuey

from . import config, db

log = logging.getLogger(__name__)
config.ensure_dirs()
huey = SqliteHuey("autoedit", filename=str(config.WORK_DIR / "queue.db"),
                  immediate=os.environ.get("AUTOEDIT_QUEUE") == "immediate")

JOBS_SQL = """CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, kind TEXT, status TEXT, progress REAL, message TEXT,
    created TEXT, updated TEXT, input TEXT, result TEXT, error TEXT, parent TEXT)"""


def _ensure():
    with db.connect() as con:
        con.execute(JOBS_SQL)


def new_job(job_id: str, kind: str, payload: dict, parent: str | None = None) -> None:
    _ensure()
    db.execute("INSERT OR REPLACE INTO jobs (id, kind, status, progress, message, created, updated, input, parent) "
               "VALUES (?,?,?,?,?,?,?,?,?)", (job_id, kind, "queued", 0.0, "בתור", db.now(), db.now(),
                                               json.dumps(payload, ensure_ascii=False), parent))


def update(job_id: str, **kw) -> None:
    _ensure()
    sets = ", ".join(f"{k}=?" for k in kw) + ", updated=?"
    vals = [json.dumps(v, ensure_ascii=False, default=str) if k == "result" else v for k, v in kw.items()]
    db.execute(f"UPDATE jobs SET {sets} WHERE id=?", (*vals, db.now(), job_id))


def get(job_id: str) -> dict | None:
    _ensure()
    j = db.one("SELECT * FROM jobs WHERE id=?", (job_id,))
    if j:
        for k in ("input", "result"):
            j[k] = json.loads(j[k]) if j.get(k) else None
    return j


def progress_cb(job_id: str):
    last = {"p": -1.0}

    def cb(frac: float, msg: str):
        if frac - last["p"] >= 0.01 or frac >= 1.0:
            last["p"] = frac
            update(job_id, progress=round(float(frac), 3), message=msg, status="running")
    return cb


def _run(job_id: str, fn):
    update(job_id, status="running", message="מתחיל")
    try:
        res = fn(progress_cb(job_id))
        update(job_id, status="done", progress=1.0, message="מוכן", result=res)
        return res
    except Exception as e:  # report, never crash the worker
        log.error("job %s failed:\n%s", job_id, traceback.format_exc())
        update(job_id, status="failed", message="נכשל", error=f"{type(e).__name__}: {e}"[:1500])
        return None


@huey.task()
def task_create(job_id: str, inputs: list[str], brief: str, narration: str = "auto", overrides: dict | None = None):
    from .studio import run

    return _run(job_id, lambda cb: run.create(inputs, brief, job_id=job_id, progress=cb, narration=narration))


@huey.task()
def task_edit(job_id: str, video: str, niche: str, platform: str, options: dict):
    from .pipeline import edit

    out = config.WORK_DIR / "jobs" / job_id / "edited.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)

    def go(cb):
        res = edit(video, niche, platform, out, progress=cb, **options)
        (out.parent / "plan.json").write_text(json.dumps(res["plan"], ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        return {"video": str(out), "plan_path": str(out.parent / "plan.json"), "score": res["plan"]["score"]}
    return _run(job_id, go)


@huey.task()
def task_render(job_id: str, plan_path: str, out: str, preview: bool = False):
    from pathlib import Path

    from .render import render

    def go(cb):
        plan = json.loads(Path(plan_path).read_text(encoding="utf-8"))
        res = render(plan, out, Path(out).parent / "w", progress=cb, preview=preview)
        from .studio.critic import critique
        from .style.library import load_profile

        rev = critique(plan, out, load_profile(plan["meta"]["niche"]))
        return {**res, "video": out, "critic": {"score": rev["score"], "notes": rev["notes"]}}
    return _run(job_id, go)


@huey.task()
def task_export(job_id: str, plan_path: str, platforms: list[str], codec: str = "h264"):
    from pathlib import Path

    from .studio import export

    def go(cb):
        plan = json.loads(Path(plan_path).read_text(encoding="utf-8"))
        files = export.export_all(plan, Path(plan_path).parent / "export", platforms, codec, progress=cb)
        return {"files": files}
    return _run(job_id, go)


@huey.task()
def task_learn(job_id: str, niche: str, scout: bool = True):
    from .learn.engine import run_cycle

    def go(cb):
        cb(0.05, "מחפש ולומד")
        res = run_cycle(niche, do_scout=scout)
        return {k: v for k, v in res.items() if k not in ("layer",)}
    return _run(job_id, go)


_consumer = None


def start_consumer(workers: int = 2):
    """In-process consumer (thread workers) so `autoedit serve` is all you need."""
    global _consumer
    if _consumer is not None or huey.immediate:
        return _consumer
    _consumer = huey.create_consumer(workers=workers, worker_type="thread", periodic=False, check_worker_health=False)
    _consumer._set_signal_handlers = lambda: None  # leave Ctrl+C handling to the web server
    _consumer.start()
    return _consumer

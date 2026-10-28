"""Background automation (APScheduler): scout daily, feedback daily, retrain weekly.
Schedules come from config.yaml (cron syntax). Every job logs and swallows its own errors."""
from __future__ import annotations

import logging
import logging.handlers
import threading

from .. import config, settings

log = logging.getLogger("autoedit.scheduler")
_sched = None
_lock = threading.Lock()


def setup_logging() -> None:
    d = config.WORK_DIR / "logs"
    d.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger("autoedit")
    if any(isinstance(h, logging.handlers.RotatingFileHandler) for h in root.handlers):
        return
    h = logging.handlers.RotatingFileHandler(d / "autoedit.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8")
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root.addHandler(h)
    root.setLevel(logging.INFO)


def job_scout() -> None:
    from ..scout import scout

    for niche in settings.get("niches", []):
        try:
            res = scout.run(niche)
            log.info("scout %s: new=%s labels=%s errors=%d", niche, res["new"], res["labels"], len(res["errors"]))
        except Exception:
            log.exception("scout failed for %s", niche)
        try:
            from .features import collect

            log.info("analyze %s: %s", niche, collect(niche))
        except Exception:
            log.exception("analysis failed for %s", niche)


def job_learn() -> None:
    from .engine import learn

    for niche in settings.get("niches", []):
        try:
            res = learn(niche)
            log.info("learn %s: %s", niche, {k: res.get(k) for k in ("status", "auc", "baseline_auc", "version", "promoted")})
        except Exception:
            log.exception("learning failed for %s", niche)


def job_feedback() -> None:
    from .feedback import run

    try:
        log.info("feedback: %s", run())
    except Exception:
        log.exception("feedback failed")


def start() -> object | None:
    global _sched
    with _lock:
        if _sched is not None:
            return _sched
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        setup_logging()
        cfg = settings.load()["schedule"]
        tz = cfg.get("timezone", "UTC")
        s = BackgroundScheduler(timezone=tz, job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600})
        if settings.get("scout.enabled", True):
            s.add_job(job_scout, CronTrigger.from_crontab(cfg["scout"], timezone=tz), id="scout", replace_existing=True)
        s.add_job(job_feedback, CronTrigger.from_crontab(cfg["feedback"], timezone=tz), id="feedback", replace_existing=True)
        s.add_job(job_learn, CronTrigger.from_crontab(cfg["learn"], timezone=tz), id="learn", replace_existing=True)
        s.start()
        _sched = s
        log.info("scheduler started: %s", [(j.id, str(j.next_run_time)) for j in s.get_jobs()])
        return s


def jobs() -> list[dict]:
    if _sched is None:
        return []
    return [{"id": j.id, "next_run": str(j.next_run_time)} for j in _sched.get_jobs()]


def stop() -> None:
    global _sched
    if _sched is not None:
        _sched.shutdown(wait=False)
        _sched = None

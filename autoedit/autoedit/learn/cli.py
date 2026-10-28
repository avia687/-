"""CLI: autoedit scout | learn | cycle | feedback | add-post | daemon | rollback | versions."""
from __future__ import annotations

import json
import time


def _print(obj) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=1, default=str)[:6000])


def register(sub) -> None:
    p = sub.add_parser("scout", help="חפש סרטונים מצליחים בנישה")
    p.add_argument("--niche", required=True)
    p.set_defaults(func=lambda a: (_print(__import__("autoedit.scout.scout", fromlist=["run"]).run(a.niche)), 0)[1])

    p = sub.add_parser("learn", help="נתח, אמן ועדכן פרופיל")
    p.add_argument("--niche", required=True)
    p.set_defaults(func=lambda a: (_print(_learn(a.niche)), 0)[1])

    p = sub.add_parser("cycle", help="מחזור מלא: חיפוש, ניתוח, אימון, עדכון פרופיל")
    p.add_argument("--niche", required=True)
    p.add_argument("--no-scout", action="store_true")
    p.set_defaults(func=lambda a: (_print(_cycle(a.niche, not a.no_scout)), 0)[1])

    p = sub.add_parser("feedback", help="משוך ביצועים של הסרטונים שלי")
    p.set_defaults(func=lambda a: (_print(__import__("autoedit.learn.feedback", fromlist=["run"]).run()), 0)[1])

    p = sub.add_parser("add-post", help="רשום סרטון שפרסמתי")
    p.add_argument("url")
    p.add_argument("--niche", required=True)
    p.add_argument("--plan", help="קובץ plan.json של העריכה")
    p.add_argument("--variant")
    p.set_defaults(func=_add_post)

    p = sub.add_parser("versions", help="היסטוריית גרסאות פרופיל")
    p.add_argument("--niche", required=True)
    p.set_defaults(func=_versions)

    p = sub.add_parser("rollback", help="חזור לגרסת פרופיל קודמת")
    p.add_argument("--niche", required=True)
    p.add_argument("version", help="למשל v0002, או default")
    p.set_defaults(func=_rollback)

    p = sub.add_parser("daemon", help="הרץ את ה-scheduler ברקע (בלי ממשק)")
    p.set_defaults(func=_daemon)


def _learn(niche):
    from .engine import learn
    from .features import collect

    return {"analyze": collect(niche), "learn": {k: v for k, v in learn(niche).items() if k != "layer"}}


def _cycle(niche, do_scout):
    from .engine import run_cycle

    return {k: v for k, v in run_cycle(niche, do_scout).items() if k != "layer"}


def _add_post(a):
    from .feedback import add_post

    plan = json.load(open(a.plan, encoding="utf-8")) if a.plan else None
    _print({"post_id": add_post(a.url, a.niche, plan, variant=a.variant, plan_path=a.plan)})
    return 0


def _versions(a):
    from ..style import library

    _print({"active": library.active_version(a.niche), "versions": library.list_versions(a.niche)})
    return 0


def _rollback(a):
    from ..style import library

    library.set_active(a.niche, None if a.version == "default" else a.version)
    _print({"active": library.active_version(a.niche)})
    return 0


def _daemon(a):
    from .scheduler import jobs, start

    start()
    _print(jobs())
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        return 0

"""Command line interface.

  edit video.mp4 --niche fitness --platform tiktok
  autoedit analyze <url|file> ... --niche fitness
  autoedit serve
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from . import config


def _progress(frac: float, msg: str) -> None:
    bar = int(frac * 30)
    sys.stderr.write(f"\r[{'#' * bar}{'.' * (30 - bar)}] {int(frac * 100):3d}% {msg[:40]:<40}")
    sys.stderr.flush()
    if frac >= 1:
        sys.stderr.write("\n")


def _parse_box(s: str):
    if s in (None, "", "none"):
        return None
    if s == "auto":
        return "auto"
    x, y, w, h = (float(v) for v in s.split(","))
    return [{"x": x, "y": y, "w": w, "h": h}]


def _background(s: str | None):
    if not s or s == "none":
        return None
    if s == "blur":
        return {"mode": "blur"}
    kind, _, val = s.partition(":")
    if kind in ("image", "video", "color"):
        return {"mode": kind, "value": val}
    p = Path(s)
    if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
        return {"mode": "image", "value": s}
    return {"mode": "video", "value": s}


def cmd_edit(a) -> int:
    from .pipeline import edit
    from .render import render

    if a.plan:  # re-render an edited plan
        plan = json.loads(Path(a.plan).read_text(encoding="utf-8"))
        out = a.output or Path(a.plan).with_suffix(".mp4")
        res = render(plan, out, Path(a.plan).parent, progress=_progress, preview=a.preview)
        print(json.dumps(res, ensure_ascii=False))
        return 0
    res = edit(a.video, a.niche, a.platform, a.output, progress=_progress, plan_only=a.plan_only, preview=a.preview,
               language=a.lang, aspect=a.aspect, remove_logo=_parse_box(a.remove_logo), background=_background(a.bg),
               music=a.music, whisper_model=a.whisper_model, variant=a.variant)
    plan = res["plan"]
    sc = plan["score"]
    print(f"\nציון ויראליות: {sc['score']}/100")
    for s in sc["suggestions"]:
        print(f"  • {s}")
    if a.save_plan:
        Path(a.save_plan).write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"plan saved: {a.save_plan}")
    if "render" in res:
        print(f"output: {res['render']['path']}")
    return 0


def cmd_analyze(a) -> int:
    from .style.analyze import analyze_many

    res = analyze_many(a.inputs, a.niche, progress=_progress)
    print(json.dumps(res, ensure_ascii=False, indent=1)[:4000])
    return 0


def cmd_serve(a) -> int:
    import uvicorn

    uvicorn.run("autoedit.server:app", host=a.host, port=a.port, log_level="info")
    return 0


def cmd_niches(a) -> int:
    from .style.library import list_niches, load_profile

    for n in list_niches():
        p = load_profile(n)
        print(f"{n:<12} profile={p.get('profile_version')} refs={len(p.get('sources', []))} "
              f"shot={p['pacing']['avg_shot_sec']}s bpm={p['music'].get('bpm')} look={p['color'].get('look')}")
    return 0


def build_parser(prog: str = "autoedit") -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog=prog, description="AutoEdit - עריכת וידאו אוטומטית")
    ap.add_argument("-v", "--verbose", action="store_true")
    sub = ap.add_subparsers(dest="cmd")

    e = sub.add_parser("edit", help="ערוך סרטון")
    add_edit_args(e)
    e.set_defaults(func=cmd_edit)

    an = sub.add_parser("analyze", help="נתח סרטוני רפרנס ובנה פרופיל סגנון")
    an.add_argument("inputs", nargs="+", help="קישורים (yt-dlp) או קבצים")
    an.add_argument("--niche", required=True)
    an.set_defaults(func=cmd_analyze)

    s = sub.add_parser("serve", help="הפעל ממשק ווב")
    s.add_argument("--host", default="0.0.0.0")
    s.add_argument("--port", type=int, default=8765)
    s.set_defaults(func=cmd_serve)

    n = sub.add_parser("niches", help="הצג נישות ופרופילים")
    n.set_defaults(func=cmd_niches)

    try:
        from .learn.cli import register as register_learning

        register_learning(sub)
    except ImportError:
        pass
    try:
        from .studio.cli import register as register_studio

        register_studio(sub)
    except ImportError:
        pass
    return ap


def add_edit_args(e: argparse.ArgumentParser) -> None:
    e.add_argument("video", nargs="?")
    e.add_argument("--niche", default="business", help=f"נישה ({', '.join(config.NICHES)} או כל שם)")
    e.add_argument("--platform", default="tiktok", choices=list(config.PLATFORMS))
    e.add_argument("-o", "--output")
    e.add_argument("--aspect", choices=list(config.ASPECTS))
    e.add_argument("--lang", help="שפה (he/en/...) - ברירת מחדל: זיהוי אוטומטי")
    e.add_argument("--bg", help="blur | image:path | video:path | color:#hex")
    e.add_argument("--remove-logo", help="auto | x,y,w,h (יחסי 0-1)")
    e.add_argument("--music", help="קובץ מוזיקה (ברירת מחדל: מהספרייה לפי הנישה)")
    e.add_argument("--whisper-model")
    e.add_argument("--variant", choices=["main", "hook_alt", "fast"])
    e.add_argument("--plan-only", action="store_true", help="רק תוכנית עריכה (JSON) בלי רינדור")
    e.add_argument("--save-plan")
    e.add_argument("--plan", help="רנדר מחדש תוכנית JSON ערוכה")
    e.add_argument("--preview", action="store_true", help="רינדור מהיר ברזולוציה נמוכה")


def main(argv: list[str] | None = None) -> int:
    ap = build_parser()
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO if a.verbose else logging.WARNING, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config.ensure_dirs()
    if not getattr(a, "func", None):
        ap.print_help()
        return 1
    return a.func(a)


def edit_main(argv: list[str] | None = None) -> int:
    """`edit video.mp4 --niche fitness --platform tiktok`"""
    ap = argparse.ArgumentParser(prog="edit", description="AutoEdit - עריכה אוטומטית של סרטון")
    add_edit_args(ap)
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO if a.verbose else logging.WARNING)
    config.ensure_dirs()
    if not a.video and not a.plan:
        ap.error("video is required")
    return cmd_edit(a)


if __name__ == "__main__":
    sys.exit(main())

"""The Editor Exam: 5 scenarios, each must pass the Critic (90+). Produces an HTML before/after report.

  python tests/editor_exam.py MEDIA_DIR OUT_DIR
MEDIA_DIR holds one folder per scenario:
  s1_photos  s2_talking  s3_mix  s4_lowq  s5_silent
(tests/fetch_exam_media.sh builds it from public OpenCV sample media.)
"""
from __future__ import annotations

import base64
import html
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SCENARIOS = [
    ("s1_photos", "רק תמונות", "סרטון למכירת דירה 4 חדרים 120 מ\"ר בתל אביב, יוקרתי"),
    ("s2_talking", "סרטון דיבור למצלמה", ""),
    ("s3_mix", "ערבוב תמונות וסרטונים", "סרטון קצבי לעסק שלי, אנרגטי"),
    ("s4_lowq", "חומר באיכות נמוכה", "סרטון מרגש מהחופשה, זיקוקים"),
    ("s5_silent", "סרטון בלי קול", "סרטון כיפי לרשתות"),
]


def sheet_raw(folder: Path, n: int = 6) -> np.ndarray:
    from autoedit.studio.ingest import expand, kind_of

    tiles = []
    for p in expand([folder]):
        if len(tiles) >= n:
            break
        if kind_of(p) == "image":
            from autoedit.studio.ingest import normalize_image

            img = cv2.imread(str(p)) if p.suffix.lower() not in (".heic", ".heif") else None
            if img is not None:
                tiles.append(img)
        elif kind_of(p) == "video":
            cap = cv2.VideoCapture(str(p))
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            for i in np.linspace(total * 0.1, total * 0.9, 2).astype(int):
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
                ok, f = cap.read()
                if ok:
                    tiles.append(f)
            cap.release()
    tiles = [cv2.resize(t, (200, int(200 * t.shape[0] / t.shape[1]))) for t in tiles[:n]]
    h = max(t.shape[0] for t in tiles)
    tiles = [cv2.copyMakeBorder(t, 0, h - t.shape[0], 0, 4, cv2.BORDER_CONSTANT, value=(23, 15, 15)) for t in tiles]
    return np.hstack(tiles)


def sheet_video(path: str, n: int = 6) -> np.ndarray:
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    tiles = []
    for i in np.linspace(total * 0.03, total * 0.97, n).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
        ok, f = cap.read()
        if ok:
            f = cv2.resize(f, (150, int(150 * f.shape[0] / f.shape[1])))
            cv2.putText(f, f"{i / fps:.1f}s", (5, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
            tiles.append(cv2.copyMakeBorder(f, 0, 0, 0, 4, cv2.BORDER_CONSTANT, value=(23, 15, 15)))
    cap.release()
    return np.hstack(tiles)


def b64(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 82])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


def main(media: str, out: str) -> None:
    import os

    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("AUTOEDIT_WORK_DIR", str(out_dir / "work"))
    from autoedit import config

    config.WORK_DIR = Path(os.environ["AUTOEDIT_WORK_DIR"])
    from autoedit.media import probe
    from autoedit.studio import critic, run

    rows = []
    for key, name, brief in SCENARIOS:
        folder = Path(media) / key
        if not folder.exists():
            print("skip", key)
            continue
        t0 = time.time()
        print(f"== {key}: {name}", flush=True)
        try:
            done = config.WORK_DIR / "jobs" / f"exam_{key}" / "result.json"
            if done.exists():  # resume: scenarios that already finished are not re-rendered
                res = json.loads(done.read_text(encoding="utf-8"))
            else:
                res = run.create([str(folder)], brief, job_id=f"exam_{key}", progress=lambda f, m: None)
            best = res["versions"][0]
            plan = json.loads((Path(best["dir"]) / "plan.json").read_text(encoding="utf-8"))
            info = probe(best["video"])
            loud = critic._loudness(best["video"])
            rows.append({"key": key, "name": name, "brief": brief, "ok": best["score"] >= 90, "score": best["score"],
                         "all_scores": [v["score"] for v in res["versions"]], "rounds": plan["critic"]["rounds"],
                         "mode": plan["meta"].get("mode"), "niche": res["concept"]["niche"], "mood": res["concept"]["mood"],
                         "duration": round(info.duration, 1), "size": f"{info.width}x{info.height}", "lufs": loud["lufs"],
                         "video": best["video"], "before": b64(sheet_raw(folder)), "after": b64(sheet_video(best["video"])),
                         "notes": best["notes"], "elapsed": round(time.time() - t0)})
            print(f"   score {best['score']} (all {rows[-1]['all_scores']}) {rows[-1]['duration']}s {loud['lufs']} LUFS", flush=True)
        except Exception as e:
            import traceback

            traceback.print_exc()
            rows.append({"key": key, "name": name, "brief": brief, "ok": False, "score": 0, "error": str(e)[:400]})
    (out_dir / "exam.json").write_text(json.dumps([{k: v for k, v in r.items() if k not in ("before", "after")} for r in rows],
                                                  ensure_ascii=False, indent=1))
    write_html(rows, out_dir / "exam_report.html")
    print("passed", sum(r["ok"] for r in rows), "/", len(rows))


def write_html(rows: list[dict], path: Path) -> None:
    cards = []
    for r in rows:
        if r.get("error"):
            cards.append(f"<section class='card fail'><h2>{html.escape(r['name'])}</h2><p>שגיאה: {html.escape(r['error'])}</p></section>")
            continue
        rounds = " → ".join(str(x["score"]) for x in r["rounds"])
        cards.append(f"""<section class='card {'pass' if r['ok'] else 'fail'}'>
<h2>{html.escape(r['name'])} <span class='score'>{r['score']}</span></h2>
<p class='meta'>בריף: {html.escape(r['brief'] or '—')} · מצב: {r['mode']} · נישה: {r['niche']} · {r['duration']} שנ' · {r['size']} · {r['lufs']} LUFS · סבבי מבקר: {rounds} · 3 גרסאות: {r['all_scores']}</p>
<h3>לפני (חומר גולמי)</h3><img src='{r['before']}'>
<h3>אחרי (הגרסה המומלצת)</h3><img src='{r['after']}'>
{"<p class='notes'>הערות: " + html.escape('; '.join(r['notes'])) + "</p>" if r['notes'] else ""}
</section>""")
    passed = sum(r["ok"] for r in rows)
    path.write_text(f"""<!doctype html><html lang='he' dir='rtl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>מבחן העורך</title><style>
body{{background:#0f0f17;color:#eee;font-family:Heebo,system-ui,sans-serif;max-width:1100px;margin:auto;padding:16px}}
.card{{background:#171724;border:1px solid #2b2b40;border-radius:14px;padding:16px;margin:16px 0}} .pass{{border-color:#16a34a}} .fail{{border-color:#dc2626}}
img{{max-width:100%;border-radius:8px}} .score{{background:#14532d;color:#86efac;padding:2px 10px;border-radius:99px}} .meta,.notes{{color:#9a9ab3;font-size:14px}}
</style></head><body><h1>מבחן העורך: {passed}/{len(rows)} עברו את המבקר (90+)</h1>
<p class='meta'>המבקר שהריץ את המבחן הוא מבקר החוקים המקומי (בלי מפתח Claude). ציון עצמי מראה עמידה בכללי העריכה, ואינו הוכחה לאיכות בעיני צופים.</p>
{''.join(cards)}</body></html>""", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

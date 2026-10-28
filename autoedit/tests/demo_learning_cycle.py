"""Full learning-cycle demo (offline-capable).

1. Builds a corpus of short videos edited in many different styles from raw footage, each with
   view/like/follower stats where (unknown to the system) fast pacing + captions + music + an
   on-screen hook perform better.
2. Serves them through a local mock of the YouTube Data API v3 (same JSON shape) + HTTP media URLs.
3. Runs the real cycle: scout (YouTubeAPI client) -> yt-dlp download -> analyze -> train -> profile version.
4. Edits the same raw video before and after learning and writes a comparison report.

Usage: python tests/demo_learning_cycle.py OUT_DIR [N_VIDEOS]
With a real YOUTUBE_API_KEY on an open network, `autoedit cycle --niche fitness` does steps 2-3 for real.
"""
from __future__ import annotations

import copy
import json
import math
import os
import random
import socket
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def style_profile(base: dict, st: dict) -> dict:
    p = copy.deepcopy(base)
    if not st["fast"]:
        p["pacing"]["max_silence"] = 1.4
        p["zoom"]["punch_in_per_min"] = 0
        p["transitions"]["per_min"] = 0
    p["captions"]["enabled"] = st["captions"]
    p["music"]["present"] = st["music"]
    p["hook"]["has_text_overlay"] = st["title"]
    p["color"]["look"] = st["look"]
    p["overlays"]["emoji_per_min"] = 4 if st["captions"] else 0
    return p


def build_corpus(out: Path, raws: list[Path], n: int, seed: int = 3) -> list[dict]:
    from autoedit import pipeline
    from autoedit.render import render
    from autoedit.style.library import load_profile

    rng = random.Random(seed)
    base = load_profile("fitness", version=None)
    corpus = []
    out.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        st = {"fast": rng.random() < 0.5, "captions": rng.random() < 0.5, "music": rng.random() < 0.6,
              "title": rng.random() < 0.5, "look": rng.choice(["punchy", "neutral", "warm", "cinematic"])}
        raw = raws[i % len(raws)]
        prof = style_profile(base, st)
        plan = pipeline.build_plan(raw, "fitness", "tiktok", profile=prof, seed=i)
        if not st["captions"]:
            plan["captions"]["enabled"] = False
        if not st["music"]:
            plan["music"]["enabled"] = False
        if not st["fast"]:
            plan["punch"], plan["transitions"], plan["emojis"] = [], [], []
            for c in plan["clips"]:
                c["zoom"] = 1.0
        # vary content length: random contiguous subset of clips
        k = len(plan["clips"])
        keep = max(3, int(k * rng.uniform(0.5, 1.0)))
        start = rng.randint(0, k - keep)
        plan["clips"] = plan["clips"][start:start + keep]
        vid = f"vid{i:03d}xyzab"[:11]
        path = out / f"{vid}.mp4"
        if not path.exists():
            render(plan, path, out / f"w_{vid}", preview=True)
        q = 1.3 * st["fast"] + 1.1 * st["captions"] + 0.6 * st["music"] + 0.5 * st["title"] + rng.gauss(0, 0.55)
        followers = int(10 ** rng.uniform(3.7, 5.7))
        views = int(followers * math.exp(q - 1.6 + rng.gauss(0, 0.35)) * rng.uniform(0.6, 1.4))
        eng = 0.015 + 0.05 / (1 + math.exp(-(q - 1.5)))
        corpus.append({"id": vid, "style": st, "followers": followers, "views": max(300, views),
                       "likes": int(views * eng), "comments": int(views * eng * 0.06),
                       "days": rng.randint(2, 70), "title": f"Fitness tip #{i}", "path": str(path)})
        print(f"  corpus {i + 1}/{n}: {st} views={views}", flush=True)
    (out / "corpus.json").write_text(json.dumps(corpus, indent=1))
    return corpus


class MockYouTube(SimpleHTTPRequestHandler):
    corpus: list[dict] = []
    media_dir = "."

    def log_message(self, *a):
        pass

    def _json(self, obj):
        b = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        now = datetime.now(timezone.utc)
        if u.path.endswith("/search"):
            items = [{"id": {"videoId": c["id"]}} for c in self.corpus]
            return self._json({"items": items[: int(q.get("maxResults", 50))]})
        if u.path.endswith("/videos"):
            ids = q.get("id", "").split(",")
            items = []
            for c in self.corpus:
                if c["id"] in ids:
                    items.append({"id": c["id"], "snippet": {
                        "title": c["title"], "description": "", "channelId": f"ch_{c['id']}", "channelTitle": "creator",
                        "publishedAt": (now - timedelta(days=c["days"])).strftime("%Y-%m-%dT%H:%M:%SZ"), "tags": ["fitness", "abs"]},
                        "statistics": {"viewCount": str(c["views"]), "likeCount": str(c["likes"]), "commentCount": str(c["comments"])},
                        "contentDetails": {"duration": "PT25S"}})
            return self._json({"items": items})
        if u.path.endswith("/channels"):
            ids = q.get("id", "").split(",")
            return self._json({"items": [{"id": f"ch_{c['id']}", "statistics": {"subscriberCount": str(c["followers"])}}
                                         for c in self.corpus if f"ch_{c['id']}" in ids]})
        if u.path.startswith("/media/"):
            self.path = "/" + u.path[len("/media/"):]
            return super().do_GET()
        self.send_error(404)


def main(out_dir: str, n: int = 36) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("AUTOEDIT_WORK_DIR", str(out / "work"))
    from autoedit import config, db
    from make_sample import make_video

    config.WORK_DIR = Path(os.environ["AUTOEDIT_WORK_DIR"])
    config.PROFILES_DIR = out / "profiles"
    import shutil

    if not config.PROFILES_DIR.exists():
        shutil.copytree(Path(__file__).resolve().parent.parent / "profiles", config.PROFILES_DIR)
    db.set_db_path(out / "learning.db")

    raws = []
    for lang, name in (("en", "raw_en.mp4"), ("he", "raw_he.mp4")):
        p = out / name
        if not p.exists():
            make_video(p, lang)
        raws.append(p)
    t0 = time.time()
    print("[1/5] building corpus", flush=True)
    corpus = build_corpus(out / "corpus", raws, n)

    port = free_port()
    MockYouTube.corpus = corpus
    handler = lambda *a, **k: MockYouTube(*a, directory=str(out / "corpus"), **k)
    srv = ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    os.environ["YOUTUBE_API_KEY"] = "local-mock"

    from autoedit.scout import sources

    sources.YouTubeAPI.BASE = f"http://127.0.0.1:{port}/youtube/v3"
    from autoedit import pipeline
    from autoedit.learn import engine, features
    from autoedit.render import render
    from autoedit.scout import scout
    from autoedit.style import library

    print("[2/5] BEFORE: editing with the starter profile", flush=True)
    raw = raws[0]
    plan_before = pipeline.build_plan(raw, "fitness", "tiktok", profile=library.load_profile("fitness", version=None))
    render(plan_before, out / "before.mp4", out / "w_before")

    print("[3/5] scout via YouTube Data API (mock server)", flush=True)
    res_scout = scout.run("fitness", platforms=["youtube"], max_keywords=1, sources=[sources.YouTubeAPI()])
    print("  ", {k: res_scout[k] for k in ("new", "labels", "errors")}, flush=True)
    # media URLs: the mock serves files over HTTP so the real yt-dlp download path is exercised
    for c in corpus:
        db.execute("UPDATE videos SET url=? WHERE id=?", (f"http://127.0.0.1:{port}/media/{c['id']}.mp4", f"youtube:{c['id']}"))

    print("[4/5] analyze + train + profile update", flush=True)
    res_an = features.collect("fitness", limit=200)
    print("   analyzed:", res_an["analyzed"], "failed:", len(res_an["failed"]), flush=True)
    res_learn = engine.learn("fitness")
    print("   learn:", {k: res_learn.get(k) for k in ("status", "kind", "auc", "accuracy", "baseline_auc", "version", "promoted", "n")}, flush=True)

    print("[5/5] AFTER: editing with the learned profile", flush=True)
    prof_after = library.load_profile("fitness")
    plan_after = pipeline.build_plan(raw, "fitness", "tiktok", profile=prof_after)
    render(plan_after, out / "after.mp4", out / "w_after")

    report = {
        "elapsed_min": round((time.time() - t0) / 60, 1),
        "scout": {k: res_scout[k] for k in ("new", "labels", "errors")},
        "analyzed": res_an["analyzed"],
        "learn": {k: res_learn.get(k) for k in ("status", "kind", "auc", "accuracy", "baseline_auc", "version", "promoted", "n", "importances")},
        "learned_layer": res_learn.get("layer"),
        "before": {"profile": "default", "score": plan_before["score"]["score"], "features": plan_before["score"]["features"]},
        "after": {"profile": prof_after.get("profile_version"), "score": plan_after["score"]["score"],
                  "model_prob": plan_after["score"].get("model_prob"), "features": plan_after["score"]["features"]},
        "ground_truth": "fast pacing +1.3, captions +1.1, music +0.6, on-screen hook +0.5 (log-views effect)",
    }
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str))
    print(json.dumps({k: v for k, v in report.items() if k != "learned_layer"}, ensure_ascii=False, indent=1, default=str)[:5000])
    srv.shutdown()


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 36)

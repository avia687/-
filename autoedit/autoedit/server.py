"""Local web server: Hebrew UI + JSON API.

Studio:   POST /api/upload, POST /api/create, GET /api/jobs/{id}, GET /api/jobs/{id}/events (SSE)
Editing:  GET/PUT /api/versions/{job}/{k}/plan, POST .../chat, POST .../render, POST .../export, POST .../publish
Classic:  POST /api/edit (single talking-head video, niche + platform)
Learning: GET /api/learn/overview, POST /api/learn/run, POST /api/learn/posts, POST /api/learn/rollback
Brand:    GET/PUT /api/brand, POST /api/brand/asset
"""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, db, settings, tasks

log = logging.getLogger("autoedit.server")
WEB_DIST = config.ROOT / "web" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.ensure_dirs()
    settings.load_dotenv()
    from .learn.scheduler import setup_logging, start

    setup_logging()
    tasks.start_consumer()
    try:
        start()
    except Exception:
        log.exception("scheduler failed to start (continuing without automation)")
    yield
    from .learn.scheduler import stop

    stop()


app = FastAPI(title="AutoEdit", lifespan=lifespan)
config.ensure_dirs()
app.mount("/files", StaticFiles(directory=str(config.WORK_DIR)), name="files")


def file_url(p: str | None) -> str | None:
    if not p:
        return None
    try:
        rel = Path(p).resolve().relative_to(config.WORK_DIR.resolve())
        return "/files/" + rel.as_posix()
    except ValueError:
        return None


# ------------------------------------------------------------------ meta
@app.get("/api/health")
def health():
    from .learn.scheduler import jobs as sched_jobs
    from .studio.enhance import capabilities
    from .style.library import list_niches

    return {"ok": True, "keys": settings.keys_status(), "capabilities": capabilities(), "scheduler": sched_jobs(),
            "niches": list_niches(), "platforms": list(config.PLATFORMS)}


# ------------------------------------------------------------------ upload / create
@app.post("/api/upload")
async def upload(files: list[UploadFile] = File(...), batch: str | None = Form(None)):
    batch = batch or uuid.uuid4().hex[:10]
    d = config.WORK_DIR / "uploads" / batch
    d.mkdir(parents=True, exist_ok=True)
    saved = []
    for f in files:
        name = Path(f.filename or "file").name
        dest = d / name
        with open(dest, "wb") as out:
            while chunk := await f.read(1 << 20):  # stream: large files never sit in memory
                out.write(chunk)
        saved.append({"name": name, "size": dest.stat().st_size})
    return {"batch": batch, "files": saved}


class CreateReq(BaseModel):
    batch: str
    brief: str = ""
    narration: str = "auto"


@app.post("/api/create")
def create(req: CreateReq):
    d = config.WORK_DIR / "uploads" / req.batch
    if not d.exists():
        raise HTTPException(404, "batch not found")
    job_id = uuid.uuid4().hex[:10]
    tasks.new_job(job_id, "create", req.model_dump())
    tasks.task_create(job_id, [str(d)], req.brief, req.narration)
    return {"job_id": job_id}


class EditReq(BaseModel):
    batch: str
    niche: str = "business"
    platform: str = "tiktok"
    remove_logo: str | None = None
    background: str | None = None


@app.post("/api/edit")
def classic_edit(req: EditReq):
    from .cli import _background, _parse_box
    from .studio.ingest import VIDEO_EXT

    d = config.WORK_DIR / "uploads" / req.batch
    vids = [p for p in d.glob("*") if p.suffix.lower() in VIDEO_EXT] if d.exists() else []
    if not vids:
        raise HTTPException(400, "no video in batch")
    job_id = uuid.uuid4().hex[:10]
    tasks.new_job(job_id, "edit", req.model_dump())
    tasks.task_edit(job_id, str(vids[0]), req.niche, req.platform,
                    {"remove_logo": _parse_box(req.remove_logo), "background": _background(req.background)})
    return {"job_id": job_id}


def _decorate(job: dict) -> dict:
    res = job.get("result") or {}
    for v in res.get("versions", []) or []:
        v["video_url"] = file_url(v.get("video"))
        v["preview_url"] = file_url(v.get("preview"))
    if res.get("thumbnails"):
        res["thumbnail_urls"] = [file_url(t) for t in res["thumbnails"]]
    if res.get("video"):
        res["video_url"] = file_url(res["video"])
    for f in res.get("files", []) or []:
        f["url"] = file_url(f["path"])
    return job


@app.get("/api/jobs/{job_id}")
def job(job_id: str):
    j = tasks.get(job_id)
    if not j:
        raise HTTPException(404)
    return _decorate(j)


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str):
    async def gen():
        last = None
        for _ in range(60 * 60 * 2):
            j = tasks.get(job_id)
            if not j:
                yield "event: error\ndata: {}\n\n"
                return
            snap = (j["status"], j["progress"], j["message"])
            if snap != last:
                last = snap
                yield f"data: {json.dumps(_decorate(j), ensure_ascii=False, default=str)}\n\n"
            if j["status"] in ("done", "failed"):
                return
            await asyncio.sleep(0.5)
    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# ------------------------------------------------------------------ versions: plan / chat / render / export
def _version_dir(job_id: str, k: int) -> Path:
    d = config.WORK_DIR / "jobs" / job_id / f"v{k}"
    if not (d / "plan.json").exists():
        d = config.WORK_DIR / "jobs" / job_id  # classic edit jobs keep plan.json at job level
        if not (d / "plan.json").exists():
            raise HTTPException(404, "plan not found")
    return d


@app.get("/api/versions/{job_id}/{k}/plan")
def get_plan(job_id: str, k: int):
    from . import timeline

    d = _version_dir(job_id, k)
    plan = json.loads((d / "plan.json").read_text(encoding="utf-8"))
    lay = timeline.layout(plan)
    return {"plan": plan, "timeline": [{"index": c["index"], "t0": round(c["t0"], 2), "t1": round(c["t1"], 2), "src": c["src"],
                                        "name": Path(plan["sources"][c["src"]].get("orig") or plan["sources"][c["src"]]["path"]).name,
                                        "role": c.get("role")} for c in lay],
            "words": timeline.output_words(plan, lay)}


@app.put("/api/versions/{job_id}/{k}/plan")
def put_plan(job_id: str, k: int, body: dict):
    d = _version_dir(job_id, k)
    plan = body.get("plan") or body
    (d / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    return _rerender(job_id, k, d, preview=True)


def _rerender(job_id: str, k: int, d: Path, preview: bool = True):
    rid = uuid.uuid4().hex[:10]
    n = len(list(d.glob("edit_*.mp4"))) + 1
    out = d / f"edit_{n}.mp4"
    tasks.new_job(rid, "render", {"job": job_id, "version": k}, parent=job_id)
    tasks.task_render(rid, str(d / "plan.json"), str(out), preview)
    return {"job_id": rid}


class ChatReq(BaseModel):
    message: str


@app.post("/api/versions/{job_id}/{k}/chat")
def chat(job_id: str, k: int, req: ChatReq):
    from .studio import chat as chat_mod

    d = _version_dir(job_id, k)
    plan = json.loads((d / "plan.json").read_text(encoding="utf-8"))
    ops, reply = chat_mod.parse(req.message, plan)
    done = chat_mod.apply(plan, ops)
    if not done:
        return {"reply": reply, "ops": ops, "job_id": None}
    (d / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    log_path = d / "chat.json"
    hist = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else []
    hist.append({"message": req.message, "ops": ops, "reply": reply, "ts": db.now()})
    log_path.write_text(json.dumps(hist, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"reply": reply, "ops": ops, **_rerender(job_id, k, d, preview=False)}


class ExportReq(BaseModel):
    platforms: list[str] = ["tiktok", "reels", "shorts"]
    codec: str = "h264"


@app.post("/api/versions/{job_id}/{k}/export")
def export(job_id: str, k: int, req: ExportReq):
    d = _version_dir(job_id, k)
    bad = [p for p in req.platforms if p not in config.PLATFORMS]
    if bad:
        raise HTTPException(400, f"unknown platforms {bad}")
    eid = uuid.uuid4().hex[:10]
    tasks.new_job(eid, "export", req.model_dump(), parent=job_id)
    tasks.task_export(eid, str(d / "plan.json"), req.platforms, req.codec)
    return {"job_id": eid}


class PublishReq(BaseModel):
    url: str
    published_at: str | None = None


@app.post("/api/versions/{job_id}/{k}/publish")
def publish(job_id: str, k: int, req: PublishReq):
    from .learn.feedback import add_post

    d = _version_dir(job_id, k)
    plan = json.loads((d / "plan.json").read_text(encoding="utf-8"))
    pid = add_post(req.url, plan["meta"]["niche"], plan, job_id=job_id, variant=plan["meta"].get("variant"),
                   published_at=req.published_at, plan_path=str(d / "plan.json"))
    return {"post_id": pid}


# ------------------------------------------------------------------ learning dashboard
@app.get("/api/learn/overview")
def learn_overview(niche: str = "fitness"):
    from .learn import feedback, patterns
    from .scout.scout import top_videos
    from .style import library

    db.rows("SELECT 1")  # ensure schema
    runs = db.rows("SELECT * FROM model_runs WHERE niche=? ORDER BY id", (niche,))
    latest = runs[-1] if runs else None
    imps = json.loads(latest["importances"]) if latest and latest["importances"] else []
    top = top_videos(niche, 10)
    for t in top:
        vec = json.loads(t.get("vector") or "{}")
        t["why"] = patterns.explain(vec, imps, None, t.get("why"))
        t.pop("vector", None)
        t.pop("description", None)
    trends = _trends(niche)
    counts = db.rows("SELECT label, status, COUNT(*) n FROM videos WHERE niche=? GROUP BY label, status", (niche,))
    act = library.active_version(niche)
    learned = library.load_profile(niche).get("learned", {})
    return {
        "niche": niche, "counts": counts, "trends": trends,
        "importances": [{**i, "label": patterns.FEATURE_HE.get(i["feature"], i["feature"])} for i in imps[:12]],
        "top": top, "learned": learned,
        "versions": [{**v, "active": v["version"] == act} for v in library.list_versions(niche)], "active_version": act,
        "model_runs": [{"id": r["id"], "created_at": r["created_at"], "auc": r["auc"], "baseline_auc": r["baseline_auc"],
                        "accuracy": r["accuracy"], "promoted": bool(r["promoted"]), "n": (r["n_train"] or 0) + (r["n_test"] or 0)} for r in runs],
        "my_posts": feedback.my_performance(niche),
        "runs": db.rows("SELECT id, kind, niche, started, finished, status, summary, errors FROM runs ORDER BY id DESC LIMIT 15"),
        "keys": settings.keys_status(),
    }


def _trends(niche: str) -> dict:
    """What works this week vs. the previous month, among successful videos."""
    def window(a: int, b: int) -> dict:
        rows = db.rows("SELECT f.vector, f.topic FROM videos v JOIN features f ON f.video_id=v.id WHERE v.niche=? AND v.label='success' "
                       "AND v.published_at >= datetime('now', ?) AND v.published_at < datetime('now', ?)",
                       (niche, f"-{b} days", f"-{a} days"))
        vecs = [json.loads(r["vector"]) for r in rows]
        if not vecs:
            return {"n": 0}
        import numpy as np
        from collections import Counter

        hooks = Counter(k[5:] for v in vecs for k, x in v.items() if k.startswith("hook_") and x)
        topics = Counter(t for r in rows for t in json.loads(r["topic"] or "[]"))
        med = lambda k: round(float(np.median([v.get(k, 0) for v in vecs])), 2)
        return {"n": len(vecs), "avg_shot_sec": med("avg_shot_sec"), "duration": med("duration"), "music_bpm": med("music_bpm"),
                "caption_presence": med("caption_presence"), "punch_in_per_min": med("punch_in_per_min"),
                "hooks": dict(hooks.most_common(5)), "topics": [t for t, _ in topics.most_common(8)]}
    return {"week": window(0, 7), "month": window(7, 37)}


class LearnReq(BaseModel):
    niche: str
    scout: bool = True


@app.post("/api/learn/run")
def learn_run(req: LearnReq):
    jid = uuid.uuid4().hex[:10]
    tasks.new_job(jid, "learn", req.model_dump())
    tasks.task_learn(jid, req.niche, req.scout)
    return {"job_id": jid}


class PostReq(BaseModel):
    url: str
    niche: str
    published_at: str | None = None


@app.post("/api/learn/posts")
def add_post(req: PostReq):
    from .learn.feedback import add_post as add

    return {"post_id": add(req.url, req.niche, published_at=req.published_at)}


class RollbackReq(BaseModel):
    niche: str
    version: str | None


@app.post("/api/learn/rollback")
def rollback(req: RollbackReq):
    from .style import library

    library.set_active(req.niche, req.version)
    return {"active": library.active_version(req.niche)}


# ------------------------------------------------------------------ brand kit
@app.get("/api/brand")
def get_brand():
    from .studio import brand

    b = brand.load()
    return {**b, "logo_url": file_url(b.get("logo")), "presets": list(brand.CAPTION_PRESETS), "preferences": brand.preferences()}


@app.put("/api/brand")
def put_brand(body: dict):
    from .studio import brand

    return brand.save(body)


@app.post("/api/brand/asset")
async def brand_asset(kind: str = Form(...), file: UploadFile = File(...)):
    from .studio import brand

    if kind not in ("logo", "intro", "outro", "caption_font", "title_font", "voice_sample"):
        raise HTTPException(400, "bad kind")
    tmp = config.WORK_DIR / "uploads" / f"brand_{uuid.uuid4().hex[:6]}{Path(file.filename or 'x').suffix}"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(await file.read())
    if kind == "voice_sample":
        from .studio.narration import clone_voice

        vid = clone_voice(str(tmp))
        return {"voice_id": vid, "ok": bool(vid)}
    val = brand.store_asset(kind, tmp)
    brand.save({kind: val})
    return {kind: val}


# ------------------------------------------------------------------ web app (PWA)
if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(WEB_DIST / "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = WEB_DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(WEB_DIST / "index.html")
else:
    @app.get("/")
    def no_ui():
        return JSONResponse({"error": "web UI not built - run ./setup.sh (npm run build in web/)"})

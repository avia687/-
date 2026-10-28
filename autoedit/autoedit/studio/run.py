"""Studio orchestrator: pile of media + one optional sentence -> 3 finished versions.

ingest -> understand -> (voice-over) -> Director drafts 3 variants -> Critic loop per variant
(preview render, score, fixes; until >= target or max rounds) -> rank by critic + learned model ->
final render of each -> thumbnails + per-platform metadata."""
from __future__ import annotations

import copy
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Callable

from .. import config, settings
from ..render import render
from ..style.library import load_profile
from . import critic, director, ingest

log = logging.getLogger(__name__)
ProgressFn = Callable[[float, str], None]


def job_dir(job_id: str) -> Path:
    d = config.WORK_DIR / "jobs" / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def refine(plan: dict, profile: dict, wd: Path, target: int, max_rounds: int, progress: ProgressFn, label: str) -> dict:
    history = []
    best = None
    for r in range(max_rounds):
        progress(r / max_rounds, f"{label}: טיוטה {r + 1}")
        prev = wd / f"draft_{r + 1}.mp4"
        render(plan, prev, wd / "w", preview=True)
        rev = critic.critique(plan, str(prev), profile)
        history.append({"round": r + 1, "score": rev["score"], "notes": rev["notes"], "reviewer": rev["reviewer"]})
        log.info("%s round %d: %d %s", label, r + 1, rev["score"], rev["notes"][:2])
        if best is None or rev["score"] > best[0]:
            best = (rev["score"], copy.deepcopy(plan), rev)
        if rev["score"] >= target:
            break
        changed = director.apply_fixes(plan, rev["fixes"], profile)
        history[-1]["applied"] = changed
        if not changed:
            break
    score, plan, rev = best
    plan["critic"] = {"score": score, "rounds": history, "checks": rev["checks"], "notes": rev["notes"], "reviewer": rev["reviewer"]}
    return plan


def model_probability(plan: dict) -> float | None:
    try:
        from ..learn.features import plan_to_vector
        from ..learn.model import predict

        return predict(plan["meta"]["niche"], plan_to_vector(plan))
    except Exception:
        return None


def create(inputs: list[str], brief: str = "", job_id: str | None = None, progress: ProgressFn | None = None,
           n_variants: int | None = None, final: bool = True, narration: str = "auto") -> dict:
    progress = progress or (lambda f, m: None)
    job_id = job_id or uuid.uuid4().hex[:10]
    wd = job_dir(job_id)
    st = settings.load()["studio"]
    n_variants = n_variants or st["variants"]
    t0 = time.time()
    items = ingest.ingest(inputs, progress=lambda f, m: progress(0.02 + 0.2 * f, m))
    if not any(i["kind"] in ("image", "video") and not i.get("error") for i in items):
        raise ValueError("לא נמצאו תמונות או סרטונים שאפשר להשתמש בהם")
    progress(0.23, "הבמאי מבין את הסיפור")
    info = director.understand(brief, items)
    narr = None
    speakers = [i for i in items if i.get("speech", {}).get("has_speech")]
    if not speakers and (narration == "on" or (narration == "auto" and info.get("narration"))):
        progress(0.26, "כותב ומקליט קריינות")
        from . import narration as narr_mod

        script = narr_mod.write_script(brief, info["niche"], info["language"], [{"name": i["name"]} for i in items], 20)
        narr = narr_mod.synthesize(script["lines"], wd / "narration.wav", info["language"], allow_robotic=(narration == "on"))
        if narr:
            info["title"] = script.get("title") or info["title"]
            info["cta"] = script.get("cta") or info["cta"]
    plans = director.variants(items, brief, n_variants, narration=narr, info=info)
    profile = load_profile(info["niche"])
    results = []
    for k, plan in enumerate(plans):
        vd = wd / f"v{k + 1}"
        vd.mkdir(exist_ok=True)
        lo, hi = 0.28 + 0.6 * k / len(plans), 0.28 + 0.6 * (k + 1) / len(plans)
        sub = lambda f, m, lo=lo, hi=hi: progress(lo + (hi - lo) * f * (0.6 if final else 1.0), m)
        plan = refine(plan, profile, vd, st["critic_target"], st["critic_max_rounds"], sub, f"גרסה {k + 1}")
        plan["meta"]["model_prob"] = model_probability(plan)
        out = None
        if final:
            sub(0.65, f"גרסה {k + 1}: רינדור סופי")
            out = vd / "final.mp4"
            render(plan, out, vd / "w", progress=lambda f, m: sub(0.65 + 0.35 * f, f"גרסה {k + 1}: רינדור סופי"))
        (vd / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        results.append({"variant": plan["meta"]["variant"], "dir": str(vd), "video": str(out) if out else None,
                        "preview": str(sorted(vd.glob("draft_*.mp4"))[-1]), "score": plan["critic"]["score"],
                        "model_prob": plan["meta"]["model_prob"], "notes": plan["critic"]["notes"],
                        "rounds": len(plan["critic"]["rounds"])})
    # rank: critic score, learned model as tie-breaker / blend
    for r in results:
        r["rank_score"] = r["score"] + (20 * (r["model_prob"] - 0.5) if r["model_prob"] is not None else 0)
    results.sort(key=lambda r: -r["rank_score"])
    progress(0.92, "תמונות ממוזערות ותיאורים")
    from . import export

    best = results[0]
    best_plan = json.loads((Path(best["dir"]) / "plan.json").read_text(encoding="utf-8"))
    thumbs = export.thumbnails(best_plan, best["video"] or best["preview"], wd / "thumbs") if final else []
    meta = export.metadata(best_plan, info)
    summary = {"job_id": job_id, "concept": info, "items": len(items), "versions": results, "thumbnails": thumbs,
               "metadata": meta, "elapsed_sec": round(time.time() - t0, 1)}
    (wd / "result.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    progress(1.0, "מוכן")
    return summary

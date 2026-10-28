"""Learning cycle: scout -> analyze -> train -> extract patterns -> versioned profile update.
A new profile version is activated only if its model beats the active one on the same held-out set."""
from __future__ import annotations

import json
import logging
import traceback

import numpy as np

from .. import db, settings
from ..scout import scout
from ..style import library
from . import features as feats
from . import model, patterns

log = logging.getLogger(__name__)

CLAMPS = {
    ("pacing", "avg_shot_sec"): (0.6, 6.0), ("pacing", "cuts_per_min"): (6, 90), ("pacing", "words_per_sec"): (1.5, 4.5),
    ("hook", "first_cut_sec"): (0.3, 4.0), ("captions", "position"): (0.3, 0.8), ("zoom", "punch_in_per_min"): (0, 20),
    ("transitions", "per_min"): (0, 15), ("music", "bpm"): (70, 170), ("sfx", "per_min"): (0, 25),
    ("sfx", "on_cuts"): (0, 1), ("broll", "ratio"): (0, 0.6), ("structure", "avg_duration"): (8, 900),
}


def _wmedian(vals: list[float], weights: list[float]) -> float:
    order = np.argsort(vals)
    v, w = np.array(vals)[order], np.array(weights)[order]
    c = np.cumsum(w)
    return float(v[np.searchsorted(c, c[-1] / 2)])


def build_layer(niche: str, train_res: dict, pats: dict) -> dict:
    rows = db.rows("SELECT v.success_score, f.vector FROM videos v JOIN features f ON f.video_id=v.id "
                   "WHERE v.niche=? AND v.label='success'", (niche,))
    vecs = [json.loads(r["vector"]) for r in rows]
    weights = [max(0.05, r["success_score"] or 0.5) for r in rows]
    for vec, label, _ in feats.my_posts_dataset(niche):
        if label == 1:
            vecs.append(vec)
            weights.append(float(settings.get("learn.my_posts_weight", 3.0)))
    if not vecs:
        return {}
    imp = {i["feature"]: i for i in train_res.get("importances", [])}
    layer: dict = {}
    for f, path in feats.ACTIONABLE.items():
        vals = [(v[f], w) for v, w in zip(vecs, weights)
                if f in v and (v[f] not in (None, 0) or f in ("broll_ratio", "sfx_on_cuts"))]
        if len(vals) < 3:
            continue
        # only move the parameters the model says matter (or all of them on the first learned version)
        if imp and f not in imp:
            continue
        val = _wmedian([x for x, _ in vals], [w for _, w in vals])
        lo, hi = CLAMPS.get(path, (-1e9, 1e9))
        val = float(np.clip(val, lo, hi))
        layer.setdefault(path[0], {})[path[1]] = round(val, 3)
    hooks = [h for h in feats.HOOK_TYPES if sum(v.get(f"hook_{h}", 0) * w for v, w in zip(vecs, weights)) > 0]
    if hooks:
        best = max(hooks, key=lambda h: sum(v.get(f"hook_{h}", 0) * w for v, w in zip(vecs, weights)))
        layer.setdefault("hook", {})["type"] = best
    looks = {lk: sum(v.get(f"look_{lk}", 0) * w for v, w in zip(vecs, weights)) for lk in feats.LOOKS}
    if any(looks.values()):
        layer.setdefault("color", {})["look"] = max(looks, key=looks.get)
    cap = [v.get("caption_presence", 0) for v in vecs]
    # captions stay on (sound-off viewing); the learner only tunes their style
    layer.setdefault("captions", {})["enabled"] = True
    mus = [v.get("music_present", 0) for v in vecs]
    layer.setdefault("music", {})["present"] = bool(np.average(mus, weights=weights) >= 0.4)
    layer["learned"] = {
        "hook_templates": pats.get("hook_templates", [])[:8],
        "opening_formulas": pats.get("opening_formulas", [])[:6],
        "cta_patterns": pats.get("cta_patterns", [])[:6],
        "differences_he": pats.get("differences_he", [])[:6],
        "top_features": [{"feature": i["feature"], "importance": i["importance"], "direction": i["direction"]}
                         for i in train_res.get("importances", [])[:8]],
        "samples": len(vecs),
    }
    if pats.get("hook_templates"):
        layer.setdefault("hook", {})["examples"] = pats["hook_templates"][:6]
    return layer


def learn(niche: str) -> dict:
    """Train + (maybe) promote a new profile version."""
    tr = model.train(niche)
    if tr["status"] != "trained":
        return tr
    pats = patterns.extract(niche)
    layer = build_layer(niche, tr, pats)
    min_gain = float(settings.get("learn.min_auc_gain", 0.0))
    baseline = tr["baseline_auc"]
    improves = (baseline is None and tr["auc"] >= 0.6) or (baseline is not None and tr["auc"] > baseline + min_gain)
    metrics = {"auc": tr["auc"], "accuracy": tr["accuracy"], "baseline_auc": baseline, "n": tr["n"], "model_run": tr["run_id"]}
    note = ("שופר דיוק החיזוי" if improves else "לא שיפר את דיוק החיזוי - נשמר אך לא הופעל")
    ver = library.save_version(niche, layer, metrics, note=note, activate=improves)
    if improves:
        model.promote(tr["run_id"], ver)
    return {**tr, "version": ver, "promoted": improves, "patterns": pats, "layer": layer}


def run_cycle(niche: str, do_scout: bool = True, sources=None) -> dict:
    """Full autonomous cycle. Every stage is isolated: a failure is logged and the cycle continues."""
    run_id = db.start_run("cycle", niche)
    out, errors = {}, []
    stages = []
    if do_scout:
        stages.append(("scout", lambda: scout.run(niche, sources=sources)))
    stages += [("analyze", lambda: feats.collect(niche)), ("learn", lambda: learn(niche))]
    for name, fn in stages:
        try:
            out[name] = fn()
            log.info("cycle %s/%s: %s", niche, name, {k: v for k, v in out[name].items() if k not in ("layer", "patterns", "importances")} if isinstance(out[name], dict) else out[name])
        except Exception as e:
            errors.append(f"{name}: {e}")
            log.error("cycle stage %s failed for %s:\n%s", name, niche, traceback.format_exc())
    summary = {k: ({kk: vv for kk, vv in v.items() if kk not in ("layer", "patterns")} if isinstance(v, dict) else v) for k, v in out.items()}
    db.finish_run(run_id, "ok" if not errors else "partial", summary, errors)
    return {**out, "errors": errors}

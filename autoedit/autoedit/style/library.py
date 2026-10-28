"""Niche style-profile library.

Layout per niche (profiles/<niche>/):
  default.json            built-in starter profile
  refs/<id>.json          profiles extracted from individual reference videos (autoedit analyze)
  versions/v0001.json     learned profile versions (written by the learning engine)
  active.json             {"version": "v0003"} -> which learned version is in use
The effective profile = default <- aggregate(refs) <- active learned version.
"""
from __future__ import annotations

import json
import statistics
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .. import config
from ..profiles_default import deep_merge, default_profile

NUMERIC_PATHS = [
    ("pacing", "avg_shot_sec"), ("pacing", "cuts_per_min"), ("pacing", "words_per_sec"),
    ("hook", "first_cut_sec"), ("captions", "size"), ("captions", "position"), ("captions", "words_per_group"),
    ("zoom", "punch_in_per_min"), ("zoom", "scale"), ("transitions", "per_min"), ("music", "bpm"),
    ("sfx", "per_min"), ("sfx", "on_cuts"), ("broll", "ratio"), ("color", "saturation"), ("color", "brightness"),
    ("color", "contrast"), ("color", "warmth"), ("structure", "avg_duration"), ("overlays", "emoji_per_min"),
]
CATEGORICAL_PATHS = [("hook", "type"), ("captions", "highlight_color"), ("captions", "position_zone"),
                     ("color", "look"), ("music", "energy"), ("zoom", "style")]
BOOL_PATHS = [("captions", "enabled"), ("music", "present"), ("structure", "cta"), ("hook", "has_text_overlay"),
              ("captions", "uppercase")]


def niche_dir(niche: str) -> Path:
    d = config.PROFILES_DIR / niche
    (d / "refs").mkdir(parents=True, exist_ok=True)
    (d / "versions").mkdir(parents=True, exist_ok=True)
    return d


def list_niches() -> list[str]:
    names = set(config.NICHES)
    if config.PROFILES_DIR.exists():
        names |= {p.name for p in config.PROFILES_DIR.iterdir() if p.is_dir()}
    return sorted(names)


def _get(d: dict, path: tuple[str, str]):
    return d.get(path[0], {}).get(path[1])


def _set(d: dict, path: tuple[str, str], v) -> None:
    d.setdefault(path[0], {})[path[1]] = v


def aggregate(refs: list[dict], weights: list[float] | None = None) -> dict:
    """Combine many per-video profiles: weighted median for numbers, weighted mode for categories."""
    if not refs:
        return {}
    weights = weights or [1.0] * len(refs)
    out: dict = {}
    for p in NUMERIC_PATHS:
        vals = [(float(_get(r, p)), w) for r, w in zip(refs, weights) if isinstance(_get(r, p), (int, float))]
        if vals:
            vals.sort()
            half, acc = sum(w for _, w in vals) / 2, 0.0
            for v, w in vals:
                acc += w
                if acc >= half:
                    _set(out, p, round(v, 3))
                    break
    for p in CATEGORICAL_PATHS:
        c = Counter()
        for r, w in zip(refs, weights):
            v = _get(r, p)
            if v is not None:
                c[v] += w
        if c:
            _set(out, p, c.most_common(1)[0][0])
    for p in BOOL_PATHS:
        vals = [(bool(_get(r, p)), w) for r, w in zip(refs, weights) if _get(r, p) is not None]
        if vals:
            _set(out, p, sum(w for v, w in vals if v) >= sum(w for _, w in vals) / 2)
    # transition-type mixture
    mix = Counter()
    for r, w in zip(refs, weights):
        for k, v in (r.get("transitions", {}).get("types") or {}).items():
            mix[k] += v * w
    if mix:
        tot = sum(mix.values())
        _set(out, ("transitions", "types"), {k: round(v / tot, 3) for k, v in mix.items()})
    hooks = [h for r in refs for h in r.get("hook", {}).get("examples", [])][:12]
    if hooks:
        _set(out, ("hook", "examples"), hooks)
    if out.get("captions", {}).get("words_per_group"):
        out["captions"]["words_per_group"] = int(round(out["captions"]["words_per_group"]))
    return out


def load_refs(niche: str) -> list[dict]:
    d = niche_dir(niche) / "refs"
    out = []
    for p in sorted(d.glob("*.json")):
        try:
            out.append(json.loads(p.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    return out


def save_ref(niche: str, profile: dict, ref_id: str) -> Path:
    p = niche_dir(niche) / "refs" / f"{ref_id}.json"
    p.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    return p


# ------------------------------------------------------------------ versions
def list_versions(niche: str) -> list[dict]:
    d = niche_dir(niche) / "versions"
    out = []
    for p in sorted(d.glob("v*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        out.append({"version": p.stem, "created": data.get("_meta", {}).get("created"),
                    "metrics": data.get("_meta", {}).get("metrics", {}), "note": data.get("_meta", {}).get("note", "")})
    return out


def active_version(niche: str) -> str | None:
    p = niche_dir(niche) / "active.json"
    if p.exists():
        return json.loads(p.read_text()).get("version")
    return None


def set_active(niche: str, version: str | None) -> None:
    p = niche_dir(niche) / "active.json"
    if version is None:
        p.unlink(missing_ok=True)
        return
    if not (niche_dir(niche) / "versions" / f"{version}.json").exists():
        raise FileNotFoundError(version)
    p.write_text(json.dumps({"version": version, "since": datetime.now(timezone.utc).isoformat()}))


def save_version(niche: str, layer: dict, metrics: dict, note: str = "", activate: bool = False) -> str:
    d = niche_dir(niche) / "versions"
    n = len(list(d.glob("v*.json"))) + 1
    ver = f"v{n:04d}"
    layer = dict(layer)
    layer["_meta"] = {"created": datetime.now(timezone.utc).isoformat(), "metrics": metrics, "note": note,
                      "parent": active_version(niche)}
    (d / f"{ver}.json").write_text(json.dumps(layer, ensure_ascii=False, indent=2), encoding="utf-8")
    if activate:
        set_active(niche, ver)
    return ver


def load_version_layer(niche: str, version: str) -> dict:
    p = niche_dir(niche) / "versions" / f"{version}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    data.pop("_meta", None)
    return data


def load_profile(niche: str, version: str | None = "active") -> dict:
    """Effective profile for editing."""
    base_path = config.PROFILES_DIR / niche / "default.json"
    base = json.loads(base_path.read_text(encoding="utf-8")) if base_path.exists() else default_profile(niche)
    refs = load_refs(niche)
    prof = deep_merge(base, aggregate(refs)) if refs else base
    prof["sources"] = [r.get("source") for r in refs if r.get("source")]
    ver = active_version(niche) if version == "active" else version
    if ver:
        try:
            prof = deep_merge(prof, load_version_layer(niche, ver))
        except FileNotFoundError:
            pass
    prof["niche"] = niche
    prof["profile_version"] = ver or ("refs" if refs else "default")
    return prof


def statistics_summary(values: list[float]) -> dict:
    if not values:
        return {}
    return {"mean": statistics.fmean(values), "median": statistics.median(values), "n": len(values)}

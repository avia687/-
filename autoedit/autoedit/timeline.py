"""Resolve an EDL (plan) into an output timeline: clip times, word times, effect times.
All editorial anchors in the plan are word indices / clip indices, so edits to cuts never
leave effects pointing at the wrong moment."""
from __future__ import annotations


def clip_duration(c: dict) -> float:
    return max(0.0, (c["out"] - c["in"]) / float(c.get("speed", 1.0)))


def layout(plan: dict) -> list[dict]:
    t = 0.0
    out = []
    for k, c in enumerate(plan["clips"]):
        d = clip_duration(c)
        out.append({**c, "index": k, "t0": t, "t1": t + d})
        t += d
    return out


def total_duration(plan: dict) -> float:
    lay = layout(plan)
    return lay[-1]["t1"] if lay else 0.0


def src_to_out(lay: list[dict], src: str, t: float) -> float | None:
    for c in lay:
        if c["src"] == src and c["in"] - 1e-3 <= t <= c["out"] + 1e-3:
            return c["t0"] + (t - c["in"]) / float(c.get("speed", 1.0))
    return None


def output_words(plan: dict, lay: list[dict] | None = None) -> list[dict]:
    """Words that survive the cut, re-timed to the output timeline (in output order)."""
    lay = lay or layout(plan)
    words = plan.get("words", [])
    out = []
    for c in lay:
        if c.get("role") == "broll" or not c.get("audio", True):
            continue
        sp = float(c.get("speed", 1.0))
        for w in words:
            if w.get("hidden") or w.get("src") != c["src"]:
                continue
            mid = (w["start"] + w["end"]) / 2
            if c["in"] - 0.02 <= mid <= c["out"] + 0.02:
                s = c["t0"] + (max(w["start"], c["in"]) - c["in"]) / sp
                e = c["t0"] + (min(w["end"], c["out"]) - c["in"]) / sp
                out.append({"i": w["i"], "text": w["text"], "start": s, "end": max(e, s + 0.05),
                            "emph": bool(w.get("emph")), "sid": w.get("sid", 0), "clip": c["index"]})
    out.sort(key=lambda w: w["start"])
    return out


def word_time(owords: list[dict], i: int) -> float | None:
    for w in owords:
        if w["i"] == i:
            return w["start"]
    return None


def boundaries(lay: list[dict]) -> list[float]:
    return [c["t1"] for c in lay[:-1]]

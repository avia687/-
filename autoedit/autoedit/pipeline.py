"""Talking-head auto-edit: raw video + niche + platform -> EDL (editable JSON plan) -> render."""
from __future__ import annotations

import hashlib
import json
import logging
import random
from pathlib import Path
from typing import Callable

from . import audio as audio_mod
from . import cleanup, config, inpaint, selection, timeline
from .media import load_audio, probe
from .score import score_plan
from .style.library import load_profile
from .transcribe import transcribe

log = logging.getLogger(__name__)
ProgressFn = Callable[[float, str], None]


def file_key(path: str | Path) -> str:
    p = Path(path)
    st = p.stat()
    h = hashlib.sha1(f"{p.resolve()}|{st.st_size}|{int(st.st_mtime)}".encode()).hexdigest()
    return h[:16]


def workdir_for(path: str | Path) -> Path:
    d = config.WORK_DIR / "cache" / file_key(path)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _budget(platform: str, profile: dict) -> float:
    spec = config.platform_spec(platform)
    return float(spec["max_duration"])


def build_plan(video: str | Path, niche: str, platform: str, *, language: str | None = None,
               aspect: str | None = None, remove_logo: str | list | None = None,
               background: dict | None = None, music: str | None = None, brand: dict | None = None,
               whisper_model: str | None = None, seed: int = 7, profile: dict | None = None,
               variant: str | None = None, progress: ProgressFn | None = None) -> dict:
    progress = progress or (lambda f, m: None)
    video = str(Path(video).resolve())
    info = probe(video)
    wd = workdir_for(video)
    profile = profile or load_profile(niche)
    spec = config.platform_spec(platform)
    aspect = aspect or spec["aspect"]
    W, H = config.ASPECTS[aspect]
    rng = random.Random(seed)

    progress(0.05, "מתמלל")
    tr = transcribe(video, language=language, model_name=whisper_model, cache_dir=wd)
    words = tr["words"]
    lang = tr["language"]

    progress(0.35, "מנקה שתיקות וגמגומים")
    audio = load_audio(video) if info.has_audio else None
    cl = cleanup.clean(tr, profile, info.duration, audio)
    kept_idx = {i for s in cl["segments"] for i in s["words"]}
    sents = selection.split_sentences(words, kept_idx)
    sid_of = {i: s["id"] for s in sents for i in s["words"]}

    progress(0.45, "בוחר את הקטעים החזקים")
    content = selection.plan_content(sents, words, lang, niche, platform, _budget(platform, profile), profile)
    if variant == "hook_alt" and len(sents) > 2:  # A/B: open on the runner-up line instead
        scored = sorted(sents[1:max(2, len(sents) // 2)],
                        key=lambda s: selection.score_sentence(s, words, lang, s["id"], len(sents)), reverse=True)
        if scored and scored[0]["id"] in content["keep"]:
            content["hook_id"] = scored[0]["id"]
            content["title"] = selection.make_title(scored[0]["text"], lang)

    def assemble(content: dict, rng: random.Random) -> dict:
        keep_set = set(content["keep"])

        reason = list(cl["removed"])
        for i in range(len(words)):
            if reason[i] is None and sid_of.get(i) not in keep_set:
                reason[i] = "dropped"
        max_sil = float(profile.get("pacing", {}).get("max_silence", 0.28))
        if variant == "fast":
            max_sil *= 0.6
        segs = cleanup.build_segments(words, reason, max_silence=max_sil, duration=info.duration, audio=audio)

        # hook first: segments that belong to the hook sentence move to the front
        hook = content["hook_id"]
        hook_segs = [s for s in segs if all(sid_of.get(i) == hook for i in s["words"])]
        if hook_segs and segs.index(hook_segs[0]) != 0:
            segs = hook_segs + [s for s in segs if s not in hook_segs]

        zoom_alt = 1.0 + (float(profile.get("zoom", {}).get("scale", 1.14)) - 1.0) * 0.7
        clips = []
        for k, s in enumerate(segs):
            sids = {sid_of.get(i) for i in s["words"]}
            role = "hook" if sids == {hook} else "body"
            # jump cuts inside a take: alternate framing so the cut reads as intentional
            z = 1.0 if k % 2 == 0 else zoom_alt
            clips.append({"src": "S0", "in": s["start"], "out": s["end"], "role": role, "zoom": round(z, 3),
                          "speed": 1.1 if variant == "fast" else 1.0, "audio": True})
        if clips:
            clips[-1]["role"] = "cta" if len(clips) > 2 else clips[-1]["role"]

        # words (source timeline) with emphasis
        emph = {i for ids in content["emphasis"].values() for i in ids}
        plan_words = [{"i": i, "text": w["text"], "src": "S0", "start": w["start"], "end": w["end"],
                       "emph": i in emph, "sid": sid_of.get(i, -1), "removed": reason[i]} for i, w in enumerate(words)]

        plan = {
            "version": 2,
            "meta": {"niche": niche, "platform": platform, "language": lang, "aspect": aspect, "width": W, "height": H,
                     "fps": config.FPS, "profile_version": profile.get("profile_version"), "hook_type": content["hook_type"],
                     "editor": content.get("source"), "reasoning": content.get("reasoning", ""), "variant": variant or "main"},
            "sources": {"S0": {"path": video, "kind": "video", "w": info.display_size[0], "h": info.display_size[1],
                               "duration": info.duration, "has_audio": info.has_audio, "fps": info.fps}},
            "clips": clips,
            "words": plan_words,
            "title": {"text": content["title"], "dur": 2.6, "sfx": "impact"} if profile.get("hook", {}).get("has_text_overlay", True) else {},
            "cta": {"text": content["cta"], "dur": 3.0} if profile.get("structure", {}).get("cta", True) else {},
            "captions": {**profile.get("captions", {})},
            "camera_motion": profile.get("zoom", {}).get("camera_motion", "slow_push"),
            "reframe": {"enabled": True},
            "background": background or {"mode": "none"},
            "music": {"enabled": profile.get("music", {}).get("present", True), "volume_db": profile.get("music", {}).get("volume_db", -19),
                      "duck_db": profile.get("music", {}).get("duck_db", -11), "bpm": profile.get("music", {}).get("bpm")},
            "sfx": {"enabled": True},
            "audio": {"denoise": True},
            "color": {**profile.get("color", {}), "enabled": True},
            "progress_bar": {"enabled": profile.get("overlays", {}).get("progress_bar", True)},
            "brand": brand or {},
            "punch": [], "emojis": [], "broll": [], "transitions": [],
            "stats": cl["stats"],
        }
        mpath = audio_mod.pick_music(niche, profile.get("music", {}).get("bpm"), music)
        plan["music"]["path"] = str(mpath) if mpath else None

        # inpainting
        if remove_logo == "auto":
            plan["sources"]["S0"]["inpaint"] = inpaint.detect_static_logos(video)
        elif isinstance(remove_logo, list):
            plan["sources"]["S0"]["inpaint"] = remove_logo

        decorate(plan, content, profile, rng)
        return plan

    plan = assemble(content, random.Random(seed))
    # hook A/B inside the editor: when the learner has a trained model, try the alternative openings
    # (natural first line / runner-up line) and keep the one with the highest predicted success
    if learned_probability(niche, plan) is not None and variant is None and len(sents) > 2:
        best, best_p = plan, learned_probability(niche, plan)
        alts = {sents[0]["id"]}
        ranked = sorted(sents[: max(2, len(sents) // 2)], key=lambda s: -selection.score_sentence(s, words, lang, s["id"], len(sents)))
        alts |= {s["id"] for s in ranked[:2]}
        tried = []
        for hid in alts - {content["hook_id"]}:
            if hid not in content["keep"]:
                continue
            alt = {**content, "hook_id": hid, "title": selection.make_title(next(s["text"] for s in sents if s["id"] == hid), lang)}
            cand = assemble(alt, random.Random(seed))
            p = learned_probability(niche, cand)
            tried.append({"hook_id": hid, "p": p})
            if p is not None and p > best_p + 0.01:
                best, best_p = cand, p
        plan = best
        plan["meta"]["hook_selection"] = {"chosen_p": round(best_p, 4), "tried": tried}
    progress(0.55, "מחשב ציון ויראליות")
    plan["score"] = score_plan(plan, profile, model_prob=learned_probability(niche, plan))
    return plan


def learned_probability(niche: str, plan: dict) -> float | None:
    """Success probability from the niche's trained model (None until the learner has trained one)."""
    try:
        from .learn.features import plan_to_vector
        from .learn.model import predict

        return predict(niche, plan_to_vector(plan))
    except Exception as e:  # the editor must never depend on the learner being healthy
        log.debug("no learned model for %s: %s", niche, e)
        return None


def decorate(plan: dict, content: dict, profile: dict, rng: random.Random) -> None:
    """Punch-ins, emoji, transitions + SFX, derived from the profile's measured densities."""
    lay = timeline.layout(plan)
    dur = lay[-1]["t1"] if lay else 0
    owords = timeline.output_words(plan, lay)
    minutes = max(dur / 60, 1e-6)
    zp = profile.get("zoom", {})
    n_punch = max(1, round(zp.get("punch_in_per_min", 6) * minutes))
    emph_words = [w for w in owords if w["emph"]]
    chosen, last_t = [], -9.0
    for w in sorted(emph_words, key=lambda w: w["start"]):
        if w["start"] - last_t >= 2.5 and len(chosen) < n_punch and w["start"] > 1.0:
            chosen.append(w)
            last_t = w["start"]
    plan["punch"] = [{"word": w["i"], "scale": float(zp.get("scale", 1.14)), "hold": 1.3,
                      "style": zp.get("style", "snap"), "sfx": None} for w in chosen]
    # emoji anchored to the first emphasized word of the chosen sentences
    for e in content.get("emojis", []):
        ws = [w for w in owords if w["sid"] == e["sentence_id"]]
        if not ws:
            continue
        anchor = next((w for w in ws if w["emph"]), ws[0])
        plan["emojis"].append({"word": anchor["i"], "emoji": e["emoji"], "dur": 1.5})
    # transitions: only on sentence/section changes (jump cuts inside a take stay hard cuts)
    tp = profile.get("transitions", {})
    types = {k: v for k, v in (tp.get("types") or {"cut": 1.0}).items() if k != "cut"}
    budget = max(1, round(tp.get("per_min", 4) * minutes))
    sfx_types = [s for s in profile.get("sfx", {}).get("types", ["whoosh"]) if s in ("whoosh", "riser", "impact", "click")] or ["whoosh"]
    p_sfx = float(profile.get("sfx", {}).get("on_cuts", 0.3))
    cands = []
    for k in range(len(lay) - 1):
        a = [w for w in owords if w["clip"] == k]
        b = [w for w in owords if w["clip"] == k + 1]
        if a and b and a[-1]["sid"] != b[0]["sid"]:
            cands.append(k)
    # the hook->body boundary always gets a transition: it is the moment viewers decide to stay
    picks = cands[:1] + rng.sample(cands[1:], min(len(cands) - 1, budget - 1)) if cands else []
    for k in sorted(set(picks)):
        if types:
            typ = rng.choices(list(types), weights=list(types.values()))[0]
        else:
            typ = "zoom"
        sfx = "whoosh" if typ in ("whip", "zoom") or rng.random() < p_sfx else None
        if sfx and rng.random() < 0.3:
            sfx = rng.choice(sfx_types)
        plan["transitions"].append({"after_clip": k, "type": typ, "sfx": sfx})


def edit(video: str | Path, niche: str, platform: str, out: str | Path | None = None, *,
         progress: ProgressFn | None = None, plan_only: bool = False, preview: bool = False, **kw) -> dict:
    from .render import render

    progress = progress or (lambda f, m: None)
    plan = build_plan(video, niche, platform, progress=lambda f, m: progress(f * 0.4, m), **kw)
    wd = workdir_for(video)
    (wd / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    if plan_only:
        return {"plan": plan}
    out = Path(out or Path(video).with_name(Path(video).stem + f"_{niche}_{platform}.mp4"))
    res = render(plan, out, wd, progress=lambda f, m: progress(0.4 + 0.6 * f, m), preview=preview)
    return {"plan": plan, "render": res}

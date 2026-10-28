"""Director agent: watches all the material (frame analysis, transcripts, audio), understands the story
and writes the Edit Decision List (EDL = the same plan JSON the renderer consumes), guided by the niche's
learned style profile. Two modes:
  * A-roll  - someone talks to camera: speech-driven cut (cleanup, hook-first, captions) + other material as B-roll.
  * Montage - photos / silent clips: music-driven cut on the beat, Ken Burns / 2.5D parallax, speed ramps,
              match cuts, kinetic titles, stat cards, optional voice-over.
Claude makes the editorial calls when available; deterministic heuristics otherwise."""
from __future__ import annotations

import copy
import logging
import random
import re
from pathlib import Path

import numpy as np

from .. import config, llm
from ..media import probe
from ..style.library import load_profile
from . import brand as brand_mod
from . import cinema, enhance, motion

log = logging.getLogger(__name__)

NICHE_WORDS = {
    "realestate": ["דירה", "בית", "נדל", "נכס", "למכירה", "להשכרה", "פנטהאוז", "וילה", "apartment", "house", "home", "real estate",
                   "property", "listing", "condo"],
    "food": ["מתכון", "אוכל", "מסעדה", "בישול", "אפייה", "עוגה", "recipe", "food", "cooking", "restaurant", "baking"],
    "fitness": ["כושר", "אימון", "חדר כושר", "ריצה", "תרגיל", "workout", "fitness", "gym", "training", "exercise"],
    "business": ["עסק", "שיווק", "מכירות", "יזמות", "לקוחות", "חברה", "business", "marketing", "sales", "startup", "brand"],
}
PLATFORM_WORDS = {"tiktok": ["טיקטוק", "tiktok"], "reels": ["רילס", "אינסטגרם", "reels", "instagram"],
                  "shorts": ["שורטס", "shorts"], "youtube": ["יוטיוב", "youtube"], "linkedin": ["לינקדאין", "linkedin"]}

PRINCIPLES = (Path(__file__).with_name("editing_principles.md")).read_text(encoding="utf-8")
TRANSFORM_WORDS = ["לפני", "אחרי", "שיפוץ", "מהפך", "before", "after", "transformation", "renovation", "makeover", "glow up"]
EDU_WORDS = ["טיפ", "איך", "למה", "טעות", "מדריך", "שלבים", "tip", "how to", "why", "mistake", "guide", "steps"]
# pacing multiplier on shot length per content type (rulebook section 3)
PACE = {"high_energy": 0.8, "emotional": 1.25, "educational": 1.0, "transformation": 0.95}

BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "niche": {"type": "string"}, "platform": {"type": "string", "enum": ["tiktok", "reels", "shorts", "youtube", "linkedin"]},
        "mood": {"type": "string", "enum": ["energetic", "calm", "luxury", "emotional", "fun"]},
        "language": {"type": "string", "enum": ["he", "en"]},
        "target_seconds": {"type": "number"}, "narration": {"type": "boolean"},
        "title": {"type": "string"}, "alt_titles": {"type": "array", "items": {"type": "string"}},
        "cta": {"type": "string"}, "location": {"type": "string"},
        "story": {"type": "string"},
    },
    "required": ["niche", "platform", "mood", "language", "target_seconds", "narration", "title", "alt_titles", "cta",
                 "location", "story"],
    "additionalProperties": False,
}


# ------------------------------------------------------------------ understanding
def understand(brief: str, items: list[dict]) -> dict:
    speech_text = " ".join(i.get("speech", {}).get("text", "") for i in items if i.get("speech", {}).get("has_speech"))
    text = f"{brief} {speech_text}".lower()
    he = bool(re.search(r"[֐-׿]", brief or speech_text)) or not (brief or speech_text)
    counts = {n: sum(text.count(w) for w in ws) for n, ws in NICHE_WORDS.items()}
    niche = max(counts, key=counts.get) if max(counts.values()) > 0 else "business"
    platform = next((p for p, ws in PLATFORM_WORDS.items() if any(w in text for w in ws)), "tiktok")
    mood = cinema.mood_from_text(brief, "luxury" if niche == "realestate" else "energetic")
    lang = "he" if he else "en"
    title, cta = default_title(niche, lang, brief), default_cta(niche, lang)
    if any(w in text for w in TRANSFORM_WORDS):
        ctype = "transformation"
    elif speech_text and any(w in text for w in EDU_WORDS):
        ctype = "educational"
    elif mood in ("emotional", "calm"):
        ctype = "emotional"
    else:
        ctype = "high_energy"
    info = {"niche": niche, "platform": platform, "mood": mood, "language": lang, "target_seconds": 0, "content_type": ctype,
            "narration": bool(re.search(r"קריינות|קריין|voice ?over|narrat", text)), "title": title,
            "alt_titles": [alt_title(niche, lang, 1), alt_title(niche, lang, 2)], "cta": cta,
            "location": _location(brief), "story": brief or "", "source": "heuristic"}
    if llm.available():
        desc = "\n".join(f"- {i['id']} {i['kind']} {i.get('duration', 0):.0f}s quality={i.get('quality', 0):.2f} "
                         f"faces={_faces(i)} speech={i.get('speech', {}).get('text', '')[:120]!r}" for i in items[:60])
        res = llm.ask_json(
            "You are the creative director for short-form social video. Follow this editorial rulebook:\n\n" + PRINCIPLES,
            f"User brief (may be empty): {brief!r}\nMaterial:\n{desc}\n"
            "Infer niche (one of fitness, realestate, food, business, or a short new niche name), target platform, mood, "
            "language of on-screen text (he/en), target length in seconds, whether a voice-over is needed (true only if the "
            "user asked or the material has no speech and the message needs words), a punchy on-screen hook title, two "
            "alternative hook titles with different angles (question / number), a CTA, a location if mentioned, and the "
            "one-sentence story of the video, and the content type (pacing follows it).", BRIEF_SCHEMA, effort="medium")
        if res:
            info.update(res)
            info["source"] = "claude"
    return info


def _faces(i: dict) -> int:
    fe = i.get("faces")
    if isinstance(fe, dict):
        return fe.get("faces", 0)
    return int(round((i.get("face_ratio") or 0) * 1))


CITIES_HE = ["תל אביב", "ירושלים", "חיפה", "רמת גן", "גבעתיים", "הרצליה", "רעננה", "כפר סבא", "הוד השרון", "נתניה",
             "ראשון לציון", "פתח תקווה", "פתח תקוה", "באר שבע", "אשדוד", "אשקלון", "חולון", "בת ים", "רחובות", "נס ציונה",
             "מודיעין", "אילת", "קיסריה", "זכרון יעקב", "יפו", "רמת השרון", "בני ברק", "נהריה", "עכו", "טבריה", "צפת",
             "ראש העין", "יהוד", "קריית אונו", "אור יהודה", "גדרה", "יבנה", "חדרה", "עפולה", "כרמיאל", "הגליל", "הנגב"]


def _location(text: str) -> str:
    """Only real places: a known city (optionally with a neighbourhood after it) or 'in <Capitalized Place>'."""
    t = text or ""
    for c in sorted(CITIES_HE, key=len, reverse=True):
        if re.search(rf"(?:^|[\s,.])(?:ב|ל|מ)?{re.escape(c)}(?:$|[\s,.])", t):
            return c
    m = re.search(r"\bin ((?:[A-Z][a-z]+)(?: [A-Z][a-z]+){0,2})", t)
    return m.group(1) if m else ""


def default_title(niche: str, lang: str, brief: str = "") -> str:
    if lang == "he":
        return {"realestate": "הבית שחיכיתם לו", "food": "המתכון שכולם מבקשים", "fitness": "ככה נראית התמדה",
                "business": "הטעות שעולה לכם כסף"}.get(niche, "תראו את זה")
    return {"realestate": "The home you've been waiting for", "food": "The recipe everyone asks for",
            "fitness": "This is what consistency looks like", "business": "The mistake costing you money"}.get(niche, "Watch this")


def alt_title(niche: str, lang: str, k: int) -> str:
    if lang == "he":
        q = {"realestate": ["הייתם גרים כאן?", "3 סיבות לאהוב את הבית הזה"], "food": ["מוכנים לטעום?", "3 מרכיבים בלבד"],
             "fitness": ["מוכנים לאתגר?", "30 יום. זה ההבדל"], "business": ["למה רוב העסקים נכשלים?", "3 צעדים לצמיחה"]}
        return q.get(niche, ["מוכנים?", "3 דברים שלא ידעתם"])[k - 1]
    q = {"realestate": ["Would you live here?", "3 reasons to love this home"], "food": ["Ready to taste this?", "Only 3 ingredients"],
         "fitness": ["Up for the challenge?", "30 days. This is the difference"], "business": ["Why do most businesses fail?", "3 steps to grow"]}
    return q.get(niche, ["Ready?", "3 things you didn't know"])[k - 1]


def default_cta(niche: str, lang: str) -> str:
    prof = load_profile(niche) if niche in config.NICHES else {}
    return prof.get("structure", {}).get(f"cta_text_{lang}") or ("עקבו לעוד 👇" if lang == "he" else "Follow for more 👇")


# ------------------------------------------------------------------ shot candidates
def candidates(items: list[dict], shot_len: float) -> list[dict]:
    """Every usable shot: photos as a whole; videos split into their best non-overlapping windows."""
    shots = []
    for it in items:
        if it.get("error") or it["kind"] not in ("image", "video"):
            continue
        if it["kind"] == "image":
            shots.append({"item": it["id"], "kind": "image", "in": 0.0, "out": max(1.2, shot_len),
                          "score": 0.55 * it.get("quality", 0.5) + 0.45 * it.get("interest", 0.5),
                          "subject": it.get("subject", [0.5, 0.45]), "peak": None, "motion": 0.0})
            continue
        secs = it.get("samples", [])
        dur = it.get("duration", 0)
        if dur < 0.8 or not secs:
            continue
        win = min(dur, max(shot_len, 1.2))
        ts = np.array([s["t"] for s in secs])
        q = np.array([s["q"] - 0.04 * s["shake"] for s in secs])
        ex = np.array([s["fe"].get("expressive", 0) if isinstance(s.get("fe"), dict) else 0 for s in secs])
        mo = np.array([s["motion"] for s in secs])
        score = 0.6 * q + 0.25 * ex + 0.15 * np.clip(mo / 4, 0, 1)
        taken = []
        n_windows = max(1, min(6, int(dur / max(win * 1.6, 1.5))))
        order = np.argsort(-score)
        for idx in order:
            t0 = float(np.clip(ts[idx] - win / 2, 0, max(0, dur - win)))
            if any(abs(t0 - a) < win for a in taken):
                continue
            taken.append(t0)
            inwin = (ts >= t0) & (ts <= t0 + win)
            peak = float(ts[inwin][np.argmax(mo[inwin])]) if inwin.any() else None
            shots.append({"item": it["id"], "kind": "video", "in": round(t0, 2), "out": round(t0 + win, 2),
                          "score": float(score[inwin].mean() if inwin.any() else score[idx]), "subject": it.get("subject", [0.5, 0.45]),
                          "peak": peak, "motion": float(mo[inwin].max() if inwin.any() else 0)})
            if len(taken) >= n_windows:
                break
    return shots


def _signatures(shots: list[dict], items_by_id: dict) -> None:
    import cv2

    for s in shots:
        it = items_by_id[s["item"]]
        try:
            if s["kind"] == "image":
                img = cv2.imread(it["path"])
                s["sig_in"] = s["sig_out"] = cinema.edge_signature(img)
            else:
                cap = cv2.VideoCapture(it["path"])
                cap.set(cv2.CAP_PROP_POS_MSEC, s["in"] * 1000)
                ok, a = cap.read()
                cap.set(cv2.CAP_PROP_POS_MSEC, max(s["in"], s["out"] - 0.1) * 1000)
                ok2, b = cap.read()
                cap.release()
                s["sig_in"] = cinema.edge_signature(a) if ok else np.zeros(128)
                s["sig_out"] = cinema.edge_signature(b) if ok2 else s["sig_in"]
        except Exception:
            s["sig_in"] = s["sig_out"] = np.zeros(128)


# ------------------------------------------------------------------ sources & enhancement
def make_sources(items: list[dict], used_ids: set[str], target_short: int) -> dict:
    from . import ingest

    srcs = {}
    for it in items:
        if it["id"] not in used_ids:
            continue
        cache = Path(it["path"]).parent if "cache" in it["path"] else (config.WORK_DIR / "cache" / it["id"])
        cache.mkdir(parents=True, exist_ok=True)
        if it["kind"] == "image":
            path = enhance.upscale_image(it["path"], cache, target_short, it.get("noise", 0))
            path = enhance.restore_faces(path, cache, _faces(it))
            import cv2

            img = cv2.imread(path)
            srcs[it["id"]] = {"path": path, "orig": it["orig"], "kind": "image", "w": img.shape[1], "h": img.shape[0],
                              "native_w": it.get("w", img.shape[1]), "native_h": it.get("h", img.shape[0]),
                              "duration": 9999, "has_audio": False, "enhanced": path != it["path"]}
        else:
            path = enhance.stabilize(it["path"], cache, it.get("shake", 0))
            info = probe(path)
            src = {"path": path, "orig": it["orig"], "kind": "video", "w": info.display_size[0], "h": info.display_size[1],
                   "duration": info.duration, "has_audio": info.has_audio, "stabilized": path != it["path"]}
            if it.get("hdr"):
                src["vf_pre"] = ingest.HDR_TONEMAP
            dn = enhance.denoise_filter(it.get("noise", 0) or 0, it.get("quality", 0.6))
            if dn:
                src["vf_extra"] = dn
            srcs[it["id"]] = src
    return srcs


def color_match(plan: dict, items_by_id: dict) -> None:
    """Match every source to the best-exposed one so the edit looks shot on one camera."""
    import cv2

    from .. import color

    frames = {}
    for sid, s in plan["sources"].items():
        if s["kind"] == "image":
            img = cv2.imread(s["path"])
            if img is not None:
                frames[sid] = [cv2.resize(img, (240, int(240 * img.shape[0] / img.shape[1])))]
        elif s["kind"] == "video":
            frames[sid] = color.sample_frames(s["path"], n=4, width=240)
    frames = {k: v for k, v in frames.items() if v}
    if len(frames) < 2:
        return
    ref = max(frames, key=lambda k: items_by_id.get(k, {}).get("quality", 0.5))
    for sid, fr in frames.items():
        if sid != ref:
            plan["sources"][sid]["match"] = color.match_transform(fr, frames[ref], strength=0.6)


# ------------------------------------------------------------------ montage
def montage_plan(items: list[dict], info: dict, profile: dict, variant: str, seed: int, narr: dict | None) -> dict:
    rng = random.Random(seed)
    items_by_id = {i["id"]: i for i in items}
    W, H = config.ASPECTS[config.platform_spec(info["platform"] if info["platform"] in config.PLATFORMS else "tiktok")["aspect"]]
    mood = info["mood"]
    track = cinema.pick_music(info["niche"], mood)
    beats = cinema.analyze_track(track["path"]) if track else {"bpm": 110, "beats": [], "duration": 120}
    bpm = beats["bpm"] or 110
    period = 60 / bpm
    avg = float(profile.get("pacing", {}).get("avg_shot_sec", 2.0)) * PACE.get(info.get("content_type", "high_energy"), 1.0)
    if variant == "short":
        avg *= 0.7
    avg = min(avg, 3.0)
    beats_per_shot = max(1, int(round(avg / period)))
    shot_len = beats_per_shot * period
    shots = candidates(items, max(shot_len * 1.6, 2.0))
    if not shots:
        raise ValueError("לא נמצא חומר ויזואלי שמיש")
    spec = config.PLATFORMS.get(info["platform"], config.PLATFORMS["tiktok"])
    lo, hi = spec["ideal"]
    target = info.get("target_seconds") or min(hi, max(lo * 0.6, len(shots) * shot_len * 0.9))
    if narr:
        target = max(target, (narr["words"][-1]["end"] if narr["words"] else 10) + 1.2)
    if variant == "short":
        target *= 0.7
    end_card = 2.4
    body_target = max(4.0, target - end_card)
    # pick best shots, keeping material diversity (each item appears at most twice)
    shots.sort(key=lambda s: -s["score"])
    chosen, per_item = [], {}
    for s in shots:
        if per_item.get(s["item"], 0) >= (2 if len(items) < 8 else 1):
            continue
        chosen.append(s)
        per_item[s["item"]] = per_item.get(s["item"], 0) + 1
        if len(chosen) * shot_len >= body_target:
            break
    # loop through material again if there isn't enough for the target length
    while len(chosen) * shot_len < body_target * 0.75 and len(chosen) < len(shots) * 2 and shots:
        chosen.append(dict(shots[len(chosen) % len(shots)]))
    hook = chosen[0]
    _signatures(chosen, items_by_id)
    rest = chosen[1:]
    # story order: by item order (capture/name order) then match-cut refinement within that
    rest.sort(key=lambda s: (int(s["item"][1:]), s["in"]))
    if info.get("content_type") == "transformation":
        # strong before -> process -> reveal: 'after' material is held back for the payoff,
        # and the hook teases the result
        def stage(s):
            n = items_by_id[s["item"]]["name"].lower()
            return 2 if any(w in n for w in ("after", "אחרי", "final", "result")) else (0 if any(w in n for w in ("before", "לפני")) else 1)
        afters = [s for s in chosen if stage(s) == 2]
        if afters:
            hook = max(afters, key=lambda s: s["score"])
            rest = [s for s in chosen if s is not hook]
        rest.sort(key=lambda s: (stage(s), int(s["item"][1:]), s["in"]))
        ordered = [hook] + rest
    else:
        ordered = cinema.match_order([hook] + rest, first_fixed=True)
    grid = cinema.beat_grid(beats.get("beats", []), bpm, target + 10)
    lengths = []
    for k, s in enumerate(ordered):
        mult = 0.5 if (variant == "hook_b" and k < 3) else 1.0
        base = min(3.2, shot_len * mult)  # no shot overstays its welcome (visual stagnation)
        lengths.append(max(0.45, base))
    lengths = cinema.snap_durations(lengths, grid, min_len=0.45)
    body = sum(lengths)
    total = cinema.land_on_bar(body + end_card, grid)
    if total - end_card > 1.0:
        lengths[-1] = max(0.6, lengths[-1] + (total - end_card - body))
    plan = {
        "version": 2,
        "meta": {"niche": info["niche"], "platform": info["platform"], "language": info["language"], "aspect": spec["aspect"],
                 "width": W, "height": H, "fps": config.FPS, "profile_version": profile.get("profile_version"),
                 "hook_type": "visual" if variant != "hook_b" else ("question" if "?" in info["alt_titles"][0] else "number_list"),
                 "mode": "montage", "variant": variant, "mood": mood, "bpm": bpm, "editor": info.get("source")},
        "sources": make_sources(items, {s["item"] for s in ordered}, min(W, H)),
        "clips": [], "words": [], "punch": [], "emojis": [], "broll": [], "transitions": [], "graphics": [],
        "captions": {**profile.get("captions", {})}, "camera_motion": "none", "reframe": {"enabled": False},
        "background": {"mode": "none"},
        "music": {"enabled": True, "path": track["path"] if track else None, "volume_db": -8 if not narr else -17,
                  "duck_db": -12, "bpm": bpm},
        "sfx": {"enabled": True}, "audio": {"denoise": False}, "color": {**profile.get("color", {}), "enabled": True},
        "progress_bar": {"enabled": False}, "title": {}, "cta": {},
    }
    t = 0.0
    for k, (s, L) in enumerate(zip(ordered, lengths)):
        it = items_by_id[s["item"]]
        clip = {"src": s["item"], "role": "hook" if k == 0 else "body", "audio": False, "zoom": 1.0}
        if s["kind"] == "image":
            cx, cy = s["subject"]
            push_in = k % 2 == 0
            z0, z1 = (1.0, 1.14) if push_in else (1.14, 1.02)
            mid = (0.5 + (cx - 0.5) * 0.6, 0.5 + (cy - 0.5) * 0.6)
            clip.update({"in": 0.0, "out": L, "motion": {"type": "parallax" if (k % 3 == 1 and it.get("quality", 0) > 0.35) else "kenburns",
                                                          "from": [0.5, 0.5, z0] if push_in else [mid[0], mid[1], z0],
                                                          "to": [mid[0], mid[1], z1] if push_in else [0.5, 0.5, z1],
                                                          "dir": 1 if k % 2 else -1}})
            plan["clips"].append(clip)
        else:
            dur_src = L
            ramp = mood in ("energetic", "fun") and s["motion"] > 2.5 and s["peak"] is not None and L >= 1.4 and variant != "short"
            if ramp:
                dur_src = L * 0.75  # slow-mo stretches source time
            a = min(max(0.0, s["in"]), max(0.0, it["duration"] - dur_src))
            clip.update({"in": round(a, 3), "out": round(min(it["duration"], a + dur_src), 3), "speed": 1.0,
                         "motion": {"type": "kenburns", "from": [s["subject"][0], s["subject"][1], 1.0],
                                    "to": [s["subject"][0], s["subject"][1], 1.06]}})
            if ramp:
                parts = cinema.speed_ramp(clip, float(np.clip(s["peak"], a + 0.2, a + dur_src - 0.2)))
                plan["clips"].extend(parts)
            else:
                plan["clips"].append(clip)
        t += L
    # end card holds the last image/frame under the CTA
    last = plan["clips"][-1]
    if plan["sources"][last["src"]]["kind"] == "image":
        last["out"] = last["in"] + (last["out"] - last["in"]) + end_card
    else:
        plan["clips"].append({**last, "in": max(0.0, last["out"] - 0.05), "out": last["out"], "speed": 0.05 / end_card, "slowmo": False,
                              "role": "cta", "motion": {"type": "kenburns", "from": [0.5, 0.5, 1.06], "to": [0.5, 0.5, 1.12]}})
    total = sum((c["out"] - c["in"]) / c.get("speed", 1.0) for c in plan["clips"])
    # transitions only where the story moves on (rulebook: never transition just because you can):
    # after the hook, at the midpoint section change and before the payoff. Everything else is a clean cut on the beat.
    types = {"calm": ["fade"], "luxury": ["fade"], "emotional": ["fade"], "fun": ["whip", "zoom"],
             "energetic": ["zoom", "whip", "flash"]}[mood]
    nclips = len(plan["clips"])
    sections = sorted({0, max(1, nclips // 2 - 1), max(1, nclips - 2)}) if nclips > 2 else [0]
    for k in sections:
        if k >= nclips - 1:
            continue
        typ = types[len(plan["transitions"]) % len(types)] if variant != "short" else "flash"
        if typ == "fade":
            plan["clips"][k + 1]["fade_in"] = round(min(0.45, period), 3)
            plan["transitions"].append({"after_clip": k, "type": "cut", "sfx": "whoosh" if k == 0 else None, "sfx_db": -18})
        else:
            plan["transitions"].append({"after_clip": k, "type": typ, "sfx": "riser" if k == nclips - 2 else "whoosh"})
    # graphics
    title = info["title"] if variant != "hook_b" else info["alt_titles"][0]
    title_dur = min(2.8, max(1.8, lengths[0] + (lengths[1] if len(lengths) > 1 else 0)))
    plan["graphics"].append({"type": "kinetic_title", "text": title, "start": 0.05, "end": title_dur})
    stats = motion.extract_stats(info.get("story", ""))
    t_cursor = title_dur + 0.4
    for st in stats[:2]:
        if t_cursor + 2.0 < total - end_card:
            plan["graphics"].append({"type": "stat", **st, "start": t_cursor, "end": t_cursor + 2.0})
            t_cursor += 2.6
    if info.get("location") and t_cursor + 2.2 < total - end_card:
        plan["graphics"].append({"type": "location", "text": info["location"], "start": t_cursor, "end": t_cursor + 2.2})
        t_cursor += 2.6
    b = brand_mod.load()
    if b.get("name") and total > 8:
        plan["graphics"].append({"type": "lower_third", "text": b["name"], "sub": b.get("handle") or None,
                                 "start": min(total - end_card - 3, max(title_dur + 0.3, total * 0.45)),
                                 "end": min(total - end_card - 0.2, max(title_dur + 3.0, total * 0.45 + 2.7))})
    plan["graphics"].append({"type": "end_card", "text": info["cta"].strip(), "handle": b.get("handle"),
                             "start": total - end_card, "end": total})
    plan["title"] = {}  # montage titles are motion graphics
    plan["cta"] = {}
    if narr:
        plan["narration"] = {"path": narr["path"], "engine": narr["engine"]}
        plan["words"] = [{"i": k, "text": w["text"], "src": "N", "abs": True, "start": w["start"] + 0.35, "end": w["end"] + 0.35,
                          "emph": False, "sid": 0} for k, w in enumerate(narr["words"])]
        plan["captions"]["enabled"] = True
    else:
        plan["captions"]["enabled"] = False
    color_match(plan, items_by_id)
    return plan


# ------------------------------------------------------------------ A-roll
def aroll_plan(main: dict, items: list[dict], info: dict, profile: dict, variant: str, seed: int) -> dict:
    from ..pipeline import build_plan

    v = {"main": None, "hook_b": "hook_alt", "short": "fast"}.get(variant)
    plan = build_plan(main["orig"], info["niche"], info["platform"] if info["platform"] in config.PLATFORMS else "tiktok",
                      language=info["language"] if main.get("speech", {}).get("language") is None else None,
                      profile=profile, variant=v, seed=seed)
    plan["meta"]["mode"] = "aroll"
    plan["meta"]["variant"] = variant
    plan["graphics"] = []
    # other material becomes B-roll cutaways on sentence starts after the hook
    others = [i for i in items if i["id"] != main["id"] and i["kind"] in ("image", "video") and not i.get("error")]
    others.sort(key=lambda i: -(i.get("quality", 0.5) + i.get("interest", 0) * 0.5))
    if others:
        from .. import timeline

        ow = timeline.output_words(plan)
        starts, last_sid = [], None
        for w in ow:
            if w["sid"] != last_sid and w["start"] > 3.0:
                starts.append(w)
            last_sid = w["sid"]
        ratio = float(profile.get("broll", {}).get("ratio", 0.15)) or 0.15
        total = timeline.total_duration(plan)
        n = min(len(others) * 2, max(1, int(total * max(ratio, 0.12) / 2.0)), len(starts))
        step = max(1, len(starts) // max(1, n))
        for k, w in enumerate(starts[::step][:n]):
            it = others[k % len(others)]
            entry = {"word": w["i"], "path": it["path"], "dur": 2.0 if it["kind"] == "image" else min(2.4, it.get("duration", 2)),
                     "kind": it["kind"]}
            if it["kind"] == "video":
                best = max(it.get("samples", [{"t": 0, "q": 0}]), key=lambda s: s["q"])
                entry["in"] = max(0.0, min(best["t"] - 0.5, it.get("duration", 2) - entry["dur"]))
            plan["broll"].append(entry)
    return plan


# ------------------------------------------------------------------ entry
def direct(items: list[dict], brief: str = "", variant: str = "main", seed: int = 7, info: dict | None = None,
           narration: dict | None = None) -> dict:
    info = info or understand(brief, items)
    niche = info["niche"]
    profile = load_profile(niche)
    speakers = [i for i in items if i["kind"] == "video" and i.get("speech", {}).get("has_speech") and i.get("duration", 0) > 6]
    if speakers:
        main = max(speakers, key=lambda i: i.get("speech", {}).get("words", 0))
        plan = aroll_plan(main, items, info, profile, variant, seed)
    else:
        plan = montage_plan(items, info, profile, variant, seed, narration)
    plan = brand_mod.apply(plan)
    plan = brand_mod.apply_preferences(plan)
    plan["meta"]["brief"] = brief
    plan["meta"]["concept"] = {k: info.get(k) for k in ("niche", "platform", "mood", "language", "title", "cta", "story", "source",
                                                         "content_type")}
    return plan


def variants(items: list[dict], brief: str, n: int = 3, narration: dict | None = None, info: dict | None = None) -> list[dict]:
    info = info or understand(brief, items)
    names = ["main", "hook_b", "short"][:n]
    return [direct(items, brief, v, seed=7 + k, info=copy.deepcopy(info), narration=narration) for k, v in enumerate(names)]


# ------------------------------------------------------------------ applying the Critic's notes
def apply_fixes(plan: dict, fixes: list[dict], profile: dict) -> list[str]:
    """Mutate the EDL according to the critic's fixes. Returns a log of what changed."""
    from .. import timeline
    from .critic import visual_changes

    done = []
    mode = plan["meta"].get("mode")
    ops = {f["op"]: f for f in fixes}
    if "strengthen_hook" in ops:
        if plan["clips"] and plan["clips"][0].get("brand") == "intro":
            plan["clips"].insert(1, plan["clips"].pop(0))
        plan["clips"][0].pop("fade_in", None)
        if mode == "montage":
            if not any(g["type"] == "kinetic_title" for g in plan["graphics"]):
                c = plan["meta"].get("concept", {})
                plan["graphics"].insert(0, {"type": "kinetic_title", "text": c.get("title") or "👀", "start": 0.05, "end": 2.6})
        elif not plan.get("title", {}).get("text"):
            first = [w for w in timeline.output_words(plan) if w["start"] < 3.0]
            from ..selection import make_title

            plan["title"] = {"text": make_title(" ".join(w["text"] for w in first), plan["meta"].get("language", "en")), "dur": 2.6}
        done.append("hook")
    if "break_stagnation" in ops:
        max_gap = ops["break_stagnation"].get("max_gap", 3.0)
        lay = timeline.layout(plan)
        pts = sorted(set([0.0] + visual_changes(plan) + [lay[-1]["t1"]]))
        ow = timeline.output_words(plan, lay)
        for a, b in zip(pts, pts[1:]):
            if b - a <= max_gap:
                continue
            mid = (a + b) / 2
            if mode == "montage":
                k = next((c["index"] for c in lay if c["t0"] <= mid < c["t1"]), None)
                if k is None:
                    continue
                c = plan["clips"][k]
                split = c["in"] + (mid - lay[k]["t0"]) * c.get("speed", 1.0)
                c2 = {**c, "in": split, "motion": {**(c.get("motion") or {}), "type": "kenburns",
                                                   "from": [0.5, 0.42, 1.18], "to": [0.5, 0.46, 1.1]}}
                c2.pop("fade_in", None)
                c["out"] = split
                plan["clips"].insert(k + 1, c2)
                for tr in plan["transitions"]:
                    if tr["after_clip"] >= k:
                        tr["after_clip"] += 1
            else:
                cands = [w for w in ow if a + 0.6 < w["start"] < b - 0.6]
                if cands:
                    w = max(cands, key=lambda w: len(w["text"]))
                    plan["punch"].append({"word": w["i"], "scale": float(profile.get("zoom", {}).get("scale", 1.14)),
                                          "hold": 1.2, "style": "snap", "sfx": None})
            done.append(f"interrupt@{mid:.1f}s")
    if "faster" in ops or "slower" in ops:
        f = 0.85 if "faster" in ops else 1.15
        for c in plan["clips"]:
            if plan["sources"][c["src"]]["kind"] == "image" and c.get("role") != "cta":
                c["out"] = c["in"] + max(0.6, (c["out"] - c["in"]) * f)
            elif mode == "aroll" and "faster" in ops:
                c["speed"] = round(min(1.15, c.get("speed", 1.0) * 1.05), 3)
        done.append("pace")
    if "drop_bad_shots" in ops and len(plan["clips"]) > 4:
        for k in sorted(ops["drop_bad_shots"].get("clips", []), reverse=True):
            if 0 < k < len(plan["clips"]) - 1:
                plan["clips"].pop(k)
                plan["transitions"] = [t for t in plan["transitions"] if t["after_clip"] != k]
                for t in plan["transitions"]:
                    if t["after_clip"] > k:
                        t["after_clip"] -= 1
        done.append("drop_bad")
    if "reduce_effects" in ops:
        fx = [t for t in plan["transitions"] if t.get("type") not in ("cut", None)]
        for t in fx[1::2]:
            t["type"], t["sfx"] = "cut", None
        plan["emojis"] = plan.get("emojis", [])[::2]
        done.append("restraint")
    if "add_cta" in ops:
        c = plan["meta"].get("concept", {})
        if mode == "montage":
            total = timeline.total_duration(plan)
            plan["graphics"].append({"type": "end_card", "text": c.get("cta") or "עקבו לעוד", "start": max(0, total - 2.4), "end": total})
        else:
            plan["cta"] = {"text": c.get("cta") or profile.get("structure", {}).get("cta_text_he", "Follow"), "dur": 3.0}
        done.append("cta")
    if "captions_on" in ops:
        plan.setdefault("captions", {})["enabled"] = True
        done.append("captions")
    if "music_down" in ops:
        plan["music"]["volume_db"] = plan["music"].get("volume_db", -19) - 4
    if "music_up" in ops:
        plan["music"]["volume_db"] = plan["music"].get("volume_db", -19) + 3
    if "fix_audio" in ops and mode == "montage" and not plan["music"].get("path"):
        tr = cinema.pick_music(plan["meta"]["niche"], plan["meta"].get("mood", "energetic"))
        if tr:
            plan["music"].update({"enabled": True, "path": tr["path"]})
            done.append("music")
    # keep graphics inside the (possibly changed) timeline
    total = timeline.total_duration(plan)
    for g in plan.get("graphics", []):
        if g["type"] == "end_card":
            g["start"], g["end"] = max(0.0, total - (g["end"] - g["start"])), total
        g["end"] = min(g["end"], total)
    plan["graphics"] = [g for g in plan.get("graphics", []) if g["end"] - g["start"] > 0.3]
    return done

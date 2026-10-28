"""Reverse-engineer the editing style of a reference video -> per-video style profile + feature vector.

Measures: shot length / cut rhythm, transition types, zoom & camera motion (optical flow),
on-screen caption presence/position/colours (text-stroke detection), hook (first 3 s transcript),
music presence + BPM, SFX on cuts (onset peaks), B-roll ratio (faceless shots), colour look,
structure (hook / value / CTA) and topic keywords. Claude vision refines caption style when available.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from collections import Counter
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from .. import color, config, llm
from ..media import load_audio, probe
from ..reframe import detect_faces
from . import library

log = logging.getLogger(__name__)

CTA_PAT = re.compile(r"\b(follow|subscribe|save|comment|share|link in bio|like|dm|עקבו|הירשמו|שמרו|תגיבו|שתפו|לינק|קישור|הודעה)\b", re.I)
URL_RE = re.compile(r"^https?://", re.I)


# ------------------------------------------------------------------ download
def download(url: str, dest_dir: Path) -> tuple[Path, dict]:
    import yt_dlp

    dest_dir.mkdir(parents=True, exist_ok=True)
    opts = {
        "outtmpl": str(dest_dir / "%(extractor)s_%(id)s.%(ext)s"),
        "format": "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b",
        "merge_output_format": "mp4",
        "quiet": True, "no_warnings": True, "noplaylist": True,
        "retries": 3, "socket_timeout": 30,
        "writeinfojson": False,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        path = Path(ydl.prepare_filename(info)).with_suffix(".mp4")
        if not path.exists():
            cands = sorted(dest_dir.glob(f"{info.get('extractor', '*')}_{info['id']}.*"))
            path = cands[0]
    meta = {k: info.get(k) for k in ("id", "title", "description", "uploader", "channel_id", "channel_follower_count",
                                      "view_count", "like_count", "comment_count", "repost_count", "duration",
                                      "upload_date", "webpage_url", "extractor", "tags")}
    return path, meta


# ------------------------------------------------------------------ visual analysis
def _sample(path: str, fps: float = 10.0, width: int = 160):
    cap = cv2.VideoCapture(path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, int(round(src_fps / fps)))
    i = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, f = cap.retrieve()
            if ok:
                yield i / src_fps, f, cv2.resize(f, (width, int(width * f.shape[0] / f.shape[1])))
        i += 1
    cap.release()


def shot_analysis(path: str) -> dict:
    times, hists, lumas, frames_small = [], [], [], []
    full_samples = []
    for t, full, small in _sample(path, 10.0):
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
        h = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
        cv2.normalize(h, h)
        times.append(t)
        hists.append(h)
        lumas.append(float(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).mean()))
        frames_small.append(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
        if len(times) % 5 == 1:
            full_samples.append((t, full))
    n = len(times)
    if n < 3:
        return {"cuts": [], "duration": times[-1] if times else 0, "transitions": {}, "samples": full_samples,
                "zoom_events": 0, "camera_motion": "static", "motion_mean": 0.0}
    d = np.array([cv2.compareHist(hists[i - 1], hists[i], cv2.HISTCMP_BHATTACHARYYA) for i in range(1, n)])
    pix = np.array([np.mean(np.abs(frames_small[i].astype(np.int16) - frames_small[i - 1])) for i in range(1, n)])
    thr = max(0.32, float(np.median(d) + 4 * np.std(d)))
    # jump cuts in talking heads barely move the histogram: detect them as spikes of
    # frame difference relative to the local motion level instead
    local = np.array([np.median(pix[max(0, i - 6):i + 7]) for i in range(len(pix))])
    spike = pix / (local + 1.0)
    cuts, kinds = [], Counter()
    last = -1.0
    for i in range(1, n):
        j = i - 1
        hard = d[j] > thr and pix[j] > 12
        jump = spike[j] > 3.2 and pix[j] > 5 and (j + 1 >= len(pix) or pix[j + 1] < pix[j] * 0.6)
        if (hard or jump) and times[i] - last > 0.25:
            l0, l1 = lumas[i - 1], lumas[i]
            if max(l0, l1) > 225 or (i + 1 < n and lumas[i] > 215):
                kinds["flash"] += 1
            elif hard and i >= 3 and np.mean(d[max(0, i - 4):i - 1]) > thr * 0.45:
                kinds["fade"] += 1
            else:
                kinds["cut"] += 1
            cuts.append(times[i])
            last = times[i]
    # camera motion / zoom via sparse flow between consecutive samples (excluding cuts)
    cut_idx = {int(np.searchsorted(times, c)) for c in cuts}
    scales, trans = [], []
    for i in range(1, n):
        if i in cut_idx:
            continue
        p0 = cv2.goodFeaturesToTrack(frames_small[i - 1], 60, 0.01, 6)
        if p0 is None or len(p0) < 8:
            continue
        p1, st, _ = cv2.calcOpticalFlowPyrLK(frames_small[i - 1], frames_small[i], p0, None)
        ok = st.ravel() == 1
        if ok.sum() < 8:
            continue
        m, _ = cv2.estimateAffinePartial2D(p0[ok], p1[ok])
        if m is None:
            continue
        s = float(np.hypot(m[0, 0], m[1, 0]))
        hh, ww = frames_small[i].shape
        c = np.array([ww / 2, hh / 2, 1.0])
        moved = m @ c - c[:2]  # displacement of the frame centre (scale-independent)
        scales.append(s)
        trans.append(float(np.hypot(*moved)))
    scales = np.array(scales) if scales else np.ones(1)
    trans = np.array(trans) if trans else np.zeros(1)
    snap = int(np.sum((scales > 1.04) | (scales < 0.96)))
    zin = scales > 1.008
    smooth = int(np.sum(zin[1:] & ~zin[:-1])) if zin.size > 1 else 0
    zoom_events = snap + smooth
    motion = float(np.median(trans))
    camera = "handheld" if motion > 0.8 else ("slow_push" if np.mean(scales) > 1.002 else "static")
    whips = int(np.sum(trans > 10))
    if whips:
        kinds["whip"] += whips
    return {"cuts": cuts, "duration": times[-1], "transitions": dict(kinds), "samples": full_samples,
            "zoom_events": zoom_events, "camera_motion": camera, "motion_mean": motion,
            "punch_zoom_ratio": float(np.mean(scales > 1.01))}


def caption_analysis(samples: list[tuple[float, np.ndarray]]) -> dict:
    """Detect burned-in captions: bright or vivid glyphs hugging a dark outline/shadow, or light text on
    a solid box. Reports presence, vertical position and text/highlight colours."""
    ys, colors, presence = [], [], 0
    for _, f in samples:
        h, w = f.shape[:2]
        small = cv2.resize(f, (360, int(360 * h / w)))
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
        S, V = hsv[..., 1], hsv[..., 2]
        glyph = ((V > 205) & (S < 70)) | ((S > 130) & (V > 170))
        dark = cv2.dilate((V < 60).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        outlined = glyph & dark
        # boxed captions: light glyphs inside a flat, saturated rectangle
        flat = cv2.blur((cv2.Laplacian(V, cv2.CV_16S, ksize=3) == 0).astype(np.float32), (9, 9)) > 0.35
        boxed = ((V > 215) & (S < 60)) & cv2.dilate((flat & (S > 120)).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        mask = ((outlined | boxed) * 255).astype(np.uint8)
        conn = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (19, 5)))
        num, _, stats, _ = cv2.connectedComponentsWithStats(conn, 8)
        sh, sw = V.shape
        best = None
        for k in range(1, num):
            x, y, bw_, bh, area = stats[k]
            if bw_ < sw * 0.12 or bh < sh * 0.015 or bh > sh * 0.2 or bw_ / max(bh, 1) < 1.6:
                continue
            density = mask[y:y + bh, x:x + bw_].mean() / 255
            if density < 0.06:
                continue
            if abs(x + bw_ / 2 - sw / 2) > sw * 0.25:
                continue
            if best is None or density * bw_ > best[4]:
                best = (x, y, bw_, bh, density * bw_)
        if best:
            presence += 1
            x, y, bw_, bh, _ = best
            ys.append((y + bh / 2) / sh)
            roi = small[y:y + bh, x:x + bw_].reshape(-1, 3).astype(np.float32)
            rh = hsv[y:y + bh, x:x + bw_].reshape(-1, 3)
            bright = roi[(rh[:, 2] > 205) & (rh[:, 1] < 70)]
            vivid = roi[(rh[:, 1] > 130) & (rh[:, 2] > 170)]
            colors.append((bright.mean(0) if len(bright) > 10 else None, vivid.mean(0) if len(vivid) > 15 else None))
    ratio = presence / max(1, len(samples))
    res = {"enabled": ratio > 0.3, "presence": round(ratio, 3)}
    if ys:
        pos = float(np.median(ys))
        res["position"] = round(pos, 3)
        res["position_zone"] = "top" if pos < 0.35 else ("bottom" if pos > 0.72 else "middle")
    vivids = [c[1] for c in colors if c[1] is not None]
    if vivids:
        b, g, r = np.median(np.array(vivids), 0)
        res["highlight_color"] = "#{:02X}{:02X}{:02X}".format(int(r), int(g), int(b))
    brights = [c[0] for c in colors if c[0] is not None]
    if brights:
        b, g, r = np.median(np.array(brights), 0)
        res["color"] = "#FFFFFF" if min(r, g, b) > 200 else "#{:02X}{:02X}{:02X}".format(int(r), int(g), int(b))
    return res


def face_ratio(samples: list[tuple[float, np.ndarray]]) -> float:
    if not samples:
        return 0.0
    picks = samples[:: max(1, len(samples) // 20)]
    return sum(1 for _, f in picks if detect_faces(f)) / len(picks)


def classify_look(stats: dict) -> str:
    if stats["warmth"] > 0.05 and stats["saturation"] > 0.38:
        return "warm"
    if stats["luma"] > 0.55:
        return "bright_clean"
    if stats["contrast"] > 0.24 and stats["saturation"] > 0.33:
        return "punchy"
    if stats["contrast"] > 0.2:
        return "cinematic"
    return "neutral"


# ------------------------------------------------------------------ audio analysis
def audio_analysis(path: str, words: list[dict], duration: float, cuts: list[float]) -> dict:
    try:
        a = load_audio(path, 22050)
    except Exception:
        return {"present": False, "bpm": None, "sfx_per_min": 0.0, "sfx_on_cuts": 0.0}
    if a.size < 22050:
        return {"present": False, "bpm": None, "sfx_per_min": 0.0, "sfx_on_cuts": 0.0}
    import librosa

    speech = np.zeros(a.size, bool)
    for w in words:
        speech[int(w["start"] * 22050):int(w["end"] * 22050)] = True
    gaps = a[~speech]
    total_rms = float(np.sqrt(np.mean(a ** 2)) + 1e-9)
    gap_rms = float(np.sqrt(np.mean(gaps ** 2)) + 1e-9) if gaps.size > 22050 else 0.0
    music = gap_rms > total_rms * 0.25 or not words
    bpm = None
    if music:
        try:
            tempo, _ = librosa.beat.beat_track(y=a, sr=22050)
            bpm = float(np.atleast_1d(tempo)[0])
        except Exception:
            bpm = None
    onset = librosa.onset.onset_strength(y=a, sr=22050)
    flat = librosa.feature.spectral_flatness(y=a)[0]
    peaks = librosa.util.peak_pick(onset, pre_max=10, post_max=10, pre_avg=30, post_avg=30,
                                   delta=np.percentile(onset, 97) * 0.6, wait=15)
    # SFX = strong transients that are noise-like (whoosh/impact) or land outside speech
    strong = []
    hi = np.percentile(onset, 98)
    for pk in peaks:
        t = float(librosa.frames_to_time(pk, sr=22050))
        in_speech = speech[min(speech.size - 1, int(t * 22050))]
        if onset[pk] > hi and (flat[min(pk, flat.size - 1)] > 0.08 or not in_speech):
            strong.append(t)
    on_cuts = sum(1 for c in cuts if any(abs(c - t) < 0.2 for t in strong))
    return {"present": bool(music), "bpm": round(bpm, 1) if bpm else None,
            "sfx_per_min": round(len(strong) / max(duration / 60, 1e-6), 2),
            "sfx_on_cuts": round(on_cuts / max(1, len(cuts)), 3),
            "energy": "high" if bpm and bpm > 118 else ("low" if bpm and bpm < 95 else "medium")}


def classify_hook(text: str, has_speech: bool, motion: float) -> str:
    t = text.lower()
    if not has_speech:
        return "visual"
    if "?" in t or re.search(r"\b(why|how|what|למה|איך|מה)\b", t):
        return "question"
    if re.search(r"\b(stop|don'?t|never|quit|תפסיקו|אל ת|אסור)\b", t):
        return "pattern_interrupt"
    if re.search(r"\d|\b(one|two|three|five|ten|שלוש|חמש|עשר)\b", t):
        return "number_list"
    if re.search(r"\b(secret|nobody|hidden|truth|סוד|אף אחד|האמת)\b", t):
        return "curiosity_gap"
    if re.search(r"\b(mistake|worst|wrong|avoid|טעות|הכי גרוע)\b", t):
        return "negative"
    if re.search(r"\b(i was|when i|my |story|הייתי|כש|הסיפור)\b", t):
        return "story"
    return "bold_claim"


def topic_keywords(text: str, n: int = 8) -> list[str]:
    stop = set("the a an and or to of in on for is are it this that you your i we my with be at as so but if not "
               "של את על עם זה זו הוא היא אני אתם לא כן גם אבל או כי מה איך יש אין כל רק".split())
    toks = [w for w in re.findall(r"[\w֐-׿']+", text.lower()) if len(w) > 2 and w not in stop and not w.isdigit()]
    return [w for w, _ in Counter(toks).most_common(n)]


# ------------------------------------------------------------------ main
def analyze_video(path: str, meta: dict | None = None, transcript: dict | None = None,
                  use_llm: bool = True) -> dict:
    """Full analysis -> {"profile": per-video style profile, "features": flat numeric vector, ...}."""
    from ..transcribe import transcribe

    info = probe(path)
    dur = info.duration
    sh = shot_analysis(path)
    samples = sh.pop("samples")
    caps = caption_analysis(samples)
    try:
        tr = transcript or transcribe(path)
    except Exception as e:
        log.warning("transcription failed for %s: %s", path, e)
        tr = {"language": "en", "words": [], "segments": []}
    words = tr["words"]
    hook_text = " ".join(w["text"] for w in words if w["start"] < 3.0)
    full_text = " ".join(w["text"] for w in words)
    tail = " ".join(w["text"] for w in words if w["start"] > dur * 0.8)
    au = audio_analysis(path, words, dur, sh["cuts"])
    frames_small = [cv2.resize(f, (320, int(320 * f.shape[0] / f.shape[1]))) for _, f in samples]
    cstats = color.frame_stats(frames_small)
    faces = face_ratio(samples)
    n_shots = len(sh["cuts"]) + 1
    trans_total = sum(sh["transitions"].values()) or 1
    profile = {
        "source": (meta or {}).get("webpage_url") or str(path),
        "niche": None,
        "pacing": {"avg_shot_sec": round(dur / n_shots, 3), "cuts_per_min": round(len(sh["cuts"]) / max(dur / 60, 1e-6), 2),
                   "words_per_sec": round(len(words) / max(dur, 1e-6), 3)},
        "hook": {"type": classify_hook(hook_text, bool(hook_text.strip()), sh["motion_mean"]),
                 "has_text_overlay": caps.get("presence", 0) > 0.2,
                 "first_cut_sec": round(sh["cuts"][0], 2) if sh["cuts"] else round(dur, 2),
                 "examples": [hook_text.strip()] if hook_text.strip() else []},
        "captions": {k: v for k, v in caps.items() if k in ("enabled", "position", "position_zone", "highlight_color", "color")},
        "zoom": {"punch_in_per_min": round(sh["zoom_events"] / max(dur / 60, 1e-6), 2),
                 "camera_motion": sh["camera_motion"], "style": "snap" if sh.get("punch_zoom_ratio", 0) < 0.3 else "smooth"},
        "transitions": {"types": {k: round(v / trans_total, 3) for k, v in sh["transitions"].items()},
                        "per_min": round(sum(v for k, v in sh["transitions"].items() if k != "cut") / max(dur / 60, 1e-6), 2)},
        "music": {"present": au["present"], "bpm": au["bpm"], "energy": au.get("energy", "medium")},
        "sfx": {"per_min": au["sfx_per_min"], "on_cuts": au["sfx_on_cuts"]},
        "broll": {"ratio": round(max(0.0, 1 - faces), 3) if faces > 0.15 else 0.0},
        "color": {"look": classify_look(cstats), "saturation": round(cstats["saturation"] / 0.36, 3),
                  "brightness": round(cstats["luma"] / 0.84, 3), "contrast": round(cstats["contrast"] / 0.3, 3),
                  "warmth": round(cstats["warmth"], 3)},
        "structure": {"avg_duration": round(dur, 2), "cta": bool(CTA_PAT.search(tail)),
                      "segments": ["hook", "value"] + (["cta"] if CTA_PAT.search(tail) else [])},
        "overlays": {"progress_bar": False},
        "topic": topic_keywords(full_text),
        "language": tr.get("language"),
    }
    if caps.get("presence", 0) > 0.3:
        profile["captions"]["words_per_group"] = 2 if profile["pacing"]["words_per_sec"] > 3.2 else 3
    if use_llm and llm.available() and samples:
        refine_with_claude(profile, samples, hook_text, full_text)
    features = feature_vector(profile, dur, caps, faces, cstats, info)
    return {"profile": profile, "features": features, "transcript_text": full_text, "hook_text": hook_text,
            "duration": dur, "meta": meta or {}}


def feature_vector(p: dict, dur: float, caps: dict, faces: float, cstats: dict, info) -> dict:
    """Flat numeric features used by the learning engine."""
    hook_types = ["bold_claim", "question", "number_list", "pattern_interrupt", "negative", "story", "visual", "curiosity_gap"]
    looks = ["punchy", "warm", "bright_clean", "cinematic", "neutral"]
    f = {
        "duration": dur,
        "avg_shot_sec": p["pacing"]["avg_shot_sec"],
        "cuts_per_min": p["pacing"]["cuts_per_min"],
        "words_per_sec": p["pacing"]["words_per_sec"],
        "first_cut_sec": p["hook"]["first_cut_sec"],
        "caption_presence": caps.get("presence", 0.0),
        "caption_position": caps.get("position", 0.0) or 0.0,
        "punch_in_per_min": p["zoom"]["punch_in_per_min"],
        "transitions_per_min": p["transitions"]["per_min"],
        "music_present": float(p["music"]["present"]),
        "music_bpm": p["music"]["bpm"] or 0.0,
        "sfx_per_min": p["sfx"]["per_min"],
        "sfx_on_cuts": p["sfx"]["on_cuts"],
        "broll_ratio": p["broll"]["ratio"],
        "face_ratio": faces,
        "saturation": cstats["saturation"],
        "brightness": cstats["luma"],
        "contrast": cstats["contrast"],
        "warmth": cstats["warmth"],
        "has_cta": float(p["structure"]["cta"]),
        "vertical": float(info.display_size[1] > info.display_size[0]),
        "text_overlay_hook": float(p["hook"]["has_text_overlay"]),
    }
    for h in hook_types:
        f[f"hook_{h}"] = float(p["hook"]["type"] == h)
    for lk in looks:
        f[f"look_{lk}"] = float(p["color"]["look"] == lk)
    return {k: round(float(v), 4) for k, v in f.items()}


VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "caption_font_style": {"type": "string", "enum": ["heavy_sans", "rounded", "serif", "handwritten", "none"]},
        "caption_text_color": {"type": "string"},
        "caption_highlight_color": {"type": "string"},
        "caption_uppercase": {"type": "boolean"},
        "caption_words_per_screen": {"type": "integer"},
        "highlight_mode": {"type": "string", "enum": ["color", "box", "none"]},
        "hook_type": {"type": "string", "enum": ["bold_claim", "question", "number_list", "pattern_interrupt",
                                                  "negative", "story", "visual", "curiosity_gap"]},
        "uses_emoji": {"type": "boolean"},
        "why_it_works": {"type": "string"},
    },
    "required": ["caption_font_style", "caption_text_color", "caption_highlight_color", "caption_uppercase",
                 "caption_words_per_screen", "highlight_mode", "hook_type", "uses_emoji", "why_it_works"],
    "additionalProperties": False,
}


def refine_with_claude(profile: dict, samples, hook_text: str, full_text: str) -> None:
    import tempfile

    picks = samples[:: max(1, len(samples) // 4)][:4]
    paths = []
    tmp = Path(tempfile.mkdtemp())
    for i, (_, f) in enumerate(picks):
        p = tmp / f"f{i}.jpg"
        cv2.imwrite(str(p), cv2.resize(f, (360, int(360 * f.shape[0] / f.shape[1]))))
        paths.append(p)
    res = llm.ask_json(
        "You are a senior short-form video editor reverse-engineering the editing style of a viral video.",
        f"Frames from the video are attached in order. Hook (first 3s): {hook_text!r}. Transcript: {full_text[:1500]!r}.\n"
        "Describe the on-screen caption style precisely (colors as #RRGGBB) and classify the hook. "
        "In why_it_works, explain in Hebrew in one or two sentences why this video performs.",
        VISION_SCHEMA, images=paths, effort="low")
    if not res:
        return
    c = profile["captions"]
    c["highlight_color"] = res["caption_highlight_color"] or c.get("highlight_color")
    c["color"] = res["caption_text_color"] or c.get("color")
    c["uppercase"] = res["caption_uppercase"]
    c["words_per_group"] = max(1, min(5, res["caption_words_per_screen"]))
    c["highlight_mode"] = res["highlight_mode"] if res["highlight_mode"] != "none" else "color"
    profile["hook"]["type"] = res["hook_type"]
    profile["why_it_works"] = res["why_it_works"]
    profile.setdefault("overlays", {})["emoji_per_min"] = 4 if res["uses_emoji"] else 0


def analyze_many(inputs: list[str], niche: str, progress: Callable[[float, str], None] | None = None) -> dict:
    progress = progress or (lambda f, m: None)
    dl_dir = config.WORK_DIR / "refs" / niche
    done, errors = [], []
    for k, item in enumerate(inputs):
        progress(k / max(1, len(inputs)), f"מנתח {k + 1}/{len(inputs)}")
        try:
            meta = {}
            path = item
            if URL_RE.match(item):
                path, meta = download(item, dl_dir)
            res = analyze_video(str(path), meta)
            res["profile"]["niche"] = niche
            rid = hashlib.sha1(str(item).encode()).hexdigest()[:12]
            library.save_ref(niche, res["profile"], rid)
            done.append({"input": item, "ref_id": rid, "hook": res["profile"]["hook"]["type"],
                         "avg_shot_sec": res["profile"]["pacing"]["avg_shot_sec"]})
        except Exception as e:  # keep going: one bad link must not stop the batch
            log.exception("analysis failed for %s", item)
            errors.append({"input": item, "error": str(e)[:300]})
    progress(1.0, "הסתיים")
    prof = library.load_profile(niche)
    return {"analyzed": done, "errors": errors, "profile": prof}

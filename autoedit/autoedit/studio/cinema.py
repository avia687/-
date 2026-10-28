"""Cinematic editing tools: music library by mood, beat grid, cut-on-beat timing, ending on a
downbeat, match-cut ordering, speed ramps."""
from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from .. import config

log = logging.getLogger(__name__)

AUDIO_EXT = (".mp3", ".wav", ".m4a", ".ogg", ".flac")
MOOD_WORDS = {
    "energetic": ["אנרגטי", "קצבי", "מהיר", "סוחף", "energetic", "upbeat", "hype", "fast", "dynamic"],
    "calm": ["רגוע", "שקט", "עדין", "calm", "chill", "soft", "relaxed"],
    "luxury": ["יוקרתי", "יוקרה", "אלגנטי", "luxury", "elegant", "premium"],
    "emotional": ["מרגש", "רגשי", "emotional", "inspiring", "מעורר השראה"],
    "fun": ["כיפי", "מצחיק", "שמח", "fun", "funny", "happy", "playful"],
}


def mood_from_text(text: str, default: str = "energetic") -> str:
    t = (text or "").lower()
    for mood, words in MOOD_WORDS.items():
        if any(w in t for w in words):
            return mood
    return default


@lru_cache(maxsize=64)
def analyze_track(path: str) -> dict:
    """BPM, beat times and energy of a music file (cached on disk next to the library)."""
    cache = Path(path).with_suffix(Path(path).suffix + ".beats.json")
    if cache.exists():
        return json.loads(cache.read_text())
    import librosa

    y, sr = librosa.load(path, sr=22050, mono=True, duration=240)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    bt = librosa.frames_to_time(beats, sr=sr).tolist()
    rms = librosa.feature.rms(y=y)[0]
    info = {"bpm": float(np.atleast_1d(tempo)[0]), "beats": [round(b, 3) for b in bt], "duration": len(y) / sr,
            "energy": float(np.mean(rms) / (np.max(rms) + 1e-9))}
    try:
        cache.write_text(json.dumps(info))
    except OSError:
        pass
    return info


def music_library() -> list[dict]:
    out = []
    for p in config.MUSIC_DIR.rglob("*"):
        if p.suffix.lower() not in AUDIO_EXT:
            continue
        name = p.stem.lower()
        tags = set(re.split(r"[_\-\s]+", name)) | {p.parent.name.lower()}
        m = re.search(r"(\d{2,3})\s*bpm", name)
        out.append({"path": str(p), "tags": sorted(tags), "bpm": float(m.group(1)) if m else None,
                    "generated": name.startswith("generated_")})
    return out


MOOD_BPM = {"energetic": 124, "calm": 88, "luxury": 96, "emotional": 84, "fun": 116}


def pick_music(niche: str, mood: str, avoid: list[str] | None = None) -> dict | None:
    lib = music_library()
    if not lib:
        return None
    target = MOOD_BPM.get(mood, 110)

    def score(t):
        s = 0.0
        s += 3 if mood in t["tags"] else 0
        s += 2 if niche in t["tags"] else 0
        s += 1.5 if not t["generated"] else 0  # prefer the user's real library over generated beds
        if t["bpm"]:
            s -= abs(t["bpm"] - target) / 20
        s -= 5 if avoid and t["path"] in avoid else 0
        return s

    return max(lib, key=score)


def beat_grid(beats: list[float], bpm: float, duration: float) -> np.ndarray:
    """Regular grid anchored on detected beats, extended to cover `duration`."""
    period = 60.0 / max(bpm, 40)
    if len(beats) < 4:
        return np.arange(0, duration + period, period)
    start = beats[0] % period
    return np.arange(start, duration + 2 * period, period)


def snap_durations(target_lengths: list[float], grid: np.ndarray, min_len: float = 0.6) -> list[float]:
    """Turn desired shot lengths into lengths whose cut points land on beats."""
    t, out = 0.0, []
    for L in target_lengths:
        want = t + L
        cands = grid[grid >= t + min_len]
        cut = float(cands[np.argmin(np.abs(cands - want))]) if len(cands) else want
        out.append(round(cut - t, 3))
        t = cut
    return out


def land_on_bar(total: float, grid: np.ndarray, beats_per_bar: int = 4) -> float:
    """Closest bar line to `total` so the video (and the music) end on a downbeat."""
    bars = grid[::beats_per_bar]
    if not len(bars):
        return total
    return float(bars[np.argmin(np.abs(bars - total))]) if np.min(np.abs(bars - total)) < 2.5 else total


# ------------------------------------------------------------------ match cuts
def edge_signature(frame: np.ndarray) -> np.ndarray:
    small = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 64))
    gx = cv2.Sobel(small, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(small, cv2.CV_32F, 0, 1)
    mag, ang = cv2.cartToPolar(gx, gy)
    hist = np.zeros((4, 4, 8), np.float32)
    for i in range(4):
        for j in range(4):
            m = mag[i * 16:(i + 1) * 16, j * 16:(j + 1) * 16].ravel()
            a = ang[i * 16:(i + 1) * 16, j * 16:(j + 1) * 16].ravel()
            hist[i, j] = np.histogram(a, bins=8, range=(0, 2 * np.pi), weights=m)[0]
    v = hist.ravel()
    return v / (np.linalg.norm(v) + 1e-6)


def match_order(shots: list[dict], first_fixed: bool = True) -> list[dict]:
    """Greedy ordering that puts visually rhyming shots (shape / composition) next to each other.
    Each shot needs 'sig_in' and 'sig_out' signatures."""
    if len(shots) < 3:
        return shots
    rest = shots[1:] if first_fixed else shots[:]
    order = [shots[0]] if first_fixed else [rest.pop(0)]
    while rest:
        last = order[-1]
        k = max(range(len(rest)), key=lambda i: float(np.dot(last["sig_out"], rest[i]["sig_in"])) - 0.02 * i)
        order.append(rest.pop(k))
    return order


# ------------------------------------------------------------------ speed ramps
def speed_ramp(clip: dict, peak_t: float, slow: float = 0.45, ramp_len: float = 0.5) -> list[dict]:
    """Split a clip into normal -> slow-motion around the peak -> normal."""
    a, b = clip["in"], clip["out"]
    s0 = max(a, peak_t - ramp_len / 2)
    s1 = min(b, peak_t + ramp_len / 2)
    parts = []
    if s0 - a > 0.25:
        parts.append({**clip, "in": a, "out": s0, "speed": 1.0})
    parts.append({**clip, "in": s0, "out": s1, "speed": slow, "slowmo": True})
    if b - s1 > 0.25:
        parts.append({**clip, "in": s1, "out": b, "speed": 1.15})
    for p in parts[1:]:
        p.pop("fade_in", None)
    return parts

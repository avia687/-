"""Remove silences, filler words, stutters and repetitions -> list of kept source ranges."""
from __future__ import annotations

import re

import numpy as np

FILLERS = {
    "en": {"um", "umm", "uh", "uhh", "uhm", "erm", "er", "ah", "hmm", "mm", "mhm"},
    "he": {"אמ", "אממ", "אמממ", "אה", "אהה", "אההה", "אהם", "הממ", "ממ", "אמם"},
}
# multi-word fillers that are removed only when standalone-ish (surrounded by pauses)
SOFT_FILLERS = {
    "en": {"like", "basically", "actually", "literally", "so"},
    "he": {"כאילו", "בעצם", "כזה", "סתם"},
}

_PUNCT = re.compile(r"[^\w֐-׿']+", re.UNICODE)


def norm(word: str) -> str:
    return _PUNCT.sub("", word.lower())


GREETINGS = [
    ["hey", "guys"], ["hi", "guys"], ["hey", "everyone"], ["hi", "everyone"], ["hello", "everyone"], ["what's", "up", "guys"],
    ["hey", "what's", "up"], ["welcome", "back"], ["hello", "guys"],
    ["היי", "חברים"], ["שלום", "לכולם"], ["היי", "לכולם"], ["שלום", "חברים"], ["מה", "קורה", "חברים"], ["אהלן", "חברים"], ["היי"], ["אהלן"],
]


def mark_words(words: list[dict], language: str) -> list[str | None]:
    """Return a removal reason per word (None = keep)."""
    lang = language if language in FILLERS else "en"
    n = len(words)
    reason: list[str | None] = [None] * n
    toks = [norm(w["text"]) for w in words]
    # never waste the opening on a greeting ("Hey guys", "שלום לכולם")
    for g in GREETINGS:
        if toks[: len(g)] == g and n > len(g) + 3 and words[len(g) - 1]["end"] < 3.0:
            for k in range(len(g)):
                reason[k] = "greeting"
            break

    for i, t in enumerate(toks):
        if not t:
            continue
        if t in FILLERS[lang] or t in FILLERS["en"]:
            reason[i] = "filler"
        elif t in SOFT_FILLERS.get(lang, set()):
            gap_before = words[i]["start"] - words[i - 1]["end"] if i else 1.0
            gap_after = words[i + 1]["start"] - words[i]["end"] if i + 1 < n else 1.0
            if gap_before > 0.25 and gap_after > 0.25:
                reason[i] = "filler"
        # stutter: "thr-" / partial word that prefixes the next word
        raw = words[i]["text"].strip()
        if i + 1 < n and (raw.endswith("-") or raw.endswith("—")) and toks[i + 1].startswith(t[:2]):
            reason[i] = "stutter"
        elif i + 1 < n and 1 <= len(t) <= 3 and len(toks[i + 1]) > len(t) + 1 and toks[i + 1].startswith(t) \
                and words[i + 1]["start"] - words[i]["end"] < 0.35 and t not in {"a", "i", "ה", "ו", "ב", "ל", "מ", "ש", "כ"}:
            reason[i] = "stutter"

    # repetitions: remove the first occurrence of an immediately repeated n-gram
    for size in range(10, 0, -1):
        i = 0
        while i + 2 * size <= n:
            a = [toks[k] for k in range(i, i + size)]
            b = [toks[k] for k in range(i + size, i + 2 * size)]
            if all(a) and a == b and all(reason[k] is None for k in range(i, i + 2 * size)):
                for k in range(i, i + size):
                    reason[k] = "repeat"
                i += size
            else:
                i += 1
    return reason


def build_segments(words: list[dict], reason: list[str | None], max_silence: float = 0.28,
                   pad_in: float = 0.06, pad_out: float = 0.12, duration: float | None = None,
                   audio: np.ndarray | None = None, sr: int = 16000) -> list[dict]:
    kept = [i for i, r in enumerate(reason) if r is None]
    if not kept:
        return []
    groups: list[list[int]] = [[kept[0]]]
    for prev, cur in zip(kept, kept[1:]):
        removed_between = cur != prev + 1
        gap = words[cur]["start"] - words[prev]["end"]
        if gap > max_silence or removed_between:
            groups.append([cur])
        else:
            groups[-1].append(cur)

    segs = []
    for g in groups:
        s = words[g[0]]["start"] - pad_in
        e = words[g[-1]]["end"] + pad_out
        # don't bleed into a removed neighbouring word
        if g[0] > 0:
            s = max(s, (words[g[0] - 1]["end"] + words[g[0]]["start"]) / 2)
        if g[-1] + 1 < len(words):
            e = min(e, (words[g[-1]]["end"] + words[g[-1] + 1]["start"]) / 2)
        if audio is not None:
            e = _extend_to_decay(audio, sr, e, limit=0.1)
        s = max(0.0, s)
        if duration:
            e = min(duration, e)
        segs.append({"start": round(s, 3), "end": round(e, 3), "words": g})
    # merge overlapping / touching segments
    merged = [segs[0]]
    for sg in segs[1:]:
        if sg["start"] <= merged[-1]["end"] + 0.04:
            merged[-1]["end"] = max(merged[-1]["end"], sg["end"])
            merged[-1]["words"] += sg["words"]
        else:
            merged.append(sg)
    return [s for s in merged if s["end"] - s["start"] > 0.12]


def _extend_to_decay(audio: np.ndarray, sr: int, t: float, limit: float) -> float:
    """Extend a cut point while the voice is still ringing out (avoid clipped word tails)."""
    i0 = int(t * sr)
    hop = int(0.01 * sr)
    ref = np.sqrt(np.mean(audio[max(0, i0 - 8 * hop):i0] ** 2) + 1e-12)
    for k in range(int(limit / 0.01)):
        a = i0 + k * hop
        frame = audio[a:a + hop]
        if frame.size == 0 or np.sqrt(np.mean(frame ** 2)) < ref * 0.18:
            return (a) / sr
    return t + limit


def clean(transcript: dict, profile: dict, duration: float, audio: np.ndarray | None = None) -> dict:
    words = transcript["words"]
    reason = mark_words(words, transcript.get("language", "en"))
    max_sil = float(profile.get("pacing", {}).get("max_silence", 0.28))
    segs = build_segments(words, reason, max_silence=max_sil, duration=duration, audio=audio)
    kept = sum(s["end"] - s["start"] for s in segs)
    stats = {
        "source_duration": round(duration, 2),
        "kept_duration": round(kept, 2),
        "removed_fillers": sum(r == "filler" for r in reason),
        "removed_stutters": sum(r == "stutter" for r in reason),
        "removed_repeats": sum(r == "repeat" for r in reason),
        "removed_greeting": sum(r == "greeting" for r in reason),
        "jump_cuts": max(0, len(segs) - 1),
    }
    return {"segments": segs, "removed": reason, "stats": stats}

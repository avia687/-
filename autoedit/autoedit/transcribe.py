"""Speech-to-text with word-level timestamps (faster-whisper)."""
from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

from . import config
from .media import load_audio

log = logging.getLogger(__name__)

HEBREW_RE = re.compile(r"[֐-׿]")

# Prompts that nudge Whisper toward verbatim output (keeps fillers so we can cut them)
VERBATIM_PROMPT = {
    "en": "Umm, uh, so, like, you know, I mean... okay.",
    "he": "אממ, אהה, כאילו, בעצם, יאללה, טוב...",
}


def is_rtl(text: str) -> bool:
    return bool(HEBREW_RE.search(text))


@lru_cache(maxsize=2)
def _model(name: str):
    from faster_whisper import WhisperModel

    device = config.WHISPER_DEVICE
    if device == "auto":
        try:
            import ctranslate2

            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            device = "cpu"
    compute = "float16" if device == "cuda" else "int8"
    log.info("loading whisper model %s on %s (%s)", name, device, compute)
    return WhisperModel(name, device=device, compute_type=compute)


def _detect_language(audio, model_name: str) -> str:
    model = _model(model_name)
    _, info = model.transcribe(audio[: 16000 * 30], beam_size=1, without_timestamps=True)
    return info.language


def transcribe(path: str | Path, language: str | None = None, model_name: str | None = None,
               cache_dir: Path | None = None) -> dict:
    """Return {"language", "words": [{text,start,end,prob}], "segments": [{text,start,end}]}."""
    cache = None
    if cache_dir:
        cache = Path(cache_dir) / "transcript.json"
        if cache.exists():
            return json.loads(cache.read_text(encoding="utf-8"))

    audio = load_audio(path)
    if audio.size == 0:
        return {"language": language or "en", "words": [], "segments": []}
    name = model_name or config.WHISPER_MODEL
    if language is None:
        language = _detect_language(audio, name)
    if language == "he" and not model_name and config.WHISPER_MODEL_HE:
        name = config.WHISPER_MODEL_HE
    try:
        model = _model(name)
    except Exception as e:  # e.g. Hebrew fine-tune unavailable offline -> fall back to base model
        log.warning("model %s unavailable (%s), falling back to %s", name, e, config.WHISPER_MODEL)
        model = _model(model_name or config.WHISPER_MODEL)

    segments, info = model.transcribe(
        audio,
        language=language,
        word_timestamps=True,
        beam_size=5,
        vad_filter=False,  # we want exact pauses; silence cutting is done by us
        condition_on_previous_text=False,
        initial_prompt=VERBATIM_PROMPT.get(language),
    )
    words, segs = [], []
    for s in segments:
        segs.append({"text": s.text.strip(), "start": float(s.start), "end": float(s.end)})
        for w in s.words or []:
            t = w.word.strip()
            if not t:
                continue
            words.append({"text": t, "start": float(w.start), "end": float(w.end), "prob": float(w.probability)})
    # repair zero/negative-length words
    for i, w in enumerate(words):
        if w["end"] <= w["start"]:
            nxt = words[i + 1]["start"] if i + 1 < len(words) else w["start"] + 0.2
            w["end"] = max(w["start"] + 0.05, min(nxt, w["start"] + 0.4))
    result = {"language": info.language, "words": words, "segments": segs}
    if cache:
        cache.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result

"""Voice-over: Claude writes the script, then TTS with the best available engine:
  ElevenLabs (natural voice, optional cloning from a sample of your voice; needs ELEVENLABS_API_KEY)
  -> MMS-TTS (facebook/mms-tts-heb / -eng, free, local, needs `transformers` + torch)
  -> Piper (local, English voices) -> espeak-ng (robotic; used only when explicitly requested).
The narration is then transcribed for exact word timings (captions)."""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path

import requests

from .. import config, db, llm

log = logging.getLogger(__name__)

SCRIPT_SCHEMA = {
    "type": "object",
    "properties": {"lines": {"type": "array", "items": {"type": "string"}}, "title": {"type": "string"},
                   "cta": {"type": "string"}},
    "required": ["lines", "title", "cta"],
    "additionalProperties": False,
}

TEMPLATES = {
    "realestate": {"he": ["תראו את המקום הזה.", "מרווח, מואר ומעוצב עד הפרט האחרון.", "כל חדר כאן מספר סיפור.",
                          "מיקום מושלם, נוף שלא נמאס.", "רוצים לראות אותו מקרוב? שלחו הודעה עכשיו."],
                   "en": ["Look at this place.", "Bright, spacious and designed down to the last detail.",
                          "Every room tells a story.", "Perfect location, a view you never get tired of.",
                          "Want to see it in person? Send me a message now."]},
    "food": {"he": ["המתכון הזה ישגע אתכם.", "מעט מרכיבים, המון טעם.", "הסוד הוא בפרטים הקטנים.", "שמרו את המתכון לפעם הבאה."],
             "en": ["This recipe will blow your mind.", "Few ingredients, tons of flavor.", "The secret is in the details.",
                    "Save this recipe for later."]},
    "fitness": {"he": ["ככה נראית התמדה.", "כל אימון מקרב אתכם למטרה.", "בלי תירוצים.", "שמרו לאימון הבא."],
                "en": ["This is what consistency looks like.", "Every workout gets you closer.", "No excuses.",
                       "Save this for your next workout."]},
    "business": {"he": ["כך בונים עסק שעובד.", "צעד אחרי צעד.", "התוצאות מדברות בעד עצמן.", "עקבו לעוד תובנות."],
                 "en": ["This is how you build a business that works.", "Step by step.", "The results speak for themselves.",
                        "Follow for more insights."]},
}


def write_script(brief: str, niche: str, language: str, shots: list[dict], duration: float) -> dict:
    words_budget = int(duration * (2.4 if language == "he" else 2.6))
    if llm.available():
        desc = "\n".join(f"- shot {i}: {s.get('desc', s.get('name', ''))} ({s.get('dur', 2):.1f}s)" for i, s in enumerate(shots))
        res = llm.ask_json(
            "You are a top short-form scriptwriter. Write tight voice-over that matches the visuals and sells.",
            f"Brief: {brief!r}. Niche: {niche}. Language: {'Hebrew' if language == 'he' else 'English'}.\n"
            f"Video length {duration:.0f}s (~{words_budget} words total). Shots in order:\n{desc}\n"
            "Return one short line per beat of the story (hook line first, CTA last), a punchy on-screen title, and a CTA.",
            SCRIPT_SCHEMA, effort="medium")
        if res and res.get("lines"):
            return res
    t = TEMPLATES.get(niche, TEMPLATES["business"])[language if language in ("he", "en") else "en"]
    return {"lines": t, "title": t[0].rstrip("."), "cta": t[-1]}


def _elevenlabs(text: str, out: Path, language: str, voice_id: str | None) -> bool:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return False
    vid = voice_id or db.get_pref("elevenlabs_voice_id") or os.environ.get("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
    model = "eleven_v3" if language == "he" else "eleven_multilingual_v2"
    try:
        r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}", headers={"xi-api-key": key},
                          json={"text": text, "model_id": model, "voice_settings": {"stability": 0.45, "similarity_boost": 0.8}},
                          timeout=120)
        if r.status_code != 200:
            log.warning("ElevenLabs %s: %s", r.status_code, r.text[:200])
            return False
        mp3 = out.with_suffix(".mp3")
        mp3.write_bytes(r.content)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-ar", "48000", "-ac", "1", str(out)], check=True)
        return True
    except Exception as e:
        log.warning("ElevenLabs failed: %s", e)
        return False


def clone_voice(sample: str, name: str = "My voice") -> str | None:
    """Create an ElevenLabs instant voice clone from a recording of the user; remembered for next time."""
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return None
    with open(sample, "rb") as f:
        r = requests.post("https://api.elevenlabs.io/v1/voices/add", headers={"xi-api-key": key},
                          data={"name": name}, files={"files": (Path(sample).name, f)}, timeout=180)
    if r.ok:
        vid = r.json().get("voice_id")
        db.set_pref("elevenlabs_voice_id", vid)
        return vid
    log.warning("voice clone failed: %s", r.text[:300])
    return None


def _mms(text: str, out: Path, language: str) -> bool:
    try:
        import torch
        from transformers import AutoTokenizer, VitsModel
    except Exception:
        return False
    try:
        name = {"he": "facebook/mms-tts-heb", "en": "facebook/mms-tts-eng"}.get(language, "facebook/mms-tts-eng")
        model, tok = VitsModel.from_pretrained(name), AutoTokenizer.from_pretrained(name)
        with torch.no_grad():
            wav = model(**tok(text, return_tensors="pt")).waveform[0].numpy()
        from ..media import write_wav

        write_wav(out, wav, model.config.sampling_rate)
        return True
    except Exception as e:
        log.warning("MMS-TTS failed: %s", e)
        return False


def _piper(text: str, out: Path, language: str) -> bool:
    model = next(iter(sorted((config.MODELS_DIR / "piper").glob(f"{language}*.onnx"))), None) if (config.MODELS_DIR / "piper").exists() else None
    if not shutil.which("piper") or model is None:
        return False
    try:
        subprocess.run(["piper", "--model", str(model), "--output_file", str(out)], input=text.encode(), check=True,
                       capture_output=True, timeout=300)
        return True
    except Exception as e:
        log.warning("piper failed: %s", e)
        return False


def _espeak(text: str, out: Path, language: str) -> bool:
    if not shutil.which("espeak-ng"):
        return False
    voice = "he" if language == "he" else "en-us+m3"
    subprocess.run(["espeak-ng", "-v", voice, "-s", "160", "-w", str(out), text], check=True)
    return True


def synthesize(lines: list[str], out: Path, language: str, allow_robotic: bool = False,
               voice_id: str | None = None) -> dict | None:
    """Speak the script; returns {"path", "engine", "words": [...]} or None if no acceptable engine."""
    text = " ".join(lines)
    raw = out.with_name(out.stem + "_raw.wav")
    engine = None
    for name, fn in (("elevenlabs", lambda: _elevenlabs(text, raw, language, voice_id)), ("mms", lambda: _mms(text, raw, language)),
                     ("piper", lambda: _piper(text, raw, language))):
        if fn():
            engine = name
            break
    if engine is None and allow_robotic and _espeak(text, raw, language):
        engine = "espeak"
    if engine is None:
        return None
    # broadcast-style voice polish
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af",
                    "highpass=f=70,acompressor=threshold=-20dB:ratio=3:makeup=3,equalizer=f=3000:t=q:w=1:g=2,"
                    "apad=pad_dur=0.3", "-ar", "48000", "-ac", "1", str(out)], check=True)
    from ..transcribe import transcribe

    tr = transcribe(out, language=language)
    return {"path": str(out), "engine": engine, "words": tr["words"], "language": language,
            "script": lines}

"""Voice cleanup, SFX track, music bed with sidechain ducking, loudness mastering."""
from __future__ import annotations

import logging
import random
from pathlib import Path

import numpy as np

from . import config
from .media import load_audio, run, write_wav

log = logging.getLogger(__name__)
SR = 48000

VOICE_CHAIN = (
    "highpass=f=80,lowpass=f=15000,"
    "afftdn=nr=14:nf=-42:tn=1,"            # spectral denoise with noise tracking
    "deesser=i=0.35,"
    "acompressor=threshold=-21dB:ratio=3:attack=8:release=120:makeup=4,"
    "equalizer=f=3200:t=q:w=1.2:g=2.5,"    # presence lift for intelligibility on phone speakers
    "alimiter=limit=0.95"
)


def clean_voice(src: str | Path, out: str | Path, denoise: bool = True) -> Path:
    chain = VOICE_CHAIN if denoise else "highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:makeup=3"
    run(["ffmpeg", "-i", str(src), "-vn", "-af", chain, "-ar", str(SR), "-ac", "1", str(out)])
    return Path(out)


def speech_energy(path: str | Path, hop: float = 0.1) -> list[float]:
    """Normalized RMS envelope at 10 Hz (drives caption animation intensity)."""
    a = load_audio(path, 16000)
    n = int(16000 * hop)
    if a.size < n:
        return [0.5]
    frames = a[: a.size // n * n].reshape(-1, n)
    rms = np.sqrt((frames ** 2).mean(1))
    hi = np.percentile(rms, 95) + 1e-6
    return np.clip(rms / hi, 0, 1).round(3).tolist()


def build_sfx_track(events: list[dict], duration: float, out: str | Path) -> Path | None:
    """events: [{t, type, gain_db}] -> mono wav."""
    import soundfile as sf

    if not events:
        return None
    track = np.zeros(int(duration * SR) + SR, np.float32)
    cache: dict[str, np.ndarray] = {}
    for e in events:
        name = e["type"]
        p = config.SFX_DIR / f"{name}.wav"
        if not p.exists():
            continue
        if name not in cache:
            a, sr = sf.read(str(p), dtype="float32")
            if a.ndim > 1:
                a = a.mean(1)
            if sr != SR:
                import librosa

                a = librosa.resample(a, orig_sr=sr, target_sr=SR)
            cache[name] = a
        a = cache[name] * (10 ** (e.get("gain_db", -10) / 20))
        # whooshes/risers are centred on (or end at) the cut, not started at it
        lead = {"whoosh": 0.22, "riser": len(a) / SR - 0.05}.get(name, 0.0)
        s = int(max(0.0, e["t"] - lead) * SR)
        end = min(track.size, s + a.size)
        track[s:end] += a[: end - s]
    track = track[: int(duration * SR)]
    write_wav(out, track, SR)
    return Path(out)


def pick_music(niche: str, bpm_target: float | None = None, explicit: str | None = None) -> Path | None:
    if explicit:
        return Path(explicit) if Path(explicit).exists() else None
    d = config.MUSIC_DIR / niche
    files = [p for p in d.glob("*") if p.suffix.lower() in (".mp3", ".wav", ".m4a", ".ogg", ".flac")] if d.exists() else []
    if not files:
        files = [p for p in config.MUSIC_DIR.rglob("*") if p.suffix.lower() in (".mp3", ".wav", ".m4a", ".ogg", ".flac")]
    if not files:
        return None
    user = [p for p in files if not p.name.startswith("generated_")]
    pool = user or files
    if bpm_target:
        def bpm_of(p: Path) -> float:
            import re

            m = re.search(r"(\d{2,3})\s*bpm", p.name.lower())
            return float(m.group(1)) if m else bpm_target
        pool.sort(key=lambda p: abs(bpm_of(p) - bpm_target))
        return pool[0]
    return random.choice(pool)


def prepare_music(path: Path, duration: float, out: str | Path, volume_db: float = -19) -> Path:
    """Loop/trim to length, fade in/out so the music ends exactly with the video."""
    fade_out = min(2.0, duration / 4)
    run(["ffmpeg", "-stream_loop", "-1", "-i", str(path), "-t", f"{duration:.3f}", "-af",
         f"afade=t=in:d=0.4,afade=t=out:st={max(0, duration - fade_out):.3f}:d={fade_out:.3f},volume={volume_db}dB",
         "-ar", str(SR), "-ac", "2", str(out)])
    return Path(out)


def mix_filter(has_music: bool, has_sfx: bool, lufs: float, duck_db: float = -11,
               voice_idx: int = 1, music_idx: int = 2, sfx_idx: int = 3) -> tuple[str, str]:
    """ffmpeg filter_complex fragment producing [aout]. Music is ducked under the voice."""
    parts = [f"[{voice_idx}:a]aformat=sample_rates={SR}:channel_layouts=stereo,asplit=2[vo][vsc]"]
    mix_inputs = ["[vo]"]
    if has_music:
        ratio = float(np.clip(abs(duck_db) / 1.5, 3, 20))
        parts.append(f"[{music_idx}:a]aformat=sample_rates={SR}:channel_layouts=stereo[mu]")
        parts.append(f"[mu][vsc]sidechaincompress=threshold=0.02:ratio={ratio:.1f}:attack=15:release=400:makeup=1[duck]")
        mix_inputs.append("[duck]")
    else:
        parts.append("[vsc]anullsink")
    if has_sfx:
        parts.append(f"[{sfx_idx}:a]aformat=sample_rates={SR}:channel_layouts=stereo[sfx]")
        mix_inputs.append("[sfx]")
    parts.append(f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:normalize=0:duration=first,"
                 f"loudnorm=I={lufs}:TP=-1.5:LRA=11,aresample={SR}[aout]")
    return ";".join(parts), "[aout]"

"""Download / generate all static assets: fonts, LUTs, SFX, music beds, ML models.

Run once via setup.sh (`python -m autoedit.assets_setup`). Everything is free/open:
fonts are OFL (Google Fonts), LUTs/SFX/music are synthesized locally.
"""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

import numpy as np

from . import config
from .media import write_wav

FONT_SOURCES = {
    # family file -> (raw URL, [(weight, family name to expose to libass)])
    "Heebo": ("https://raw.githubusercontent.com/google/fonts/main/ofl/heebo/Heebo%5Bwght%5D.ttf",
              [(900, "Heebo Black"), (800, "Heebo ExtraBold"), (500, "Heebo Medium")]),
    "Rubik": ("https://raw.githubusercontent.com/google/fonts/main/ofl/rubik/Rubik%5Bwght%5D.ttf",
              [(800, "Rubik ExtraBold"), (600, "Rubik SemiBold")]),
    "Montserrat": ("https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf",
                   [(900, "Montserrat Black"), (800, "Montserrat ExtraBold")]),
    "Assistant": ("https://raw.githubusercontent.com/google/fonts/main/ofl/assistant/Assistant%5Bwght%5D.ttf",
                  [(800, "Assistant ExtraBold")]),
}

MP_MODELS = {
    "blaze_face_short_range.tflite": "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
    "selfie_segmenter.tflite": "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
    "face_landmarker.task": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
    "selfie_multiclass_256x256.tflite": "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite",
}


def _download(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        tmp = dest.with_suffix(dest.suffix + ".part")
        with urllib.request.urlopen(url, timeout=60) as r, open(tmp, "wb") as f:
            f.write(r.read())
        tmp.rename(dest)
        return True
    except Exception as e:  # network-restricted machines still get a working system
        print(f"  ! could not download {url}: {e}", file=sys.stderr)
        return False


# ---------------------------------------------------------------- fonts
def setup_fonts() -> None:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    src_dir = config.FONTS_DIR / "variable"
    src_dir.mkdir(parents=True, exist_ok=True)
    for fam, (url, instances) in FONT_SOURCES.items():
        var_path = src_dir / f"{fam}-VF.ttf"
        if not _download(url, var_path):
            continue
        for weight, name in instances:
            out = config.FONTS_DIR / f"{name.replace(' ', '')}.ttf"
            if out.exists():
                continue
            font = TTFont(str(var_path))
            static = instancer.instantiateVariableFont(font, {"wght": weight})
            nt = static["name"]
            for rec in list(nt.names):
                if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22):
                    nt.removeNames(nameID=rec.nameID)
            ps = name.replace(" ", "")
            for nid, val in ((1, name), (2, "Regular"), (3, ps), (4, name), (6, ps)):
                nt.setName(val, nid, 3, 1, 0x409)
                nt.setName(val, nid, 1, 0, 0)
            static["OS/2"].usWeightClass = 400
            static["OS/2"].fsSelection = (static["OS/2"].fsSelection & ~0b100001) | 0b1000000
            static["head"].macStyle = 0
            static.save(str(out))
            print(f"  font: {name}")


# ---------------------------------------------------------------- LUTs
def _lut_apply(look: str, rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b

    def scurve(x, k):
        return np.clip(x + k * (x - 0.5) * (1 - np.abs(2 * x - 1)) * 1.0, 0, 1)

    def sat(c, s):
        l = (0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2])[..., None]
        return np.clip(l + (c - l) * s, 0, 1)

    out = rgb.copy()
    if look == "punchy":  # fitness: contrasty, teal shadows / warm highlights
        out = scurve(out, 0.32)
        shadow = (1 - luma)[..., None] ** 2
        high = luma[..., None] ** 2
        out = out + shadow * np.array([-0.02, 0.008, 0.03]) + high * np.array([0.03, 0.01, -0.02])
        out = sat(np.clip(out, 0, 1), 1.08)
    elif look == "warm":  # food: warm, juicy, saturated
        out = out + np.array([0.03, 0.01, -0.025])
        out = scurve(np.clip(out, 0, 1), 0.22)
        out = sat(out, 1.15)
    elif look == "bright_clean":  # real estate: airy, bright, neutral-cool whites
        out = np.clip(out * 1.06 + 0.025, 0, 1) ** 0.92
        out = out + (luma[..., None] ** 3) * np.array([-0.01, 0.0, 0.02])
        out = sat(np.clip(out, 0, 1), 1.10)
    elif look == "cinematic":  # business: clean teal-orange, controlled saturation
        out = scurve(out, 0.25)
        shadow = (1 - luma)[..., None] ** 2
        high = luma[..., None] ** 2
        out = out + shadow * np.array([-0.02, 0.012, 0.03]) + high * np.array([0.03, 0.01, -0.02])
        out = sat(np.clip(out, 0, 1), 0.97)
    elif look == "neutral":
        out = scurve(out, 0.15)
    return np.clip(out, 0, 1)


LOOKS = ["punchy", "warm", "bright_clean", "cinematic", "neutral"]


def write_cube(look: str, path: Path, size: int = 33) -> None:
    grid = np.linspace(0, 1, size)
    b, g, r = np.meshgrid(grid, grid, grid, indexing="ij")  # .cube: red fastest
    rgb = np.stack([r, g, b], -1).reshape(-1, 3)
    out = _lut_apply(look, rgb)
    with open(path, "w") as f:
        f.write(f'TITLE "{look}"\nLUT_3D_SIZE {size}\n')
        for row in out:
            f.write(f"{row[0]:.6f} {row[1]:.6f} {row[2]:.6f}\n")


def setup_luts() -> None:
    for look in LOOKS:
        p = config.LUTS_DIR / f"{look}.cube"
        if not p.exists():
            write_cube(look, p)
    print("  luts: " + ", ".join(LOOKS))


# ---------------------------------------------------------------- SFX
SR = 44100


def _env(n, attack, release):
    e = np.ones(n)
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.exp(-np.linspace(0, 6, r))
    return e


def _bandpass_sweep(noise, f0, f1):
    from scipy.signal import butter, sosfilt

    n = len(noise)
    out = np.zeros(n)
    chunks = 24
    for i in range(chunks):
        a, b = i * n // chunks, (i + 1) * n // chunks
        fc = f0 * (f1 / f0) ** (i / (chunks - 1))
        sos = butter(2, [max(40, fc * 0.6), min(SR / 2 - 100, fc * 1.6)], btype="band", fs=SR, output="sos")
        out[a:b] = sosfilt(sos, noise[max(0, a - 2048):b])[-(b - a):]
    return out


def synth_sfx() -> dict[str, np.ndarray]:
    rng = np.random.default_rng(7)
    t = lambda d: np.arange(int(d * SR)) / SR
    sfx = {}
    # whoosh: band-passed noise sweeping up then down, swelling envelope
    n = int(0.55 * SR)
    noise = rng.standard_normal(n)
    sweep = _bandpass_sweep(noise, 300, 4500)
    env = np.sin(np.linspace(0, np.pi, n)) ** 1.6
    sfx["whoosh"] = sweep * env
    # pop: fast pitch-dropping sine + click
    tt = t(0.13)
    freq = 900 * np.exp(-tt * 28) + 180
    sfx["pop"] = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-tt * 38)
    sfx["pop"][:60] += rng.standard_normal(60) * 0.5
    # ding: bell partials with long decay
    tt = t(1.4)
    ding = sum(a * np.sin(2 * np.pi * f * tt) * np.exp(-tt * d) for f, a, d in
               [(1318.5, 1.0, 3.2), (2637, 0.35, 5), (3951, 0.18, 7), (1976, 0.22, 4)])
    sfx["ding"] = ding * _env(len(tt), 0.002, 0.3)
    # click / tick for text pops
    tt = t(0.04)
    sfx["click"] = np.sin(2 * np.pi * 2400 * tt) * np.exp(-tt * 150)
    # impact / boom for hooks
    tt = t(0.9)
    sfx["impact"] = (np.sin(2 * np.pi * (55 + 60 * np.exp(-tt * 9)) * tt) * np.exp(-tt * 4.5)
                     + rng.standard_normal(len(tt)) * np.exp(-tt * 30) * 0.4)
    # riser: rising noise into a cut
    n = int(1.2 * SR)
    sfx["riser"] = _bandpass_sweep(rng.standard_normal(n), 200, 7000) * np.linspace(0, 1, n) ** 2.5
    for k, v in sfx.items():
        sfx[k] = v / (np.max(np.abs(v)) + 1e-9) * 0.9
    return sfx


def setup_sfx() -> None:
    for name, audio in synth_sfx().items():
        p = config.SFX_DIR / f"{name}.wav"
        if not p.exists():
            write_wav(p, audio, SR)
    print("  sfx: whoosh, pop, ding, click, impact, riser")


# ---------------------------------------------------------------- music
MOODS = {
    "fitness": dict(scale=[0, 3, 7, 10], prog=[0, 8, 3, 10], drive=1.0, bright=0.8),
    "business": dict(scale=[0, 4, 7, 11], prog=[0, 9, 5, 7], drive=0.6, bright=0.6),
    "food": dict(scale=[0, 4, 7, 9], prog=[0, 5, 9, 7], drive=0.7, bright=0.9),
    "realestate": dict(scale=[0, 4, 7, 11], prog=[0, 5, 9, 4], drive=0.45, bright=0.7),
    "default": dict(scale=[0, 4, 7, 11], prog=[0, 5, 9, 7], drive=0.6, bright=0.7),
}


def generate_music(bpm: float, seconds: float, mood: str = "default", seed: int = 1) -> np.ndarray:
    """Procedural royalty-free background bed: kick, hats, bass, pad, pluck arp."""
    m = MOODS.get(mood, MOODS["default"])
    rng = np.random.default_rng(seed)
    beat = 60.0 / bpm
    n = int(seconds * SR)
    out = np.zeros(n)
    root = 45  # A2
    hz = lambda midi: 440 * 2 ** ((midi - 69) / 12)

    def add(sig, start):
        s = int(start * SR)
        if s >= n:
            return
        e = min(n, s + len(sig))
        out[s:e] += sig[: e - s]

    kick_t = np.arange(int(0.35 * SR)) / SR
    kick = np.sin(2 * np.pi * (45 + 90 * np.exp(-kick_t * 30)) * kick_t) * np.exp(-kick_t * 9)
    hat_n = int(0.05 * SR)
    from scipy.signal import butter, sosfilt

    hat = sosfilt(butter(4, 7000, "hp", fs=SR, output="sos"), rng.standard_normal(hat_n)) * np.exp(-np.arange(hat_n) / SR * 90)
    beats = int(seconds / beat) + 1
    bar_beats = 4
    for i in range(beats):
        t0 = i * beat
        chord_root = root + m["prog"][(i // (bar_beats * 2)) % len(m["prog"])]
        if m["drive"] > 0.5 or i % 2 == 0:
            add(kick * 0.9 * m["drive"], t0)
        add(hat * 0.25, t0 + beat / 2)
        if m["drive"] > 0.8:
            add(hat * 0.12, t0 + beat / 4 * 3)
        # bass on the beat
        bt = np.arange(int(beat * 0.9 * SR)) / SR
        bass = np.sin(2 * np.pi * hz(chord_root) * bt) + 0.3 * np.sin(2 * np.pi * hz(chord_root) * 2 * bt)
        add(bass * np.exp(-bt * 3) * 0.35, t0)
        # pluck arp on 8ths
        for k in range(2):
            note = chord_root + 12 + m["scale"][(i * 2 + k) % len(m["scale"])]
            pt = np.arange(int(beat / 2 * SR)) / SR
            pl = sum(np.sin(2 * np.pi * hz(note) * h * pt) / h for h in (1, 2, 3)) * np.exp(-pt * 8)
            add(pl * 0.12 * m["bright"], t0 + k * beat / 2)
        # pad, one per bar
        if i % bar_beats == 0:
            pd = np.arange(int(beat * bar_beats * SR)) / SR
            pad = sum(np.sin(2 * np.pi * hz(chord_root + 12 + iv) * pd + rng.random()) for iv in m["scale"][:3])
            pad *= np.minimum(1, pd / 0.4) * np.minimum(1, (pd[-1] - pd) / 0.4 + 1e-3)
            add(pad * 0.05, t0)
    out = np.tanh(out * 1.2)
    fade = int(1.5 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)
    return out / (np.max(np.abs(out)) + 1e-9) * 0.8


def setup_music() -> None:
    for niche, bpm in (("fitness", 124), ("business", 100), ("food", 110), ("realestate", 92)):
        d = config.MUSIC_DIR / niche
        d.mkdir(parents=True, exist_ok=True)
        p = d / f"generated_{bpm}bpm.wav"
        if not p.exists():
            write_wav(p, generate_music(bpm, 95, niche), SR)
    print("  music beds: fitness, business, food, realestate")


def setup_models() -> None:
    for name, url in MP_MODELS.items():
        _download(url, config.MODELS_DIR / name)
    print("  mediapipe models ready")


OPTIONAL_MODELS = {
    # 2.5D parallax depth (MIT-licensed small model, ONNX)
    "depth_anything_v2_small.onnx": "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx",
}


def setup_optional() -> None:
    for name, url in OPTIONAL_MODELS.items():
        ok = _download(url, config.MODELS_DIR / name)
        print(f"  {'✓' if ok else '✗'} {name}")
    try:  # pre-download Whisper so the first edit doesn't wait
        from faster_whisper import WhisperModel

        WhisperModel(config.WHISPER_MODEL, device="cpu", compute_type="int8")
        print(f"  ✓ whisper {config.WHISPER_MODEL}")
        if config.WHISPER_MODEL_HE:
            WhisperModel(config.WHISPER_MODEL_HE, device="cpu", compute_type="int8")
            print(f"  ✓ whisper {config.WHISPER_MODEL_HE}")
    except Exception as e:
        print(f"  ! whisper pre-download skipped: {e}")


def main() -> None:
    config.ensure_dirs()
    print("[assets] fonts");  setup_fonts()
    print("[assets] luts");   setup_luts()
    print("[assets] sfx");    setup_sfx()
    print("[assets] music");  setup_music()
    print("[assets] models"); setup_models()
    from .profiles_default import write_default_profiles
    write_default_profiles()
    if "--full" in sys.argv:
        print("[assets] optional models"); setup_optional()
    print("[assets] done")


if __name__ == "__main__":
    main()

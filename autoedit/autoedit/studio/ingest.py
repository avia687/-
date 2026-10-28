"""Ingest a pile of raw media (photos, videos, voice recordings) of any format and analyze every item.

Handles: iPhone HEIC/HEIF, HDR (PQ/HLG -> SDR tonemap at decode), vertical/horizontal, rotation metadata,
60/120 fps & VFR (resampled at decode), large files (streamed, never loaded whole).
Per-item analysis (cached by content key): technical quality (sharpness, exposure, noise, shake),
emotion (faces, smile/surprise blendshapes, audio energy), speech presence, scenes, subject position.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from .. import config
from ..media import probe, run
from ..pipeline import file_key

log = logging.getLogger(__name__)

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp", ".tif", ".tiff", ".avif"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts", ".m2ts", ".3gp", ".hevc"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus", ".amr"}


def kind_of(path: Path) -> str | None:
    e = path.suffix.lower()
    if e in IMAGE_EXT:
        return "image"
    if e in VIDEO_EXT:
        return "video"
    if e in AUDIO_EXT:
        return "audio"
    return None


def expand(inputs: list[str | Path]) -> list[Path]:
    out = []
    for i in inputs:
        p = Path(i)
        if p.is_dir():
            out += sorted(q for q in p.rglob("*") if q.is_file() and kind_of(q) and not q.name.startswith("."))
        elif p.is_file() and kind_of(p):
            out.append(p)
    return out


def normalize_image(path: Path, cache: Path) -> Path:
    """HEIC/AVIF/huge images -> oriented sRGB JPEG (<= 4096 px)."""
    from PIL import Image, ImageOps

    try:
        import pillow_heif

        pillow_heif.register_heif_opener()
    except ImportError:
        pass
    out = cache / "image.jpg"
    if out.exists():
        return out
    im = Image.open(path)
    im = ImageOps.exif_transpose(im).convert("RGB")
    im.thumbnail((4096, 4096))
    im.save(out, quality=95)
    return out


def video_color_info(path: Path) -> dict:
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
               "stream=color_transfer,color_primaries,pix_fmt,r_frame_rate,avg_frame_rate", "-of", "json", str(path)]).stdout
    s = (json.loads(out).get("streams") or [{}])[0]
    hdr = s.get("color_transfer") in ("smpte2084", "arib-std-b67")
    r, a = s.get("r_frame_rate", "30/1"), s.get("avg_frame_rate", "30/1")
    return {"hdr": hdr, "transfer": s.get("color_transfer"), "vfr": r != a, "pix_fmt": s.get("pix_fmt")}


HDR_TONEMAP = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,"
               "zscale=t=bt709:m=bt709:r=tv,format=yuv420p")


# ------------------------------------------------------------------ quality metrics
def sharpness(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def exposure(gray: np.ndarray) -> dict:
    return {"mean": float(gray.mean() / 255), "clip_hi": float((gray > 250).mean()), "clip_lo": float((gray < 5).mean())}


def noise_level(gray: np.ndarray) -> float:
    # robust noise sigma (Immerkaer) on a downscaled frame
    k = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], np.float32)
    g = cv2.resize(gray, (min(640, gray.shape[1]), int(min(640, gray.shape[1]) * gray.shape[0] / gray.shape[1]))).astype(np.float32)
    conv = cv2.filter2D(g, -1, k)
    return float(np.sqrt(np.pi / 2) * np.abs(conv).mean() / 6)


def colorfulness(bgr: np.ndarray) -> float:
    b, g, r = cv2.split(bgr.astype(np.float32))
    rg, yb = r - g, 0.5 * (r + g) - b
    return float(np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2))


@lru_cache(maxsize=1)
def _landmarker():
    model = config.MODELS_DIR / "face_landmarker.task"
    if not model.exists():
        return None
    try:
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision

        opts = vision.FaceLandmarkerOptions(base_options=mp_python.BaseOptions(model_asset_path=str(model)),
                                            output_face_blendshapes=True, num_faces=3)
        return vision.FaceLandmarker.create_from_options(opts)
    except Exception as e:
        log.warning("face landmarker unavailable: %s", e)
        return None


def faces_and_emotion(bgr: np.ndarray) -> dict:
    """Faces, their positions and expression intensity (smile / surprise / jaw-open energy)."""
    lm = _landmarker()
    if lm is None:
        from ..reframe import detect_faces

        f = detect_faces(bgr)
        return {"faces": len(f), "boxes": [list(map(float, x[:3])) for x in f], "smile": 0.0, "surprise": 0.0, "expressive": 0.0}
    import mediapipe as mp

    h, w = bgr.shape[:2]
    s = 640 / max(h, w)
    small = cv2.resize(bgr, (int(w * s), int(h * s))) if s < 1 else bgr
    res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(small, cv2.COLOR_BGR2RGB)))
    boxes, smile, surprise, jaw = [], 0.0, 0.0, 0.0
    for k, pts in enumerate(res.face_landmarks or []):
        xs, ys = [p.x for p in pts], [p.y for p in pts]
        boxes.append([float((min(xs) + max(xs)) / 2), float((min(ys) + max(ys)) / 2), float(max(max(xs) - min(xs), max(ys) - min(ys)))])
        if res.face_blendshapes and k < len(res.face_blendshapes):
            bs = {c.category_name: c.score for c in res.face_blendshapes[k]}
            smile = max(smile, (bs.get("mouthSmileLeft", 0) + bs.get("mouthSmileRight", 0)) / 2)
            surprise = max(surprise, (bs.get("browInnerUp", 0) + bs.get("eyeWideLeft", 0) + bs.get("eyeWideRight", 0)) / 3)
            jaw = max(jaw, bs.get("jawOpen", 0))
    return {"faces": len(boxes), "boxes": boxes, "smile": round(smile, 3), "surprise": round(surprise, 3),
            "expressive": round(max(smile, surprise, jaw * 0.7), 3)}


def saliency_center(bgr: np.ndarray) -> tuple[float, float]:
    from ..reframe import _saliency_center

    return _saliency_center(bgr)


def quality_score(sharp: float, exp: dict, noise: float, shake: float = 0.0) -> float:
    """0..1 technical quality."""
    s = min(1.0, np.log1p(sharp) / np.log1p(400))
    e = 1.0 - min(1.0, abs(exp["mean"] - 0.47) * 2.2) - 2 * exp["clip_hi"] - 1.5 * exp["clip_lo"]
    n = 1.0 - min(1.0, noise / 12)
    st = 1.0 - min(1.0, shake / 6)
    return float(np.clip(0.4 * s + 0.3 * max(0, e) + 0.15 * n + 0.15 * st, 0, 1))


# ------------------------------------------------------------------ per-item analysis
def analyze_image(path: Path) -> dict:
    img = cv2.imread(str(path))
    if img is None:
        raise ValueError(f"unreadable image {path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    sh, ex, nz = sharpness(gray), exposure(gray), noise_level(gray)
    fe = faces_and_emotion(img)
    cx, cy = (fe["boxes"][0][0], fe["boxes"][0][1]) if fe["faces"] else saliency_center(img)
    q = quality_score(sh, ex, nz)
    return {"w": img.shape[1], "h": img.shape[0], "sharpness": round(sh, 1), "exposure": ex, "noise": round(nz, 2),
            "colorfulness": round(colorfulness(cv2.resize(img, (320, 320))), 1), "quality": round(q, 3),
            "faces": fe, "subject": [round(cx, 3), round(cy, 3)],
            "interest": round(0.5 * q + 0.3 * fe["expressive"] + 0.2 * min(1.0, colorfulness(cv2.resize(img, (320, 320))) / 60), 3)}


def analyze_video_clip(path: Path, info, sample_fps: float = 2.0) -> dict:
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, int(round(fps / sample_fps)))
    secs, prev_small = [], None
    i = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, f = cap.retrieve()
            if not ok:
                break
            small = cv2.resize(f, (320, int(320 * f.shape[0] / f.shape[1])))
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            shake = motion = 0.0
            if prev_small is not None:
                flow = cv2.calcOpticalFlowFarneback(prev_small, gray, None, 0.5, 2, 13, 2, 5, 1.1, 0)
                mag = np.linalg.norm(flow, axis=2)
                motion = float(mag.mean())
                g = flow.reshape(-1, 2).mean(0)
                shake = float(np.linalg.norm(flow.reshape(-1, 2) - g, axis=1).std())  # incoherent motion ~ jitter
            fe = faces_and_emotion(f) if len(secs) % 2 == 0 else (secs[-1]["fe"] if secs else {"faces": 0, "boxes": [], "expressive": 0.0})
            sh_, ex_ = sharpness(gray), exposure(gray)
            secs.append({"t": round(i / fps, 2), "sharp": round(sh_, 1), "exp": round(ex_["mean"], 3),
                         "clip_hi": round(ex_["clip_hi"], 3), "motion": round(motion, 2), "shake": round(shake, 2),
                         "q": round(quality_score(sh_, ex_, noise_level(gray), shake), 3), "fe": fe})
            prev_small = gray
        i += 1
    cap.release()
    q = [s["q"] for s in secs] or [0.5]
    expressive = [s["fe"].get("expressive", 0) for s in secs] or [0]
    faces = [s["fe"].get("faces", 0) for s in secs] or [0]
    subj = next((s["fe"]["boxes"][0][:2] for s in secs if s["fe"].get("boxes")), None)
    return {"samples": secs, "quality": round(float(np.median(q)), 3), "face_ratio": round(float(np.mean([f > 0 for f in faces])), 3),
            "expressive": round(float(np.max(expressive)), 3), "motion": round(float(np.mean([s["motion"] for s in secs] or [0])), 2),
            "shake": round(float(np.median([s["shake"] for s in secs] or [0])), 2), "subject": subj or [0.5, 0.45]}


def speech_info(path: Path, cache: Path, language: str | None = None) -> dict:
    """Transcribe only if the clip actually contains voice."""
    from ..audio import speech_energy
    from ..transcribe import transcribe

    try:
        en = speech_energy(path)
    except Exception:
        return {"has_speech": False}
    active = float(np.mean(np.array(en) > 0.25)) if en else 0.0
    if active < 0.15:
        return {"has_speech": False, "activity": round(active, 3)}
    tr = transcribe(path, language=language, cache_dir=cache)
    words = tr["words"]
    dur = probe(path).duration
    speechy = len(words) / max(dur, 1) > 0.6
    return {"has_speech": speechy, "activity": round(active, 3), "language": tr["language"], "words": len(words),
            "text": " ".join(w["text"] for w in words)[:3000]}


def ingest(inputs: list[str | Path], language: str | None = None, progress=None) -> list[dict]:
    progress = progress or (lambda f, m: None)
    files = expand(inputs)
    items = []
    for k, p in enumerate(files):
        progress(k / max(1, len(files)), f"מנתח חומר {k + 1}/{len(files)}: {p.name}")
        kind = kind_of(p)
        cache = config.WORK_DIR / "cache" / file_key(p)
        cache.mkdir(parents=True, exist_ok=True)
        cached = cache / "media_index.json"
        if cached.exists():
            items.append(json.loads(cached.read_text(encoding="utf-8")))
            continue
        item = {"id": f"M{k}", "name": p.name, "orig": str(p.resolve()), "kind": kind, "path": str(p.resolve())}
        try:
            if kind == "image":
                item["path"] = str(normalize_image(p, cache))
                item.update(analyze_image(Path(item["path"])))
                item["created"] = _exif_time(p)
            elif kind == "video":
                info = probe(p)
                ci = video_color_info(p)
                item.update({"duration": info.duration, "w": info.display_size[0], "h": info.display_size[1], "fps": info.fps,
                             "has_audio": info.has_audio, "hdr": ci["hdr"], "vfr": ci["vfr"]})
                item.update(analyze_video_clip(p, info))
                item["speech"] = speech_info(p, cache, language) if info.has_audio else {"has_speech": False}
            elif kind == "audio":
                info = probe(p)
                item["duration"] = info.duration
                item["speech"] = speech_info(p, cache, language)
        except Exception as e:  # unreadable item: keep going, mark it
            log.warning("ingest failed for %s: %s", p, e)
            item["error"] = str(e)[:300]
        cached.write_text(json.dumps(item, ensure_ascii=False, default=float), encoding="utf-8")
        items.append(item)
    for k, it in enumerate(items):
        it["id"] = f"M{k}"
    progress(1.0, "החומר נותח")
    return items


def _exif_time(p: Path) -> str | None:
    try:
        from PIL import Image

        try:
            import pillow_heif

            pillow_heif.register_heif_opener()
        except ImportError:
            pass
        ex = Image.open(p).getexif()
        return ex.get(36867) or ex.get(306)
    except Exception:
        return None

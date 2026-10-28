"""Quality enhancement plugins. Each one: best available engine -> lighter fallback -> skip.
Never raises into the edit: on failure it logs and returns the input unchanged.

  stabilize      vidstab (2-pass)            -> deshake                 -> skip
  denoise        nlmeans (strong) / hqdn3d   (decode-time filter)
  upscale image  Real-ESRGAN (ncnn binary)   -> NLM denoise + Lanczos + detail/unsharp
  face restore   GFPGAN (if installed)       -> skip
  slow motion    RIFE (ncnn binary)          -> minterpolate (motion compensated) -> frame blend
  depth (2.5D)   Depth-Anything-V2 (ONNX)    -> saliency/face/vertical pseudo-depth
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from .. import config
from ..media import run

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def capabilities() -> dict:
    caps = {"gpu": False, "realesrgan": bool(shutil.which("realesrgan-ncnn-vulkan")),
            "rife": bool(shutil.which("rife-ncnn-vulkan")), "gfpgan": False,
            "depth_onnx": (config.MODELS_DIR / "depth_anything_v2_small.onnx").exists(),
            "deepfilternet": bool(shutil.which("deepFilter")), "demucs": False, "nvenc": False}
    try:
        import ctranslate2

        caps["gpu"] = ctranslate2.get_cuda_device_count() > 0
    except Exception:
        pass
    for mod, key in (("gfpgan", "gfpgan"), ("demucs", "demucs")):
        try:
            __import__(mod)
            caps[key] = True
        except Exception:
            pass
    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
        caps["nvenc"] = caps["gpu"] and "h264_nvenc" in out
    except Exception:
        pass
    return caps


def stabilize(src: str, cache: Path, shake: float) -> str:
    """Return path of a stabilized intermediate (visually lossless) or the original."""
    if shake < 1.2:
        return src
    out = cache / "stabilized.mp4"
    if out.exists():
        return str(out)
    trf = cache / "transforms.trf"
    try:
        run(["ffmpeg", "-i", src, "-vf", f"vidstabdetect=shakiness=7:accuracy=12:result='{trf.as_posix()}'", "-f", "null", "-"])
        run(["ffmpeg", "-i", src, "-vf", f"vidstabtransform=input='{trf.as_posix()}':smoothing=24:zoom=4:optzoom=0,unsharp=5:5:0.6",
             "-c:v", "libx264", "-crf", "12", "-preset", "fast", "-c:a", "copy", str(out)])
        return str(out)
    except Exception as e:
        log.warning("vidstab failed (%s); trying deshake", e)
        try:
            run(["ffmpeg", "-i", src, "-vf", "deshake=rx=32:ry=32", "-c:v", "libx264", "-crf", "12", "-preset", "fast",
                 "-c:a", "copy", str(out)])
            return str(out)
        except Exception as e2:
            log.warning("deshake failed (%s); using original", e2)
            return src


def denoise_filter(noise: float, quality: float) -> str:
    if noise > 9 or quality < 0.35:
        return "hqdn3d=3:3:6:6"
    if noise > 5:
        return "hqdn3d=1.5:1.5:4:4"
    return ""


def upscale_image(path: str, cache: Path, target_short: int = 1440, noise: float = 0.0) -> str:
    img = cv2.imread(path)
    if img is None:
        return path
    short = min(img.shape[:2])
    if short >= target_short * 0.9:
        return path
    out = cache / "upscaled.png"
    if out.exists():
        return str(out)
    scale = 4 if short * 2 < target_short else 2
    if capabilities()["realesrgan"]:
        try:
            run(["realesrgan-ncnn-vulkan", "-i", path, "-o", str(out), "-s", str(scale), "-n", "realesrgan-x4plus"], quiet=False)
            return str(out)
        except Exception as e:
            log.warning("Real-ESRGAN failed: %s", e)
    try:
        work = img
        if noise > 3:
            work = cv2.fastNlMeansDenoisingColored(work, None, 4 + min(6, noise / 2), 6, 7, 21)
        f = min(4.0, target_short / short)
        # two gentle Lanczos steps + a light unsharp mask: crisp without the painterly over-processed look
        mid = cv2.resize(work, None, fx=f ** 0.5, fy=f ** 0.5, interpolation=cv2.INTER_LANCZOS4)
        up = cv2.resize(mid, (int(work.shape[1] * f), int(work.shape[0] * f)), interpolation=cv2.INTER_LANCZOS4)
        blur = cv2.GaussianBlur(up, (0, 0), 1.2)
        up = cv2.addWeighted(up, 1.25, blur, -0.25, 0)
        cv2.imwrite(str(out), up)
        return str(out)
    except Exception as e:
        log.warning("upscale fallback failed: %s", e)
        return path


def restore_faces(path: str, cache: Path, faces: int) -> str:
    if not faces or not capabilities()["gfpgan"]:
        return path
    out = cache / "faces_restored.png"
    if out.exists():
        return str(out)
    try:
        from gfpgan import GFPGANer

        model = config.MODELS_DIR / "GFPGANv1.4.pth"
        if not model.exists():
            return path
        restorer = GFPGANer(model_path=str(model), upscale=1, arch="clean", channel_multiplier=2)
        _, _, restored = restorer.enhance(cv2.imread(path), has_aligned=False, only_center_face=False, paste_back=True)
        cv2.imwrite(str(out), restored)
        return str(out)
    except Exception as e:
        log.warning("GFPGAN failed: %s", e)
        return path


def slowmo_filter(speed: float, fps: int, src_height: int = 1080) -> str:
    """Decode-time filter for smooth slow motion (frames synthesized by motion compensation).
    Low-resolution footage gets no interpolation: motion compensation turns it into blocks."""
    if speed >= 0.8 or src_height < 600:
        return ""
    return f"minterpolate=fps={fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"


# ------------------------------------------------------------------ depth / 2.5D parallax
@lru_cache(maxsize=1)
def _depth_session():
    p = config.MODELS_DIR / "depth_anything_v2_small.onnx"
    if not p.exists():
        return None
    try:
        import onnxruntime as ort

        prov = ["CUDAExecutionProvider", "CPUExecutionProvider"] if capabilities()["gpu"] else ["CPUExecutionProvider"]
        return ort.InferenceSession(str(p), providers=prov)
    except Exception as e:
        log.warning("depth model unavailable: %s", e)
        return None


def depth_map(bgr: np.ndarray, subject: tuple[float, float] | None = None) -> np.ndarray:
    """Relative depth in [0,1], 1 = near."""
    h, w = bgr.shape[:2]
    sess = _depth_session()
    if sess is not None:
        try:
            x = cv2.resize(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), (518, 518)).astype(np.float32) / 255
            x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
            d = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
            d = cv2.resize(d.astype(np.float32), (w, h))
            return (d - d.min()) / (np.ptp(d) + 1e-6)
        except Exception as e:
            log.warning("depth inference failed: %s", e)
    # pseudo-depth: lower parts of a photo are usually nearer; salient / face regions pop forward
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None].repeat(w, 1)
    small = cv2.resize(bgr, (160, int(160 * h / w)))
    sal = cv2.saliency.StaticSaliencySpectralResidual_create() if hasattr(cv2, "saliency") else None
    if sal is not None:
        ok, smap = sal.computeSaliency(small)
        smap = cv2.resize(smap.astype(np.float32), (w, h)) if ok else np.zeros((h, w), np.float32)
    else:
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
        smap = cv2.resize(np.abs(cv2.Laplacian(gray, cv2.CV_32F)), (w, h))
        smap = cv2.GaussianBlur(smap, (0, 0), w / 30)
    smap = smap / (smap.max() + 1e-6)
    d = 0.55 * yy + 0.45 * smap
    if subject:
        cx, cy = subject
        g = np.exp(-(((np.arange(w)[None] / w - cx) ** 2) / 0.03 + ((np.arange(h)[:, None] / h - cy) ** 2) / 0.05))
        d = 0.7 * d + 0.3 * g
    d = cv2.GaussianBlur(d.astype(np.float32), (0, 0), max(3, w / 60))
    return (d - d.min()) / (np.ptp(d) + 1e-6)


def parallax_layers(bgr: np.ndarray, subject=None) -> dict:
    d = depth_map(bgr, subject)
    thr = float(np.quantile(d, 0.62))
    fg = np.clip((d - thr) / 0.08, 0, 1).astype(np.float32)
    fg = cv2.GaussianBlur(fg, (0, 0), max(2, bgr.shape[1] / 300))
    hole = (fg > 0.25).astype(np.uint8) * 255
    small = cv2.resize(bgr, (bgr.shape[1] // 3, bgr.shape[0] // 3))
    hs = cv2.resize(cv2.dilate(hole, np.ones((9, 9), np.uint8)), (small.shape[1], small.shape[0]))
    bg_fill = cv2.resize(cv2.inpaint(small, hs, 9, cv2.INPAINT_TELEA), (bgr.shape[1], bgr.shape[0]))
    hm = (cv2.GaussianBlur(hole, (0, 0), 6) / 255.0)[..., None]
    bg = (bgr * (1 - hm) + bg_fill * hm).astype(np.uint8)
    return {"bg": bg, "fg": bgr, "alpha": fg[..., None]}


def parallax_frame(layers: dict, progress: float, direction: int = 1, strength: float = 0.05) -> np.ndarray:
    """Camera dolly: background zooms/shifts less than the foreground -> depth illusion."""
    bg, fg, a = layers["bg"], layers["fg"], layers["alpha"]
    h, w = bg.shape[:2]
    p = progress

    def warp(img, z, dx):
        m = np.float32([[z, 0, (1 - z) * w / 2 + dx], [0, z, (1 - z) * h / 2]])
        return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    zb, zf = 1.06 + strength * 0.4 * p, 1.06 + strength * 1.6 * p
    db, df = direction * w * strength * 0.15 * p, direction * w * strength * 0.6 * p
    bgw = warp(bg, zb, db)
    fgw = warp(fg, zf, df)
    aw = warp(a, zf, df)
    if aw.ndim == 2:
        aw = aw[..., None]
    return (fgw * aw + bgw * (1 - aw)).astype(np.uint8)

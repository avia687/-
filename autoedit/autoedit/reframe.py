"""Face tracking + smooth virtual-camera path for aspect-ratio reframing (16:9 -> 9:16 etc.)."""
from __future__ import annotations

import logging
from functools import lru_cache

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d

from . import config

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _detector():
    model = config.MODELS_DIR / "blaze_face_short_range.tflite"
    if not model.exists():
        log.warning("face model missing (%s); reframing falls back to saliency", model)
        return None
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    opts = vision.FaceDetectorOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model)),
        min_detection_confidence=0.45,
    )
    try:
        return vision.FaceDetector.create_from_options(opts)
    except Exception as e:  # missing GL libs etc. -> saliency fallback, never crash
        log.warning("face detector unavailable (%s); using saliency fallback", e)
        return None


def detect_faces(frame_bgr: np.ndarray) -> list[tuple[float, float, float, float]]:
    """Return [(cx, cy, size, score)] normalized to frame size."""
    det = _detector()
    if det is None:
        return []
    import mediapipe as mp

    h, w = frame_bgr.shape[:2]
    scale = 640 / max(h, w)
    small = cv2.resize(frame_bgr, (int(w * scale), int(h * scale))) if scale < 1 else frame_bgr
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
    res = det.detect(img)
    sh, sw = small.shape[:2]
    out = []
    for d in res.detections:
        b = d.bounding_box
        out.append(((b.origin_x + b.width / 2) / sw, (b.origin_y + b.height / 2) / sh,
                    max(b.width / sw, b.height / sh), d.categories[0].score))
    return out


def _saliency_center(frame_bgr: np.ndarray) -> tuple[float, float]:
    """Fallback subject estimate: centroid of high-contrast / skin-ish regions."""
    small = cv2.resize(frame_bgr, (160, 90))
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
    mag = cv2.magnitude(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1))
    ycc = cv2.cvtColor(small, cv2.COLOR_BGR2YCrCb)
    skin = ((ycc[..., 1] > 135) & (ycc[..., 1] < 180) & (ycc[..., 2] > 85) & (ycc[..., 2] < 135)).astype(np.float32)
    wmap = mag / (mag.max() + 1e-6) + 2 * skin
    ys, xs = np.mgrid[0:90, 0:160]
    s = wmap.sum() + 1e-6
    return float((wmap * xs).sum() / s / 160), float((wmap * ys).sum() / s / 90)


def track(video_path: str, sample_fps: float = 6.0) -> dict:
    """Sample the video and return a subject track {t: [...], x: [...], y: [...], size: [...], found: ratio}."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or config.FPS
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, int(round(fps / sample_fps)))
    ts, xs, ys, ss = [], [], [], []
    found = 0
    prev = None
    for idx in range(0, n, step):
        ok, frame = cap.read()
        if not ok:
            break
        for _ in range(step - 1):  # sequential grab is far cheaper than seeking
            cap.grab()
        faces = detect_faces(frame)
        if faces:
            found += 1
            if prev is None:
                cx, cy, sz, _ = max(faces, key=lambda f: f[2] * f[3])
            else:  # continuity: prefer the face nearest to the previous one, weighted by size
                cx, cy, sz, _ = min(faces, key=lambda f: np.hypot(f[0] - prev[0], f[1] - prev[1]) - f[2])
        else:
            if prev is not None:
                cx, cy, sz = prev
            else:
                cx, cy = _saliency_center(frame)
                sz = 0.0
        prev = (cx, cy, sz)
        ts.append(idx / fps)
        xs.append(cx)
        ys.append(cy)
        ss.append(sz)
    cap.release()
    total = max(1, len(ts))
    return {"t": ts, "x": xs, "y": ys, "size": ss, "found": found / total}


def camera_path(trk: dict, n_frames: int, fps: float, deadzone: float = 0.04, smooth_sec: float = 0.45) -> np.ndarray:
    """Per-frame (cx, cy) normalized: interpolated, dead-zoned and zero-phase smoothed like a camera operator."""
    if not trk["t"]:
        return np.tile([0.5, 0.45], (n_frames, 1))
    t = np.arange(n_frames) / fps
    x = np.interp(t, trk["t"], trk["x"])
    y = np.interp(t, trk["t"], trk["y"])
    # dead-zone: hold the frame until the subject drifts noticeably
    hx, hy = np.empty_like(x), np.empty_like(y)
    cx, cy = x[0], y[0]
    for i in range(n_frames):
        if abs(x[i] - cx) > deadzone:
            cx = x[i] - np.sign(x[i] - cx) * deadzone
        if abs(y[i] - cy) > deadzone:
            cy = y[i] - np.sign(y[i] - cy) * deadzone
        hx[i], hy[i] = cx, cy
    sigma = max(1.0, smooth_sec * fps)
    return np.stack([gaussian_filter1d(hx, sigma, mode="nearest"), gaussian_filter1d(hy, sigma, mode="nearest")], 1)


def crop_rect(src_w: int, src_h: int, out_w: int, out_h: int, cx: float, cy: float, zoom: float = 1.0,
              head_room: float = 0.38) -> tuple[int, int, int, int]:
    """Crop window (x, y, w, h) in source pixels with the subject centered horizontally and the face
    placed at ~`head_room` of the frame height (rule of thirds)."""
    target = out_w / out_h
    if src_w / src_h > target:
        h = src_h
        w = h * target
    else:
        w = src_w
        h = w / target
    w, h = w / zoom, h / zoom
    x = cx * src_w - w / 2
    y = cy * src_h - h * head_room
    x = float(np.clip(x, 0, src_w - w))
    y = float(np.clip(y, 0, src_h - h))
    return int(round(x)), int(round(y)), max(2, int(round(w))), max(2, int(round(h)))

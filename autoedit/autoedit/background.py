"""Person segmentation -> background blur / replacement (image, video or color)."""
from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np

from . import config

log = logging.getLogger(__name__)


class Segmenter:
    """MediaPipe selfie segmenter (fast, default) or rembg (higher quality, slower)."""

    def __init__(self, engine: str = "mediapipe"):
        self.engine = engine
        self.prev: np.ndarray | None = None
        if engine == "rembg":
            from rembg import new_session

            self.session = new_session("u2net_human_seg")
        else:
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision

            model = config.MODELS_DIR / "selfie_segmenter.tflite"
            opts = vision.ImageSegmenterOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(model)),
                output_confidence_masks=True, output_category_mask=False)
            self.seg = vision.ImageSegmenter.create_from_options(opts)

    def mask(self, frame_bgr: np.ndarray) -> np.ndarray:
        h, w = frame_bgr.shape[:2]
        if self.engine == "rembg":
            from rembg import remove

            rgba = remove(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB), session=self.session, only_mask=True)
            m = np.asarray(rgba, np.float32) / 255.0
        else:
            import mediapipe as mp

            small = cv2.resize(frame_bgr, (256, int(256 * h / w)) if w >= h else (int(256 * w / h), 256))
            img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
            res = self.seg.segment(img)
            m = res.confidence_masks[0].numpy_view().astype(np.float32)
            if m.ndim == 3:
                m = m[..., 0]
            m = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR)
        # temporal smoothing kills edge flicker; slight erosion + feather avoids halos
        if self.prev is not None and self.prev.shape == m.shape:
            m = 0.6 * m + 0.4 * self.prev
        self.prev = m
        m = np.clip((m - 0.35) / 0.4, 0, 1)
        k = max(3, (min(h, w) // 200) | 1)
        return cv2.GaussianBlur(m, (k * 2 + 1, k * 2 + 1), 0)


def cover_fit(img: np.ndarray, w: int, h: int) -> np.ndarray:
    ih, iw = img.shape[:2]
    s = max(w / iw, h / ih)
    r = cv2.resize(img, (int(np.ceil(iw * s)), int(np.ceil(ih * s))), interpolation=cv2.INTER_AREA)
    y0, x0 = (r.shape[0] - h) // 2, (r.shape[1] - w) // 2
    return r[y0:y0 + h, x0:x0 + w]


class Background:
    def __init__(self, mode: str = "none", value: str | None = None, engine: str = "mediapipe", strength: float = 1.0):
        self.mode = mode
        self.value = value
        self.strength = strength
        self.seg = None
        if mode != "none":
            try:
                self.seg = Segmenter(engine)
            except Exception as e:
                log.warning("segmenter %s unavailable (%s); trying mediapipe", engine, e)
                try:
                    self.seg = Segmenter("mediapipe") if engine != "mediapipe" else None
                except Exception as e2:
                    log.error("no segmenter available (%s); background effect skipped", e2)
        self.image = None
        self.cap = None
        if mode == "image" and value:
            self.image = cv2.imread(str(value))
            if self.image is None:
                raise FileNotFoundError(f"background image not found: {value}")
        elif mode == "video" and value:
            if not Path(value).exists():
                raise FileNotFoundError(f"background video not found: {value}")
            self.cap = cv2.VideoCapture(str(value))

    def _bg(self, frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        if self.mode == "blur":
            small = cv2.resize(frame, (w // 6, h // 6), interpolation=cv2.INTER_AREA)
            k = int(9 * self.strength) * 2 + 1
            small = cv2.GaussianBlur(small, (k, k), 0)
            bg = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
            return cv2.convertScaleAbs(bg, alpha=0.9, beta=0)  # slightly darker background = subject pops
        if self.mode == "image":
            return cover_fit(self.image, w, h)
        if self.mode == "video":
            ok, f = self.cap.read()
            if not ok:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, f = self.cap.read()
            return cover_fit(f, w, h)
        if self.mode == "color":
            hexv = (self.value or "#101820").lstrip("#")
            b, g, r = int(hexv[4:6], 16), int(hexv[2:4], 16), int(hexv[0:2], 16)
            return np.full_like(frame, (b, g, r))
        return frame

    def apply(self, frame: np.ndarray) -> np.ndarray:
        if self.mode == "none" or self.seg is None:
            return frame
        m = self.seg.mask(frame)[..., None]
        bg = self._bg(frame)
        return (frame.astype(np.float32) * m + bg.astype(np.float32) * (1 - m)).astype(np.uint8)

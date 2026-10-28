"""Bitmap overlays drawn by the compositor: colour emoji, stickers, logo, progress bar."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

EMOJI_FONTS = [
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    "/System/Library/Fonts/Apple Color Emoji.ttc",
    "C:/Windows/Fonts/seguiemj.ttf",
]


@lru_cache(maxsize=64)
def emoji_rgba(emoji: str, size: int) -> np.ndarray | None:
    from PIL import Image, ImageDraw, ImageFont

    for fp in EMOJI_FONTS:
        if not Path(fp).exists():
            continue
        try:
            font = ImageFont.truetype(fp, 109)
        except OSError:
            continue
        im = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((10, 10), emoji, font=font, embedded_color=True)
        bbox = im.getbbox()
        if not bbox:
            continue
        im = im.crop(bbox)
        s = size / max(im.size)
        im = im.resize((max(1, int(im.size[0] * s)), max(1, int(im.size[1] * s))), Image.LANCZOS)
        arr = np.array(im)
        return cv2.cvtColor(arr, cv2.COLOR_RGBA2BGRA)
    return None


@lru_cache(maxsize=16)
def load_rgba(path: str, size: int) -> np.ndarray | None:
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        return None
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    elif img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    s = size / max(img.shape[:2])
    return cv2.resize(img, (max(1, int(img.shape[1] * s)), max(1, int(img.shape[0] * s))), interpolation=cv2.INTER_AREA)


def blit(frame: np.ndarray, rgba: np.ndarray, cx: int, cy: int, scale: float = 1.0, alpha: float = 1.0,
         angle: float = 0.0) -> None:
    if rgba is None or scale <= 0.02 or alpha <= 0.01:
        return
    img = rgba
    if scale != 1.0 or angle:
        h, w = img.shape[:2]
        m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, scale)
        nw, nh = int(w * scale * 1.3) + 2, int(h * scale * 1.3) + 2
        m[0, 2] += nw / 2 - w / 2
        m[1, 2] += nh / 2 - h / 2
        img = cv2.warpAffine(img, m, (nw, nh), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    h, w = img.shape[:2]
    x0, y0 = cx - w // 2, cy - h // 2
    fx0, fy0 = max(0, x0), max(0, y0)
    fx1, fy1 = min(frame.shape[1], x0 + w), min(frame.shape[0], y0 + h)
    if fx1 <= fx0 or fy1 <= fy0:
        return
    sub = img[fy0 - y0:fy1 - y0, fx0 - x0:fx1 - x0]
    a = sub[..., 3:4].astype(np.float32) / 255.0 * alpha
    roi = frame[fy0:fy1, fx0:fx1].astype(np.float32)
    frame[fy0:fy1, fx0:fx1] = (roi * (1 - a) + sub[..., :3].astype(np.float32) * a).astype(np.uint8)


def pop_curve(t: float, dur: float = 0.28) -> float:
    """Overshoot scale animation 0 -> 1.18 -> 1."""
    if t < 0:
        return 0.0
    if t >= dur:
        return 1.0
    x = t / dur
    return float(1 + 0.18 * np.sin(np.pi * x) * (1 - x) * 2.2 - (1 - x) ** 3)


def hex_bgr(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)


def progress_bar(frame: np.ndarray, frac: float, color: str = "#FFE14D", height: int = 10, top: bool = True) -> None:
    H, W = frame.shape[:2]
    y0 = 0 if top else H - height
    track = frame[y0:y0 + height].astype(np.float32)
    frame[y0:y0 + height] = (track * 0.55).astype(np.uint8)  # subtle dark track
    w = int(W * max(0.0, min(1.0, frac)))
    if w > 0:
        cv2.rectangle(frame, (0, y0), (w, y0 + height - 1), hex_bgr(color), -1)
        cv2.circle(frame, (w, y0 + height // 2), height // 2 + 3, (255, 255, 255), -1, cv2.LINE_AA)

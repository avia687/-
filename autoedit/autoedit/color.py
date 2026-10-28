"""Automatic colour correction (exposure, contrast, white balance, saturation) + niche LUT,
and shot-to-shot colour matching so mixed sources look like one camera."""
from __future__ import annotations

import cv2
import numpy as np

from . import config


def sample_frames(path: str, n: int = 8, width: int = 320) -> list[np.ndarray]:
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames = []
    for i in np.linspace(total * 0.05, max(0, total * 0.95 - 1), n).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
        ok, f = cap.read()
        if ok:
            frames.append(cv2.resize(f, (width, int(width * f.shape[0] / f.shape[1]))))
    cap.release()
    return frames


def frame_stats(frames: list[np.ndarray]) -> dict:
    if not frames:
        return {"luma": 0.45, "contrast": 0.2, "saturation": 0.35, "gains": [1, 1, 1], "warmth": 0.0}
    stack = np.stack(frames).astype(np.float32) / 255.0
    b, g, r = stack[..., 0], stack[..., 1], stack[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    hsv = np.stack([cv2.cvtColor(f, cv2.COLOR_BGR2HSV) for f in frames]).astype(np.float32) / 255.0
    # gray-world on mid-tones only (ignores clipped highlights & crushed shadows)
    mid = (luma > 0.15) & (luma < 0.85)
    means = [float(c[mid].mean()) if mid.any() else 0.5 for c in (r, g, b)]
    gray = float(np.mean(means))
    gains = [gray / max(m, 1e-3) for m in means]
    return {"luma": float(luma.mean()), "contrast": float(luma.std()), "saturation": float(hsv[..., 1].mean()),
            "gains": gains, "warmth": float(means[0] - means[2])}


def auto_correct_filter(stats: dict, profile_color: dict, wb_strength: float = 0.6) -> str:
    """Build an ffmpeg filter chain string (eq + colorchannelmixer + lut3d)."""
    target_luma = 0.42 + 0.12 * (float(profile_color.get("brightness", 0.5)) - 0.5) * 2
    brightness = float(np.clip((target_luma - stats["luma"]) * 0.6, -0.12, 0.12))
    target_contrast = 0.17 + 0.08 * float(profile_color.get("contrast", 0.55))
    # correct toward the target but never more than halfway: footage keeps its character
    contrast = float(np.clip(1 + (target_contrast / max(stats["contrast"], 0.05) - 1) * 0.5, 0.9, 1.2))
    target_sat = 0.36 * float(profile_color.get("saturation", 1.08))
    saturation = float(np.clip(1 + (target_sat / max(stats["saturation"], 0.05) - 1) * 0.5, 0.85, 1.25))
    gamma = 1.0 + float(np.clip((target_luma - stats["luma"]) * 0.8, -0.2, 0.25))
    g = [1 + (x - 1) * wb_strength for x in stats["gains"]]
    warmth = float(profile_color.get("warmth", 0.0))
    g[0] *= 1 + warmth
    g[2] *= 1 - warmth
    g = [float(np.clip(x, 0.8, 1.25)) for x in g]
    chain = [
        f"colorchannelmixer=rr={g[0]:.3f}:gg={g[1]:.3f}:bb={g[2]:.3f}",
        f"eq=brightness={brightness:.3f}:contrast={contrast:.3f}:saturation={saturation:.3f}:gamma={gamma:.3f}",
    ]
    lut = config.LUTS_DIR / f"{profile_color.get('look', 'neutral')}.cube"
    if lut.exists():
        chain.append(f"lut3d=file='{lut.as_posix()}':interp=tetrahedral")
    return ",".join(chain)


# ---------------------------------------------------------- shot matching (Reinhard in Lab)
def lab_stats(frames: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    lab = np.concatenate([cv2.cvtColor(f, cv2.COLOR_BGR2LAB).reshape(-1, 3) for f in frames]).astype(np.float32)
    return lab.mean(0), lab.std(0) + 1e-3


def match_transform(src_frames: list[np.ndarray], ref_frames: list[np.ndarray], strength: float = 0.7) -> dict:
    sm, ss = lab_stats(src_frames)
    rm, rs = lab_stats(ref_frames)
    scale = 1 + (np.clip(rs / ss, 0.6, 1.6) - 1) * strength
    shift = (rm - sm) * strength
    return {"mean": sm.tolist(), "scale": scale.tolist(), "shift": shift.tolist()}


def apply_match(frame: np.ndarray, tf: dict) -> np.ndarray:
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
    m = np.array(tf["mean"], np.float32)
    lab = (lab - m) * np.array(tf["scale"], np.float32) + m + np.array(tf["shift"], np.float32)
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

"""Object / watermark removal: auto-detect static overlays and inpaint them every frame."""
from __future__ import annotations

import cv2
import numpy as np


def detect_static_logos(video_path: str, samples: int = 24, max_area: float = 0.04) -> list[dict]:
    """Find burned-in watermarks/logos: regions that stay pixel-identical over time, are dense in
    edges (text/graphics) and sit near the frame border. Returns normalized boxes."""
    cap = cv2.VideoCapture(video_path)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames = []
    for i in np.linspace(0, max(0, n - 1), samples).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
        ok, f = cap.read()
        if ok:
            frames.append(cv2.cvtColor(cv2.resize(f, (640, int(640 * f.shape[0] / f.shape[1]))), cv2.COLOR_BGR2GRAY))
    cap.release()
    if len(frames) < 4:
        return []
    stack = np.stack(frames).astype(np.float32)
    h, w = stack.shape[1:]
    edges = np.mean([cv2.Canny(f, 80, 200) > 0 for f in frames], axis=0)  # fraction of frames with an edge
    persistent = (edges > 0.9).astype(np.uint8)
    # watermarks are bright/dark overlays: high local contrast, persistent edges in the same place
    border = np.zeros_like(persistent)
    by, bx = int(h * 0.22), int(w * 0.22)
    border[:by, :] = 1
    border[-by:, :] = 1
    border[:, :bx] = 1
    border[:, -bx:] = 1
    cand = persistent & border
    cand = cv2.morphologyEx(cand, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 7)))
    num, lab, stats, _ = cv2.connectedComponentsWithStats(cand, 8)
    boxes = []
    for k in range(1, num):
        x, y, bw, bh, area = stats[k]
        if bw * bh > max_area * w * h or bw < 12 or bh < 6:
            continue
        density = persistent[y:y + bh, x:x + bw].mean()
        if density < 0.12:  # long straight lines (furniture, frame edges) are sparse -> skip
            continue
        if bw / max(bh, 1) > 25:
            continue
        pad = 6
        boxes.append({"x": round(max(0, x - pad) / w, 4), "y": round(max(0, y - pad) / h, 4),
                      "w": round(min(w - x + pad, bw + 2 * pad) / w, 4), "h": round(min(h - y + pad, bh + 2 * pad) / h, 4)})
    return boxes


class Inpainter:
    def __init__(self, boxes: list[dict], width: int, height: int):
        self.regions = []
        for b in boxes:
            x, y = int(b["x"] * width), int(b["y"] * height)
            w, h = max(2, int(b["w"] * width)), max(2, int(b["h"] * height))
            m = 20  # context margin for the inpainting solver
            x0, y0 = max(0, x - m), max(0, y - m)
            x1, y1 = min(width, x + w + m), min(height, y + h + m)
            mask = np.zeros((y1 - y0, x1 - x0), np.uint8)
            mask[y - y0:y - y0 + h, x - x0:x - x0 + w] = 255
            self.regions.append((x0, y0, x1, y1, mask))

    def apply(self, frame: np.ndarray) -> np.ndarray:
        for x0, y0, x1, y1, mask in self.regions:
            roi = frame[y0:y1, x0:x1]
            frame[y0:y1, x0:x1] = cv2.inpaint(roi, mask, 7, cv2.INPAINT_TELEA)
        return frame

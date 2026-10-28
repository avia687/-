"""Native motion-graphics engine (rendered inside the compositor - no extra encode, no browser):
kinetic titles, lower thirds, animated stat counters, location cards, end cards, tracked labels.
Text is shaped with libraqm, so Hebrew renders RTL correctly."""
from __future__ import annotations

import math
import re
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .. import config
from ..overlays import blit, hex_bgr, load_rgba

HEB = re.compile(r"[֐-׿]")


def ease_out_back(x: float) -> float:
    x = min(1.0, max(0.0, x))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def ease_out(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


@lru_cache(maxsize=32)
def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for cand in (config.FONTS_DIR / f"{name.replace(' ', '')}.ttf", Path(name), config.FONTS_DIR / "HeeboBlack.ttf"):
        if Path(cand).exists():
            return ImageFont.truetype(str(cand), size, layout_engine=ImageFont.Layout.RAQM)
    return ImageFont.load_default(size)


def text_rgba(text: str, font_name: str, size: int, fill=(255, 255, 255), box: tuple | None = None,
              pad: float = 0.35, radius: float = 0.25, stroke: int = 0, stroke_fill=(0, 0, 0)) -> np.ndarray:
    """Text (+ colour emoji, drawn as bitmaps because text fonts have no emoji glyphs) on an optional rounded box."""
    from ..captions import split_emoji
    from ..overlays import emoji_rgba

    text, emojis = split_emoji(text)
    f = font(font_name, size)
    rtl = bool(HEB.search(text))
    kw = {"direction": "rtl", "language": "he"} if rtl else {}
    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    l, t, r, b = probe.textbbox((0, 0), text or " ", font=f, stroke_width=stroke, **kw)
    p = int(size * pad) if box else stroke + 2
    ems = [e for e in (emoji_rgba(x, int(size * 1.05)) for x in emojis[:2]) if e is not None]
    gap = size // 4
    ew = sum(e.shape[1] + gap for e in ems)
    tw, th = r - l, b - t
    w, h = tw + ew + 2 * p, max(th, max((e.shape[0] for e in ems), default=0)) + 2 * p
    im = Image.new("RGBA", (max(1, w), max(1, h)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if box:
        d.rounded_rectangle((0, 0, w - 1, h - 1), radius=int(size * radius), fill=box)
    # emoji sit at the end of the sentence: on the left for RTL, on the right for LTR
    tx = p + (ew if rtl else 0)
    d.text((tx - l, (h - th) // 2 - t), text, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill, **kw)
    ex = p if rtl else p + tw + gap
    for e in ems:
        em = Image.fromarray(cv2.cvtColor(e, cv2.COLOR_BGRA2RGBA))
        im.alpha_composite(em, (int(ex), int((h - em.size[1]) // 2)))
        ex += e.shape[1] + gap
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGBA2BGRA)


def _rgb(hexs: str, a: int = 255) -> tuple:
    b, g, r = hex_bgr(hexs)
    return (r, g, b, a)


class Graphics:
    """Holds the plan's graphic items and draws the active ones on each frame."""

    def __init__(self, items: list[dict], W: int, H: int, brand: dict | None, style: dict, safe_bottom: float):
        self.items = items or []
        self.W, self.H = W, H
        self.brand = brand or {}
        self.accent = self.brand.get("accent_color") or style.get("highlight_color", "#FFE14D")
        self.primary = self.brand.get("primary_color") or style.get("box_color", "#7B2FF7")
        self.title_font = self.brand.get("title_font") or ("Heebo Black")
        self.safe_bottom = safe_bottom
        self._cache: dict = {}

    def _cached(self, key, fn):
        if key not in self._cache:
            img = fn()
            # nothing may run off-screen: shrink any text block wider than the safe width
            maxw = int(self.W * 0.9)
            if img is not None and img.shape[1] > maxw:
                s = maxw / img.shape[1]
                img = cv2.resize(img, (maxw, max(1, int(img.shape[0] * s))), interpolation=cv2.INTER_AREA)
            self._cache[key] = img
        return self._cache[key]

    def draw(self, frame: np.ndarray, t: float) -> None:
        for k, g in enumerate(self.items):
            if g["start"] <= t < g["end"]:
                fn = getattr(self, "_" + g["type"], None)
                if fn:
                    fn(frame, g, t - g["start"], g["end"] - g["start"], k)

    # ------------------------------------------------------------ templates
    def _kinetic_title(self, frame, g, lt, dur, k):
        words = g["text"].split()
        size = int(self.H * (0.062 if self.H > self.W else 0.085))
        rtl = bool(HEB.search(g["text"]))
        hl = g.get("highlight")
        if hl is None:
            hl = max(range(len(words)), key=lambda i: (any(c.isdigit() for c in words[i]), len(words[i])))
        from ..captions import wrap_words

        rows, idx = [], 0
        for ln in wrap_words(words, 12 if self.H > self.W else 22):  # balanced lines, no orphan words
            rows.append(list(range(idx, idx + len(ln))))
            idx += len(ln)
        y = int(self.H * 0.17)
        out_a = 1.0 - ease_out((lt - (dur - 0.25)) / 0.25) if lt > dur - 0.25 else 1.0
        for r_i, row in enumerate(rows):
            imgs = []
            for i in row:
                is_hl = i == hl
                img = self._cached(("kt", k, i), lambda i=i, is_hl=is_hl: text_rgba(
                    words[i], self.title_font, size, fill=(20, 20, 20, 255) if is_hl else (255, 255, 255, 255),
                    box=_rgb(self.accent) if is_hl else None, stroke=0 if is_hl else max(2, size // 14)))
                imgs.append((i, img))
            gap = int(size * 0.25)
            total = sum(im.shape[1] for _, im in imgs) + gap * (len(imgs) - 1)
            x = (self.W - total) // 2
            seq = imgs[::-1] if rtl else imgs
            for i, im in seq:
                delay = 0.07 * i
                p = ease_out_back((lt - delay) / 0.32)
                if lt >= delay:
                    blit(frame, im, x + im.shape[1] // 2, y + int((1 - p) * size * 0.6) + im.shape[0] // 2,
                         scale=max(0.05, 0.6 + 0.4 * p), alpha=min(1.0, (lt - delay) / 0.12) * out_a)
                x += im.shape[1] + gap
            y += int(size * 1.35)

    def _lower_third(self, frame, g, lt, dur, k):
        size = int(self.H * (0.032 if self.H > self.W else 0.045))
        name = self._cached(("lt1", k), lambda: text_rgba(g["text"], self.title_font, size, box=_rgb(self.primary), pad=0.45))
        sub = None
        if g.get("sub"):
            sub = self._cached(("lt2", k), lambda: text_rgba(g["sub"], "Heebo Medium", int(size * 0.72), fill=(20, 20, 20, 255),
                                                             box=(255, 255, 255, 235), pad=0.4))
        rtl = bool(HEB.search(g["text"]))
        p = ease_out(lt / 0.45)
        out = ease_out((lt - (dur - 0.35)) / 0.35) if lt > dur - 0.35 else 0.0
        margin = int(self.W * 0.06)
        y = int(self.H * (1 - self.safe_bottom - 0.12))
        side = 1 if rtl else -1
        off = int((1 - p + out) * self.W * 0.6) * (side)
        x = (self.W - margin - name.shape[1] // 2 if rtl else margin + name.shape[1] // 2) + off
        blit(frame, name, x, y, 1.0, 1.0 - out)
        if sub is not None:
            xs = (self.W - margin - sub.shape[1] // 2 if rtl else margin + sub.shape[1] // 2) + int(off * 1.2)
            blit(frame, sub, xs, y + name.shape[0] // 2 + sub.shape[0] // 2 + 6, 1.0, 1.0 - out)

    def _stat(self, frame, g, lt, dur, k):
        size = int(self.H * (0.075 if self.H > self.W else 0.1))
        val = float(g.get("value", 0))
        p = ease_out(lt / min(1.2, dur * 0.6))
        cur = val * p
        num = (f"{cur:,.0f}" if val >= 100 or float(val).is_integer() else f"{cur:.1f}")
        text = f"{g.get('prefix', '')}{num}{g.get('suffix', '')}"
        im = text_rgba(text, self.title_font, size, fill=_rgb(self.accent), stroke=max(3, size // 12))
        lab = self._cached(("st", k), lambda: text_rgba(g.get("label", ""), "Heebo ExtraBold", int(size * 0.42),
                                                        box=(0, 0, 0, 170), pad=0.35)) if g.get("label") else None
        a = min(1.0, lt / 0.15, (dur - lt) / 0.25)
        y = int(self.H * 0.42)
        blit(frame, im, self.W // 2, y, scale=0.85 + 0.15 * ease_out_back(lt / 0.35), alpha=a)
        if lab is not None:
            blit(frame, lab, self.W // 2, y + im.shape[0] // 2 + lab.shape[0] // 2 + 8, 1.0, a)

    def _location(self, frame, g, lt, dur, k):
        size = int(self.H * (0.034 if self.H > self.W else 0.05))
        card = self._cached(("loc", k), lambda: text_rgba(g["text"], self.title_font,
                                                          size, fill=(20, 20, 20, 255), box=(255, 255, 255, 240), pad=0.45))
        pin_y = int(self.H * 0.26)
        drop = ease_out_back(lt / 0.5)
        a = min(1.0, (dur - lt) / 0.3)
        cx = self.W // 2
        cv2.circle(frame, (cx, pin_y + int(size * 1.2)), int(size * 0.35 * drop), hex_bgr(self.accent), -1, cv2.LINE_AA)
        r = int(size * 0.9 * (1 + 0.6 * ((lt * 1.4) % 1)))
        ov = frame.copy()
        cv2.circle(ov, (cx, pin_y + int(size * 1.2)), r, hex_bgr(self.accent), max(2, size // 10), cv2.LINE_AA)
        cv2.addWeighted(ov, 0.5 * (1 - (lt * 1.4) % 1) * a, frame, 1 - 0.5 * (1 - (lt * 1.4) % 1) * a, 0, frame)
        blit(frame, card, cx, pin_y - int((1 - drop) * size), 1.0, a)

    def _end_card(self, frame, g, lt, dur, k):
        dim = min(0.55, lt / 0.4 * 0.55)
        frame[:] = (frame.astype(np.float32) * (1 - dim)).astype(np.uint8)
        y = int(self.H * 0.40)
        logo = None
        if self.brand.get("logo") and Path(self.brand["logo"]).exists():
            logo = load_rgba(self.brand["logo"], int(self.W * 0.28))
        if logo is not None:
            blit(frame, logo, self.W // 2, y, ease_out_back(lt / 0.45), min(1.0, lt / 0.2))
            y += logo.shape[0] // 2 + int(self.H * 0.05)
        size = int(self.H * (0.045 if self.H > self.W else 0.06))
        cta = self._cached(("ec", k), lambda: text_rgba(g["text"], self.title_font, size, fill=(20, 20, 20, 255),
                                                        box=_rgb(self.accent), pad=0.45))
        blit(frame, cta, self.W // 2, y + cta.shape[0] // 2, 0.7 + 0.3 * ease_out_back((lt - 0.15) / 0.4),
             min(1.0, max(0.0, (lt - 0.15) / 0.2)))
        if g.get("handle"):
            hd = self._cached(("eh", k), lambda: text_rgba(g["handle"], "Heebo Medium", int(size * 0.6)))
            blit(frame, hd, self.W // 2, y + cta.shape[0] + hd.shape[0], 1.0, min(1.0, max(0.0, (lt - 0.35) / 0.25)))

    def _tracked_label(self, frame, g, lt, dur, k):
        """Label that follows an object: g['track'] = [[t, x, y], ...] normalized output coords."""
        tr = g.get("track") or []
        if not tr:
            return
        ts = [p[0] for p in tr]
        x = float(np.interp(g["start"] + lt, ts, [p[1] for p in tr])) * self.W
        y = float(np.interp(g["start"] + lt, ts, [p[2] for p in tr])) * self.H
        size = int(self.H * 0.03)
        im = self._cached(("tl", k), lambda: text_rgba(g["text"], self.title_font, size, fill=(20, 20, 20, 255),
                                                       box=_rgb(self.accent), pad=0.4))
        a = min(1.0, lt / 0.2, (dur - lt) / 0.2)
        ly = int(y - self.H * 0.09)
        cv2.line(frame, (int(x), int(y)), (int(x), ly + im.shape[0] // 2), (255, 255, 255), max(2, size // 12), cv2.LINE_AA)
        cv2.circle(frame, (int(x), int(y)), max(4, size // 4), hex_bgr(self.accent), -1, cv2.LINE_AA)
        blit(frame, im, int(x), ly, ease_out_back(lt / 0.3), a)


def track_point(video: str, t0: float, t1: float, x: float, y: float, fps: float = 15) -> list[list[float]]:
    """Follow an object from (x, y) normalized at t0 with a CSRT tracker; returns [[t, x, y], ...]."""
    cap = cv2.VideoCapture(video)
    cap.set(cv2.CAP_PROP_POS_MSEC, t0 * 1000)
    ok, f = cap.read()
    if not ok:
        return []
    h, w = f.shape[:2]
    bw, bh = int(w * 0.12), int(h * 0.12)
    box = (int(x * w - bw / 2), int(y * h - bh / 2), bw, bh)
    tracker = cv2.TrackerCSRT_create()
    tracker.init(f, box)
    out = [[t0, x, y]]
    t = t0
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, int(src_fps / fps))
    while t < t1:
        for _ in range(step - 1):
            cap.grab()
        ok, f = cap.read()
        if not ok:
            break
        t += step / src_fps
        ok, b = tracker.update(f)
        if ok:
            out.append([round(t, 3), (b[0] + b[2] / 2) / w, (b[1] + b[3] / 2) / h])
    cap.release()
    return out


def extract_stats(text: str) -> list[dict]:
    """Numbers worth animating from a brief/transcript: prices, sizes, rooms, percentages."""
    out = []
    pats = [
        (r"(\d[\d,\.]*)\s*(?:מ\"ר|מ״ר|מטר|sqm|m2|sq ?ft)", "", " מ״ר", "שטח"),
        (r"(\d+(?:\.\d+)?)\s*(?:חדרים|חד'|rooms|bedrooms)", "", "", "חדרים"),
        (r"(?:₪|ש\"ח|ש״ח)\s*(\d[\d,\.]*)|(\d[\d,\.]*)\s*(?:₪|ש\"ח|ש״ח|שקל)", "₪", "", "מחיר"),
        (r"\$\s*(\d[\d,\.]*)", "$", "", "Price"),
        (r"(\d+(?:\.\d+)?)\s*%", "", "%", ""),
        (r"(\d+(?:\.\d+)?)\s*(?:מיליון|million|M\b)", "", "M", ""),
    ]
    for pat, pre, suf, label in pats:
        for m in re.finditer(pat, text, re.I):
            num = next(g for g in m.groups() if g)
            try:
                val = float(num.replace(",", ""))
            except ValueError:
                continue
            out.append({"value": val, "prefix": pre, "suffix": suf, "label": label})
    return out[:3]

"""Render an EDL to a finished video.

Pipeline (single lossy encode, no double compression):
  per-clip ffmpeg decode (trim, speed, colour correction + LUT) -> raw frames ->
  Python compositor (inpaint, reframe/zoom, background, B-roll, transitions, emoji, progress bar, logo) ->
  ffmpeg (ASS captions/titles, audio mix with ducking + loudness mastering) -> H.264/H.265 file.
"""
from __future__ import annotations

import json
import logging
import math
import subprocess
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from . import audio as audio_mod
from . import captions, color, config, overlays, reframe, timeline
from .background import Background, cover_fit
from .inpaint import Inpainter
from .media import probe, run

log = logging.getLogger(__name__)

ProgressFn = Callable[[float, str], None]


# --------------------------------------------------------------------------- clip decoding
class ClipReader:
    """Streams colour-corrected frames of one clip from ffmpeg (no temp files)."""

    def __init__(self, src: dict, clip: dict, fps: int, vf_color: str, max_side: int = 2560):
        self.fps = fps
        speed = float(clip.get("speed", 1.0))
        dur_src = clip["out"] - clip["in"]
        self.n = max(1, int(round(dur_src / speed * fps)))
        w, h = src["w"], src["h"]
        s = min(1.0, max_side / max(w, h))
        self.w, self.h = int(w * s) // 2 * 2, int(h * s) // 2 * 2
        vf = [f"scale={self.w}:{self.h}:flags=lanczos"]
        if src["kind"] == "image":
            inp = ["-loop", "1", "-framerate", str(fps), "-t", f"{dur_src / speed + 0.5:.3f}", "-i", src["path"]]
        else:
            inp = ["-ss", f"{clip['in']:.3f}", "-t", f"{dur_src + 0.2:.3f}", "-i", src["path"]]
            if speed != 1.0:
                vf.insert(0, f"setpts=PTS/{speed:.4f}")
        vf += [f"fps={fps}"]
        if vf_color:
            vf.append(vf_color)
        vf.append("format=bgr24")
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", *inp, "-vf", ",".join(vf), "-frames:v", str(self.n),
               "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=self.w * self.h * 3 * 4)
        self.last: np.ndarray | None = None
        self.count = 0

    def read(self) -> np.ndarray:
        size = self.w * self.h * 3
        buf = self.proc.stdout.read(size) if self.count < self.n else b""
        if len(buf) == size:
            self.last = np.frombuffer(buf, np.uint8).reshape(self.h, self.w, 3).copy()
        elif self.last is None:
            self.last = np.zeros((self.h, self.w, 3), np.uint8)
        self.count += 1
        return self.last.copy()

    def close(self):
        try:
            self.proc.stdout.close()
            self.proc.kill()
            self.proc.wait(timeout=5)
        except Exception:
            pass


class BrollReader:
    def __init__(self, path: str, W: int, H: int):
        self.cap = cv2.VideoCapture(path)
        self.img = None
        if not self.cap.isOpened() or int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT)) <= 1:
            self.img = cv2.imread(path)
        self.W, self.H = W, H

    def frame(self, progress: float) -> np.ndarray | None:
        if self.img is not None:
            f = self.img
        else:
            ok, f = self.cap.read()
            if not ok:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, f = self.cap.read()
                if not ok:
                    return None
        z = 1.0 + 0.06 * progress  # gentle push-in keeps cutaways alive
        big = cover_fit(f, int(self.W * z), int(self.H * z))
        y0, x0 = (big.shape[0] - self.H) // 2, (big.shape[1] - self.W) // 2
        return big[y0:y0 + self.H, x0:x0 + self.W]


# --------------------------------------------------------------------------- helpers
def _ease(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def _zoom_crop(img: np.ndarray, zoom: float, cx: float = 0.5, cy: float = 0.5) -> np.ndarray:
    if zoom <= 1.001:
        return img
    h, w = img.shape[:2]
    nw, nh = w / zoom, h / zoom
    x0 = min(max(0, cx * w - nw / 2), w - nw)
    y0 = min(max(0, cy * h - nh / 2), h - nh)
    m = np.float32([[zoom, 0, -x0 * zoom], [0, zoom, -y0 * zoom]])
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def _motion_blur(img: np.ndarray, k: int, horizontal: bool = True) -> np.ndarray:
    if k < 3:
        return img
    kernel = np.zeros((k, k), np.float32)
    if horizontal:
        kernel[k // 2, :] = 1.0 / k
    else:
        kernel[:, k // 2] = 1.0 / k
    return cv2.filter2D(img, -1, kernel)


def source_color_filters(plan: dict) -> dict[str, str]:
    col = plan.get("color", {})
    out = {}
    if not col.get("enabled", True):
        return {sid: "" for sid in plan["sources"]}
    for sid, src in plan["sources"].items():
        if src["kind"] not in ("video", "image"):
            continue
        if src.get("stats"):
            stats = src["stats"]
        elif src["kind"] == "image":
            img = cv2.imread(src["path"])
            stats = color.frame_stats([cv2.resize(img, (320, int(320 * img.shape[0] / img.shape[1])))] if img is not None else [])
        else:
            stats = color.frame_stats(color.sample_frames(src["path"]))
        src["stats"] = stats
        out[sid] = color.auto_correct_filter(stats, col)
    return out


# --------------------------------------------------------------------------- audio
def build_voice(plan: dict, lay: list[dict], out: Path) -> Path:
    srcs = plan["sources"]
    inputs, idx = [], {}
    for c in lay:
        s = srcs[c["src"]]
        if c.get("audio", True) and s.get("has_audio") and c["src"] not in idx:
            idx[c["src"]] = len(inputs)
            inputs += ["-i", s["path"]]
    parts, labels = [], []
    for k, c in enumerate(lay):
        dur = c["t1"] - c["t0"]
        s = srcs[c["src"]]
        if c.get("audio", True) and s.get("has_audio"):
            sp = float(c.get("speed", 1.0))
            tempo = f",atempo={sp:.4f}" if abs(sp - 1) > 1e-3 and 0.5 <= sp <= 2 else ""
            fade = min(0.015, dur / 4)
            parts.append(f"[{idx[c['src']]}:a]atrim={c['in']:.4f}:{c['out']:.4f},asetpts=PTS-STARTPTS{tempo},"
                         f"aformat=sample_rates=48000:channel_layouts=mono,"
                         f"afade=t=in:d={fade:.3f},afade=t=out:st={max(0, dur - fade):.4f}:d={fade:.3f},"
                         f"apad=whole_dur={dur:.4f},atrim=0:{dur:.4f}[a{k}]")
        else:
            parts.append(f"aevalsrc=0:d={dur:.4f}:s=48000:c=mono[a{k}]")
        labels.append(f"[a{k}]")
    denoise = plan.get("audio", {}).get("denoise", True)
    chain = audio_mod.VOICE_CHAIN if denoise else "anull"
    graph = ";".join(parts) + f";{''.join(labels)}concat=n={len(labels)}:v=0:a=1,{chain}[v]"
    if not inputs:
        graph = graph.replace(f",{chain}[v]", "[v]")
    run(["ffmpeg", *inputs, "-filter_complex", graph, "-map", "[v]", "-ar", "48000", "-ac", "1", str(out)])
    return out


def sfx_events(plan: dict, lay: list[dict], owords: list[dict], duration: float) -> list[dict]:
    if not plan.get("sfx", {}).get("enabled", True):
        return []
    ev = []
    for tr in plan.get("transitions", []):
        k = tr.get("after_clip")
        if k is None or k >= len(lay) - 1 or not tr.get("sfx"):
            continue
        ev.append({"t": lay[k]["t1"], "type": tr["sfx"], "gain_db": tr.get("sfx_db", -13)})
    if plan.get("title", {}).get("text"):
        ev.append({"t": 0.03, "type": plan["title"].get("sfx", "impact"), "gain_db": -15})
    for e in plan.get("emojis", []):
        t = timeline.word_time(owords, e["word"])
        if t is not None:
            ev.append({"t": t, "type": "pop", "gain_db": -17})
    for p in plan.get("punch", []):
        t = timeline.word_time(owords, p["word"])
        if t is not None and p.get("sfx"):
            ev.append({"t": t, "type": p["sfx"], "gain_db": -16})
    if plan.get("cta", {}).get("text"):
        ev.append({"t": max(0.0, duration - plan["cta"].get("dur", 3.0)), "type": "ding", "gain_db": -15})
    # avoid machine-gun SFX: keep at least 0.35s spacing
    ev.sort(key=lambda e: e["t"])
    out = []
    for e in ev:
        if not out or e["t"] - out[-1]["t"] > 0.35:
            out.append(e)
    return out


# --------------------------------------------------------------------------- main render
def render(plan: dict, out_path: str | Path, workdir: str | Path, progress: ProgressFn | None = None,
           preview: bool = False, encoder: dict | None = None) -> dict:
    progress = progress or (lambda f, m: None)
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    meta = plan["meta"]
    W, H = meta["width"], meta["height"]
    if preview:
        W, H = int(W * 0.5) // 2 * 2, int(H * 0.5) // 2 * 2
    fps = int(meta.get("fps", config.FPS))
    lay = timeline.layout(plan)
    duration = lay[-1]["t1"]
    n_frames = int(round(duration * fps))
    owords = timeline.output_words(plan, lay)

    progress(0.02, "מכין אודיו")
    voice = build_voice(plan, lay, workdir / "voice.wav")
    energy = audio_mod.speech_energy(voice)
    music_wav = None
    mus = plan.get("music", {})
    if mus.get("enabled", True) and mus.get("path") and Path(mus["path"]).exists():
        music_wav = audio_mod.prepare_music(Path(mus["path"]), duration, workdir / "music.wav", mus.get("volume_db", -19))
    sfx_wav = audio_mod.build_sfx_track(sfx_events(plan, lay, owords, duration), duration, workdir / "sfx.wav")

    # captions / titles
    cap_style = plan.get("captions", {})
    spec = config.PLATFORMS.get(meta.get("platform", "tiktok"), config.PLATFORMS["tiktok"])
    ass_path = workdir / "captions.ass"
    title = dict(plan.get("title", {}))
    if title.get("text"):
        title.setdefault("start", 0.0)
        title["end"] = title.get("start", 0.0) + title.get("dur", 2.6)
    cta = dict(plan.get("cta", {}))
    if cta.get("text"):
        cta["start"] = max(0.0, duration - cta.get("dur", 3.0))
        cta["end"] = duration
    cap_words = owords if cap_style.get("enabled", True) else []
    ass = captions.build_ass(cap_words, cap_style, W, H, duration, title=title, cta=cta,
                             safe_bottom=spec["safe_bottom"], energy=energy, brand=plan.get("brand"))
    ass_path.write_text(ass, encoding="utf-8")

    # per-frame effect schedules -------------------------------------------------
    punches = []
    for p in plan.get("punch", []):
        t = timeline.word_time(owords, p["word"])
        if t is None:
            continue
        clip = next((c for c in lay if c["t0"] <= t < c["t1"]), None)
        end = min(t + p.get("hold", 1.4), clip["t1"] if clip else t + 1.4)
        punches.append((t, end, p.get("scale", 1.15), p.get("style", "snap")))
    trans = {}
    for tr in plan.get("transitions", []):
        k = tr.get("after_clip")
        if k is not None and k < len(lay) - 1 and tr.get("type", "cut") != "cut":
            trans[k] = tr["type"]
    emojis = []
    cap_y = int(H * min(float(cap_style.get("position", 0.64)), 1 - spec["safe_bottom"] - 0.04))
    for j, e in enumerate(plan.get("emojis", [])):
        t = timeline.word_time(owords, e["word"])
        if t is None:
            continue
        rgba = overlays.emoji_rgba(e["emoji"], int(W * 0.16))
        side = -1 if j % 2 else 1
        emojis.append((t, t + e.get("dur", 1.5), rgba, W // 2 + side * int(W * 0.24), cap_y - int(H * 0.11)))
    cta_emoji = None
    if cta.get("text"):
        ems = captions.split_emoji(cta["text"])[1]
        if ems:
            cta_emoji = overlays.emoji_rgba(ems[0], int(W * 0.13))
    brolls = []
    for b in plan.get("broll", []):
        t = timeline.word_time(owords, b["word"]) if "word" in b else b.get("t")
        if t is None or not b.get("path") or not Path(b["path"]).exists():
            continue
        brolls.append([t, t + b.get("dur", 1.8), b["path"], None])

    # sources: tracks, inpainting, background ---------------------------------
    color_vf = source_color_filters(plan)
    tracks = {}
    for sid, s in plan["sources"].items():
        if s["kind"] == "video" and plan.get("reframe", {}).get("enabled", True):
            tr_path = workdir / f"track_{sid}.json"
            if s.get("track"):
                tracks[sid] = s["track"]
            elif tr_path.exists():
                tracks[sid] = json.loads(tr_path.read_text())
            else:
                progress(0.05, "מעקב פנים")
                tracks[sid] = reframe.track(s["path"])
                tr_path.write_text(json.dumps(tracks[sid]))
    cam_paths = {}
    for sid, trk in tracks.items():
        s = plan["sources"][sid]
        n_src = int(s["duration"] * fps) + 2
        cam_paths[sid] = reframe.camera_path(trk, n_src, fps)
    bg_cfg = plan.get("background", {"mode": "none"})
    bg = Background(bg_cfg.get("mode", "none"), bg_cfg.get("value"), bg_cfg.get("engine", "mediapipe"))
    logo = None
    brand = plan.get("brand") or {}
    if brand.get("logo") and Path(brand["logo"]).exists():
        logo = overlays.load_rgba(brand["logo"], int(W * 0.14))
    pb = plan.get("progress_bar", {})
    pb_color = brand.get("accent_color") or pb.get("color") or cap_style.get("highlight_color", "#FFE14D")

    # encoder ---------------------------------------------------------------------
    enc = encoder or {}
    vcodec = enc.get("vcodec", "libx264")
    venc = ["-c:v", vcodec, "-preset", "veryfast" if preview else enc.get("preset", "medium")]
    if enc.get("bitrate"):
        venc += ["-b:v", enc["bitrate"], "-maxrate", enc.get("maxrate", enc["bitrate"]), "-bufsize", enc.get("bufsize", "2M")]
    else:
        venc += ["-crf", str(28 if preview else enc.get("crf", 18))]
    if vcodec == "libx264":
        venc += ["-profile:v", "high", "-level", "4.2"]
    elif vcodec == "libx265":
        venc += ["-tag:v", "hvc1"]
    inputs = ["-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-i", str(voice)]
    mi = si = None
    if music_wav:
        mi = 2
        inputs += ["-i", str(music_wav)]
    if sfx_wav:
        si = 3 if music_wav else 2
        inputs += ["-i", str(sfx_wav)]
    afilter, alabel = audio_mod.mix_filter(bool(music_wav), bool(sfx_wav), spec["lufs"],
                                            mus.get("duck_db", -11), 1, mi or 2, si or 3)
    fonts = config.FONTS_DIR.as_posix()
    vfilter = f"[0:v]ass='{ass_path.as_posix()}':fontsdir='{fonts}',format=yuv420p[vout]"
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs,
           "-filter_complex", f"{vfilter};{afilter}", "-map", "[vout]", "-map", alabel,
           *venc, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", enc.get("abitrate", "192k"),
           "-movflags", "+faststart", "-t", f"{duration:.3f}", str(out_path)]
    enc_proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    # compositor loop ---------------------------------------------------------------
    inpainters: dict[str, Inpainter] = {}
    reader: ClipReader | None = None
    cur_clip = -1
    prev_last: np.ndarray | None = None
    push = 0.035 if plan.get("camera_motion", "slow_push") == "slow_push" else 0.0
    try:
        for fi in range(n_frames):
            t = fi / fps
            k = cur_clip if cur_clip >= 0 and lay[cur_clip]["t0"] <= t < lay[cur_clip]["t1"] else \
                next((c["index"] for c in lay if c["t0"] <= t < c["t1"]), len(lay) - 1)
            c = lay[k]
            if k != cur_clip:
                if reader is not None:
                    reader.close()
                src = plan["sources"][c["src"]]
                reader = ClipReader(src, c, fps, color_vf.get(c["src"], ""))
                cur_clip = k
                if src.get("inpaint") and c["src"] not in inpainters:
                    inpainters[c["src"]] = Inpainter(src["inpaint"], reader.w, reader.h)
            raw = reader.read()
            if c["src"] in inpainters:
                raw = inpainters[c["src"]].apply(raw)
            local = (t - c["t0"]) / max(1e-6, c["t1"] - c["t0"])
            zoom = float(c.get("zoom", 1.0)) * (1 + push * local)
            for (p0, p1, sc, style) in punches:
                if p0 <= t < p1 + 0.12:
                    ramp = 0.06 if style == "snap" else 0.35
                    a = _ease((t - p0) / ramp) if t < p1 else 1 - _ease((t - p1) / 0.12)
                    zoom *= 1 + (sc - 1) * a
            # transition into/out of boundaries
            tr_in = trans.get(k - 1)
            tr_out = trans.get(k)
            blur_k, flash, whip_dx = 0, 0.0, 0.0
            win = 0.16
            if tr_in and t - c["t0"] < win:
                x = 1 - (t - c["t0"]) / win
                if tr_in == "zoom":
                    zoom *= 1 + 0.25 * x * x
                    blur_k = int(12 * x)
                elif tr_in == "whip":
                    whip_dx = -x
                    blur_k = int(60 * x)
                elif tr_in == "flash":
                    flash = x * 0.85
            if tr_out and c["t1"] - t < win:
                x = 1 - (c["t1"] - t) / win
                if tr_out == "zoom":
                    zoom *= 1 + 0.18 * x * x
                    blur_k = max(blur_k, int(10 * x))
                elif tr_out == "whip":
                    whip_dx = x
                    blur_k = max(blur_k, int(60 * x))
            # framing
            motion = c.get("motion") or {}
            if c["src"] in cam_paths:
                path = cam_paths[c["src"]]
                si_ = min(len(path) - 1, int((c["in"] + (t - c["t0"]) * float(c.get("speed", 1.0))) * fps))
                cx, cy = path[si_]
                head_room = 0.36
            elif motion.get("from"):
                e = _ease(local)
                fr, to = motion["from"], motion["to"]
                cx = fr[0] + (to[0] - fr[0]) * e
                cy = fr[1] + (to[1] - fr[1]) * e
                zoom *= fr[2] + (to[2] - fr[2]) * e
                head_room = 0.5
            else:
                cx, cy, head_room = 0.5, 0.5, 0.5
            x0, y0, cw, ch = reframe.crop_rect(reader.w, reader.h, W, H, cx, cy, zoom=max(1.0, zoom), head_room=head_room)
            crop = raw[y0:y0 + ch, x0:x0 + cw]
            interp = cv2.INTER_AREA if cw > W else cv2.INTER_CUBIC
            frame = cv2.resize(crop, (W, H), interpolation=interp)
            if cw < W * 0.8:  # recover perceived sharpness when upscaling
                blur = cv2.GaussianBlur(frame, (0, 0), 1.2)
                frame = cv2.addWeighted(frame, 1.35, blur, -0.35, 0)
            frame = bg.apply(frame)
            # cutaway B-roll
            for b in brolls:
                if b[0] <= t < b[1]:
                    if b[3] is None:
                        b[3] = BrollReader(b[2], W, H)
                    bf = b[3].frame((t - b[0]) / (b[1] - b[0]))
                    if bf is not None:
                        fade = min(1.0, (t - b[0]) / 0.1, (b[1] - t) / 0.1)
                        frame = cv2.addWeighted(bf, fade, frame, 1 - fade, 0)
            # crossfade from previous clip's last frame
            if c.get("fade_in") and prev_last is not None and t - c["t0"] < c["fade_in"]:
                a = _ease((t - c["t0"]) / c["fade_in"])
                frame = cv2.addWeighted(frame, a, prev_last, 1 - a, 0)
            if blur_k >= 3:
                if whip_dx:
                    shift = int(whip_dx * W * 0.35)
                    frame = np.roll(frame, shift, axis=1)
                frame = _motion_blur(frame, blur_k | 1, horizontal=True)
            if flash > 0:
                frame = cv2.addWeighted(frame, 1 - flash, np.full_like(frame, 255), flash, 0)
            for (e0, e1, rgba, ex, ey) in emojis:
                if e0 <= t < e1:
                    s_ = overlays.pop_curve(t - e0)
                    a_ = min(1.0, (e1 - t) / 0.15)
                    wob = 6 * math.sin((t - e0) * 7)
                    overlays.blit(frame, rgba, ex, ey + int(4 * math.sin((t - e0) * 5)), s_, a_, wob)
            if cta_emoji is not None and cta.get("start") is not None and t >= cta["start"]:
                overlays.blit(frame, cta_emoji, W // 2, int(H * (1 - spec["safe_bottom"] - 0.14)),
                              overlays.pop_curve(t - cta["start"] - 0.15), 1.0)
            if logo is not None:
                overlays.blit(frame, logo, W - logo.shape[1] // 2 - int(W * 0.04), int(H * spec["safe_top"]) + logo.shape[0] // 2, 1.0, 0.85)
            if pb.get("enabled", True):
                overlays.progress_bar(frame, (t + 1 / fps) / duration, pb_color, height=max(6, H // 190))
            if c["t1"] - t <= 1.0 / fps + 1e-6:
                prev_last = frame.copy()
            enc_proc.stdin.write(frame.tobytes())
            if fi % 15 == 0:
                progress(0.08 + 0.9 * fi / max(1, n_frames), "מרנדר")
    finally:
        if reader is not None:
            reader.close()
        for b in brolls:
            if b[3] is not None:
                b[3].cap.release()
        try:
            enc_proc.stdin.close()
        except Exception:
            pass
        err = enc_proc.stderr.read().decode(errors="ignore")
        code = enc_proc.wait()
    if code != 0:
        raise RuntimeError(f"encoder failed: {err[-2000:]}")
    progress(1.0, "הסתיים")
    info = probe(out_path)
    return {"path": str(out_path), "duration": info.duration, "width": info.width, "height": info.height,
            "frames": n_frames, "words": len(owords)}

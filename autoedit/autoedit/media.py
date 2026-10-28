"""ffmpeg / ffprobe helpers."""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np


class FFmpegError(RuntimeError):
    pass


def run(cmd: list[str], quiet: bool = True) -> subprocess.CompletedProcess:
    if cmd[0] == "ffmpeg" and quiet:
        cmd = [cmd[0], "-hide_banner", "-loglevel", "error", "-y", *cmd[1:]]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise FFmpegError(f"{' '.join(map(str, cmd[:6]))}... failed:\n{proc.stderr[-3000:]}")
    return proc


@dataclass
class MediaInfo:
    path: str
    duration: float
    width: int
    height: int
    fps: float
    rotation: int
    has_audio: bool

    @property
    def display_size(self) -> tuple[int, int]:
        if self.rotation in (90, 270, -90):
            return self.height, self.width
        return self.width, self.height


def probe(path: str | Path) -> MediaInfo:
    out = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)]).stdout
    data = json.loads(out)
    v = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
    dur = float(data["format"].get("duration") or (v or a or {}).get("duration") or 0)
    if v is None:
        return MediaInfo(str(path), dur, 0, 0, 0.0, 0, a is not None)
    num, den = (v.get("avg_frame_rate") or v.get("r_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den) if float(den) else 30.0
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    rot = int(v.get("tags", {}).get("rotate", rot))
    return MediaInfo(str(path), dur, int(v["width"]), int(v["height"]), fps, rot, a is not None)


def load_audio(path: str | Path, sr: int = 16000) -> np.ndarray:
    """Decode any media file to mono float32 PCM."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-f", "s16le", "-ac", "1", "-ar", str(sr), "-"],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise FFmpegError(proc.stderr.decode(errors="ignore")[-2000:])
    return np.frombuffer(proc.stdout, np.int16).astype(np.float32) / 32768.0


def write_wav(path: str | Path, audio: np.ndarray, sr: int) -> None:
    import soundfile as sf

    sf.write(str(path), np.clip(audio, -1, 1).astype(np.float32), sr, subtype="PCM_16")


def extract_frame(path: str | Path, t: float, out: str | Path, width: int | None = None) -> None:
    vf = ["-vf", f"scale={width}:-2"] if width else []
    run(["ffmpeg", "-ss", f"{t:.3f}", "-i", str(path), "-frames:v", "1", *vf, str(out)])

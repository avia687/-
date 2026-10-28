"""Generate a realistic 'raw talking-head' sample: speaker off-center in 16:9, long pauses,
filler words, a repeated phrase, background hiss and a static corner watermark."""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

SR = 44100

LINES = {
    "en": [
        ("Stop doing crunches if you want flat abs.", 0.9),
        ("Um,", 0.8),
        ("here are three exercises that will change your body in thirty days.", 1.4),
        ("The first one is the plank.", 0.3),
        ("The first one is the plank.", 0.6),
        ("Hold it for sixty seconds and keep your back straight.", 1.6),
        ("Uh,", 0.7),
        ("The second one is the dead bug, the secret move nobody talks about.", 1.2),
        ("And the third one is the hanging leg raise.", 0.5),
        ("It burns fat and builds real core strength.", 1.8),
        ("Follow for more simple fitness tips.", 0.8),
    ],
    "he": [
        ("תפסיקו לעשות בטן ככה.", 0.9),
        ("אממ,", 0.8),
        ("הנה שלושה תרגילים שישנו לכם את הגוף.", 1.3),
        ("התרגיל הראשון הוא פלאנק.", 1.0),
        ("תחזיקו שישים שניות עם גב ישר.", 1.5),
        ("עקבו לעוד טיפים.", 0.6),
    ],
}


def tts(text: str, lang: str, out: Path) -> np.ndarray:
    voice = "he" if lang == "he" else "en-us+m3"
    subprocess.run(["espeak-ng", "-v", voice, "-s", "165", "-w", str(out), text], check=True)
    import soundfile as sf

    a, sr = sf.read(str(out))
    if sr != SR:
        import librosa

        a = librosa.resample(a, orig_sr=sr, target_sr=SR)
    return a.astype(np.float32)


def make_audio(lang: str, tmp: Path, short: bool = False) -> np.ndarray:
    parts = [np.zeros(int(0.6 * SR), np.float32)]
    lines = LINES[lang][:5] if short else LINES[lang]
    for k, (txt, pause) in enumerate(lines):
        parts.append(tts(txt, lang, tmp / f"l{k}.wav") * 0.8)
        parts.append(np.zeros(int(pause * SR), np.float32))
    a = np.concatenate(parts)
    rng = np.random.default_rng(0)
    a += rng.standard_normal(a.size).astype(np.float32) * 0.006  # room hiss
    return a


def find_face_image() -> np.ndarray:
    for p in (Path(__file__).parent / "data" / "face.jpg", Path("/tmp/sample/lena.jpg")):
        if p.exists():
            return cv2.imread(str(p))
    raise FileNotFoundError("tests/data/face.jpg missing")


def make_video(out: Path, lang: str = "en", size=(1920, 1080), fps=30, short: bool = False) -> Path:
    tmp = Path(tempfile.mkdtemp())
    audio = make_audio(lang, tmp, short)
    import soundfile as sf

    wav = tmp / "a.wav"
    sf.write(str(wav), audio, SR)
    dur = audio.size / SR
    W, H = size
    face = find_face_image()
    fh = int(H * 0.62)
    face = cv2.resize(face, (int(face.shape[1] * fh / face.shape[0]), fh))
    # soft oval matte so the "speaker" blends onto the set
    mask = np.zeros(face.shape[:2], np.float32)
    cv2.ellipse(mask, (face.shape[1] // 2, face.shape[0] // 2), (face.shape[1] // 2 - 4, face.shape[0] // 2 - 4), 0, 0, 360, 1, -1)
    mask = cv2.GaussianBlur(mask, (31, 31), 0)[..., None]
    # set: dim gradient room
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    bg = np.stack([60 + 40 * xx / W, 55 + 30 * yy / H, 70 + 20 * (1 - xx / W)], -1).astype(np.uint8)
    cv2.rectangle(bg, (150, 200), (520, 900), (40, 70, 110), -1)  # "shelf"
    cv2.rectangle(bg, (1550, 120), (1800, 380), (90, 120, 150), -1)  # "frame"
    proc = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{W}x{H}", "-r", str(fps), "-i", "-", "-i", str(wav), "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", str(out)],
        stdin=subprocess.PIPE)
    n = int(dur * fps)
    for i in range(n):
        t = i / fps
        frame = bg.copy()
        cx = int(W * 0.66 + 40 * np.sin(t * 0.7))  # speaker sways, off-center right
        cy = int(H * 0.50 + 12 * np.sin(t * 1.3))
        x0, y0 = cx - face.shape[1] // 2, cy - face.shape[0] // 2
        roi = frame[y0:y0 + face.shape[0], x0:x0 + face.shape[1]].astype(np.float32)
        frame[y0:y0 + face.shape[0], x0:x0 + face.shape[1]] = (roi * (1 - mask) + face * mask).astype(np.uint8)
        # static watermark top-left (to test logo removal)
        cv2.putText(frame, "@rawcam", (40, 70), cv2.FONT_HERSHEY_DUPLEX, 1.4, (235, 235, 235), 2, cv2.LINE_AA)
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    proc.wait()
    return out


if __name__ == "__main__":
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"
    print(make_video(Path(sys.argv[1]), lang))

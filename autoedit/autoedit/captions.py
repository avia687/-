"""Animated ASS subtitles: word-by-word karaoke highlight, keyword emphasis, hook title, CTA.
Hebrew/Arabic text is rendered RTL by libass (fribidi); Latin text can be uppercased."""
from __future__ import annotations

import re

from .transcribe import is_rtl


def ass_color(hex_color: str, alpha: int = 0) -> str:
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ts(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]+")


def split_emoji(text: str) -> tuple[str, list[str]]:
    """libass can't draw colour emoji -> strip them; the compositor renders them as images."""
    return EMOJI_RE.sub("", text).strip(), EMOJI_RE.findall(text)


def wrap_words(words: list[str], max_chars: int) -> list[list[str]]:
    """Balanced wrapping: lines of similar width read better than a greedy fill."""
    import math

    total = sum(len(w) + 1 for w in words) - 1
    n = max(1, math.ceil(total / max_chars))
    target = max(max(len(w) for w in words), math.ceil(total / n)) if words else max_chars
    lines, cur = [], []
    for w in words:
        if cur and sum(len(x) + 1 for x in cur) + len(w) > target + 2:
            lines.append(cur)
            cur = []
        cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", " ")


def group_words(words: list[dict], per_group: int, max_chars: int, gap_break: float = 0.45) -> list[list[dict]]:
    groups: list[list[dict]] = []
    cur: list[dict] = []
    for w in words:
        if cur:
            gap = w["start"] - cur[-1]["end"]
            chars = sum(len(x["text"]) + 1 for x in cur) + len(w["text"])
            sentence_end = bool(re.search(r"[.!?…]$", cur[-1]["text"]))
            if len(cur) >= per_group or chars > max_chars or gap > gap_break or sentence_end or w.get("sid") != cur[-1].get("sid"):
                groups.append(cur)
                cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    return groups


def clean_word(text: str, upper: bool, rtl: bool) -> str:
    t = text.strip()
    t = re.sub(r"[,;:]+$", "", t)  # trailing commas look amateur on screen
    if t.endswith(".") and not t.endswith(".."):
        t = t[:-1]
    if upper and not rtl:
        t = t.upper()
    return esc(t)


def build_ass(words: list[dict], style: dict, width: int, height: int, duration: float,
              title: dict | None = None, cta: dict | None = None, safe_bottom: float = 0.2,
              energy: list[float] | None = None, brand: dict | None = None) -> str:
    """words: output-timeline [{text, start, end, emph, sid}]."""
    rtl = any(is_rtl(w["text"]) for w in words[:30]) or bool(title and is_rtl(title.get("text", "")))
    font = style.get("font_he") if rtl else style.get("font")
    if brand and brand.get("caption_font"):
        font = brand["caption_font"]
    size = int(height * float(style.get("size", 0.068)) * (0.9 if rtl else 1.0))
    if width > height:  # landscape: smaller relative captions
        size = int(size * 0.75)
    color = ass_color(style.get("color", "#FFFFFF"))
    hl = style.get("highlight_color", "#FFE14D")
    if brand and brand.get("accent_color"):
        hl = brand["accent_color"]
    hl_c = ass_color(hl)
    outline_c = ass_color(style.get("outline_color", "#000000"))
    outline = max(2, int(style.get("outline", 7) * height / 1920))
    shadow = max(0, int(style.get("shadow", 3) * height / 1920))
    box_mode = style.get("highlight_mode") == "box"
    box_c = ass_color(style.get("box_color", "#7B2FF7"))
    pos_y = float(style.get("position", 0.64))
    pos_y = min(pos_y, 1 - safe_bottom - 0.04)
    y = int(height * pos_y)
    x = width // 2
    upper = bool(style.get("uppercase", True))
    per_group = int(style.get("words_per_group", 3))
    max_chars = 18 if width < height else 34
    pop = style.get("animation", "pop") == "pop"
    enc = -1 if rtl else 1  # -1 = libass auto base direction (proper RTL paragraphs)

    title_font = font
    title_size = int(size * 1.05)
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: TV.709",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Cap,{font},{size},{color},{hl_c},{outline_c},&H80000000,0,0,0,0,100,100,0,0,1,{outline},{shadow},5,40,40,0,{enc}",
        f"Style: Title,{title_font},{title_size},&H00FFFFFF,{hl_c},{box_c},&H00000000,0,0,0,0,100,100,0,0,3,{int(size*0.28)},0,8,60,60,{int(height*0.13)},{enc}",
        f"Style: CTA,{font},{int(size*0.85)},&H00FFFFFF,{hl_c},{box_c},&H00000000,0,0,0,0,100,100,0,0,3,{int(size*0.3)},0,8,60,60,{int(height*0.16)},{enc}",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    def loud(t: float) -> float:
        if not energy:
            return 0.5
        i = int(t * 10)
        return energy[min(max(i, 0), len(energy) - 1)]

    for grp in group_words(words, per_group, max_chars):
        g_start = grp[0]["start"]
        g_end = grp[-1]["end"] + 0.12
        for k, w in enumerate(grp):
            w_start = g_start if k == 0 else w["start"]
            w_end = grp[k + 1]["start"] if k + 1 < len(grp) else g_end
            if w_end - w_start < 0.04:
                continue
            parts = []
            for j, o in enumerate(grp):
                txt = clean_word(split_emoji(o["text"])[0], upper, rtl)
                if j == k:
                    # active word: highlight colour + speech-energy-scaled pop
                    sc = int(108 + 14 * loud(o["start"])) if pop else 100
                    if box_mode:
                        parts.append("{\\bord%d\\3c%s\\1c&H00FFFFFF&\\fscx%d\\fscy%d}%s{\\r}" % (
                            int(size * 0.2), box_c, sc, sc, txt))
                    else:
                        parts.append("{\\1c%s\\fscx%d\\fscy%d}%s{\\r}" % (hl_c, sc, sc, txt))
                elif o.get("emph"):
                    parts.append("{\\1c%s}%s{\\r}" % (hl_c, txt))
                else:
                    parts.append(txt)
            text = " ".join(parts)
            anim = ""
            if k == 0 and pop:
                anim = "{\\fscx80\\fscy80\\t(0,90,\\fscx100\\fscy100)}"
            lines.append(f"Dialogue: 1,{ts(w_start)},{ts(w_end)},Cap,,0,0,0,,{{\\pos({x},{y})}}{anim}{text}")

    if title and title.get("text"):
        t0, t1 = title.get("start", 0.0), title.get("end", 2.6)
        words_t = split_emoji(title["text"])[0].split()
        if words_t:
            # emphasize the most "loaded" word (numbers first, then the longest) in the accent colour
            hl_idx = max(range(len(words_t)), key=lambda i: (any(c.isdigit() for c in words_t[i]), len(words_t[i])))
            styled = []
            for i, wt in enumerate(words_t):
                wt = esc(wt.upper() if (upper and not rtl) else wt)
                styled.append("{\\1c%s}%s{\\1c&H00FFFFFF&}" % (hl_c, wt) if i == hl_idx else wt)
            per_line = 13 if width < height else 26
            if upper and not rtl:
                per_line -= 2
            rows, k = [], 0
            for ln in wrap_words(words_t, per_line):
                rows.append(" ".join(styled[k:k + len(ln)]))
                k += len(ln)
            txt = "\\N".join(rows)
            anim = "{\\fad(60,200)\\fscx60\\fscy60\\t(0,160,\\fscx106\\fscy106)\\t(160,260,\\fscx100\\fscy100)}"
            lines.append(f"Dialogue: 3,{ts(t0)},{ts(t1)},Title,,0,0,0,,{anim}{txt}")

    if cta and cta.get("text"):
        c0 = cta.get("start", max(0.0, duration - 3.0))
        c1 = cta.get("end", duration)
        cta_text = split_emoji(cta["text"])[0]
        if cta_text:
            per_line = 18 if width < height else 34
            txt = "\\N".join(" ".join(esc(x) for x in ln) for ln in wrap_words(cta_text.split(), per_line))
            y_top = int(height * 0.16)
            anim = "{\\fad(200,150)\\move(%d,%d,%d,%d,0,260)}" % (x, y_top - 50, x, y_top)
            lines.append(f"Dialogue: 3,{ts(c0)},{ts(c1)},CTA,,0,0,0,,{anim}{txt}")
    return "\n".join(lines) + "\n"

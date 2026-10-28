"""Editorial brain: split into sentences, pick the strongest ones, choose the hook,
key phrases, emoji, B-roll cues and CTA. Uses Claude when available, else heuristics."""
from __future__ import annotations

import re

from . import llm
from .cleanup import norm

POWER_WORDS = {
    "en": {"stop", "never", "secret", "mistake", "best", "worst", "free", "only", "fast", "easy", "proven",
           "why", "how", "nobody", "everyone", "money", "results", "instantly", "biggest", "truth", "must",
           "change", "simple", "exactly", "huge", "crazy", "insane", "warning", "avoid", "hack", "rich"},
    "he": {"תפסיקו", "אף", "פעם", "סוד", "טעות", "הכי", "חינם", "רק", "מהר", "קל", "למה", "איך", "כסף",
           "תוצאות", "מיד", "אמת", "חייבים", "פשוט", "בדיוק", "ענק", "משוגע", "אזהרה", "הימנעו", "טריק",
           "שינה", "לשנות", "שלושה", "שלוש", "חמש", "חמישה"},
}
NUM_WORDS = {"one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "thirty", "hundred",
             "אחד", "אחת", "שתיים", "שניים", "שלוש", "שלושה", "ארבע", "חמש", "עשר", "מאה", "אלף"}

EMOJI_MAP = {
    "fitness": {"muscle": "💪", "strong": "💪", "body": "💪", "fire": "🔥", "burn": "🔥", "fat": "🔥", "run": "🏃",
                "heart": "❤️", "stop": "🛑", "crunch": "🛑", "abs": "🔥", "days": "📅", "exercise": "🏋️", "workout": "🏋️",
                "שריר": "💪", "גוף": "💪", "שומן": "🔥", "תפסיקו": "🛑", "בטן": "🔥", "ימים": "📅", "תרגיל": "🏋️", "אימון": "🏋️"},
    "food": {"delicious": "😋", "taste": "😋", "crispy": "🔥", "hot": "🌶️", "sweet": "🍰", "cheese": "🧀", "recipe": "📝",
             "טעים": "😋", "פריך": "🔥", "חריף": "🌶️", "מתוק": "🍰", "גבינה": "🧀", "מתכון": "📝"},
    "realestate": {"home": "🏡", "house": "🏡", "price": "💰", "million": "💰", "view": "🌅", "kitchen": "🍳", "pool": "🏊",
                   "בית": "🏡", "דירה": "🏡", "מחיר": "💰", "מיליון": "💰", "נוף": "🌅", "מטבח": "🍳"},
    "business": {"money": "💰", "profit": "📈", "growth": "📈", "client": "🤝", "mistake": "❌", "idea": "💡", "secret": "🤫",
                 "כסף": "💰", "רווח": "📈", "צמיחה": "📈", "לקוח": "🤝", "טעות": "❌", "רעיון": "💡", "סוד": "🤫"},
    "_common": {"stop": "🛑", "mistake": "❌", "secret": "🤫", "money": "💰", "love": "❤️", "idea": "💡", "warning": "⚠️",
                "?": "🤔", "!": "🔥", "תפסיקו": "🛑", "טעות": "❌", "סוד": "🤫", "כסף": "💰", "רעיון": "💡"},
}


HOOK_TYPE_WORDS = {
    "pattern_interrupt": {"stop", "never", "dont", "don't", "quit", "wrong", "תפסיקו", "אל", "לא", "טעות"},
    "negative": {"mistake", "worst", "never", "avoid", "wrong", "טעות", "הכי", "גרוע", "הימנעו"},
    "question": {"why", "how", "what", "למה", "איך", "מה"},
    "number_list": NUM_WORDS,
    "curiosity_gap": {"secret", "nobody", "hidden", "truth", "סוד", "אף", "אמת"},
    "bold_claim": {"best", "only", "every", "always", "הכי", "רק", "תמיד"},
}
CLAUSE_BREAK = {"if", "because", "and", "but", "when", "so", "that", "which", "אם", "כי", "אבל", "כש", "ש", "וגם", "כדי"}
LEADING_FILLER = {"so", "and", "but", "here", "are", "okay", "well", "now", "אז", "ו", "טוב", "בקיצור", "הנה"}


def make_title(text: str, language: str, max_words: int = 6) -> str:
    toks = text.replace("…", " ").split()
    while toks and norm(toks[0]) in LEADING_FILLER and len(toks) > 3:
        toks = toks[1:]
    toks = toks[:max_words]
    # end on a natural break: before a conjunction / after a comma, if enough words precede it
    for j in range(3, len(toks)):
        if norm(toks[j]) in CLAUSE_BREAK or toks[j - 1].endswith(","):
            toks = toks[:j]
            break
    out = " ".join(toks).strip(" ,.;:-")
    return out[:1].upper() + out[1:] if language != "he" else out


def split_sentences(words: list[dict], kept_idx: set[int]) -> list[dict]:
    sents, cur = [], []
    idx = [i for i in range(len(words)) if i in kept_idx]
    for j, i in enumerate(idx):
        cur.append(i)
        txt = words[i]["text"]
        nxt_gap = words[idx[j + 1]]["start"] - words[i]["end"] if j + 1 < len(idx) else 9
        if re.search(r"[.!?…]$", txt) or nxt_gap > 0.7 or len(cur) >= 22:
            sents.append(cur)
            cur = []
    if cur:
        sents.append(cur)
    out = []
    for k, s in enumerate(sents):
        out.append({"id": k, "words": s, "text": " ".join(words[i]["text"] for i in s),
                    "start": words[s[0]]["start"], "end": words[s[-1]]["end"]})
    return out


def _lang(language: str) -> str:
    return "he" if language == "he" else "en"


def score_sentence(s: dict, words: list[dict], language: str, position: int, total: int) -> float:
    toks = [norm(words[i]["text"]) for i in s["words"]]
    pw = POWER_WORDS[_lang(language)] | POWER_WORDS["en"]
    score = 0.0
    score += 2.0 * sum(t in pw for t in toks)
    score += 2.5 * sum(t.isdigit() or t in NUM_WORDS for t in toks)
    score += 1.5 * ("?" in s["text"])
    score += 1.0 * sum(t in {"you", "your", "אתם", "אתה", "את", "לכם", "שלכם"} for t in toks)
    dur = s["end"] - s["start"]
    wps = len(toks) / max(dur, 0.3)
    score += min(2.0, wps / 1.6)  # energetic delivery
    score -= 2.0 * (len(toks) < 3)
    if position == 0:
        score += 1.0
    return score


def emphasis_words(s: dict, words: list[dict], language: str, n: int = 1) -> list[int]:
    pw = POWER_WORDS[_lang(language)] | POWER_WORDS["en"]
    cands = []
    for i in s["words"]:
        t = norm(words[i]["text"])
        val = (3 if (t.isdigit() or t in NUM_WORDS) else 0) + (2 if t in pw else 0) + min(len(t), 9) / 9
        cands.append((val, i))
    cands.sort(reverse=True)
    return [i for v, i in cands[:n] if v >= 0.6]


def pick_emoji(text: str, niche: str) -> str | None:
    table = {**EMOJI_MAP["_common"], **EMOJI_MAP.get(niche, {})}
    toks = [norm(t) for t in text.split()]
    for t in toks:
        for k, e in table.items():
            if len(k) > 2 and t.startswith(k):
                return e
    return None


def heuristic_plan(sents: list[dict], words: list[dict], language: str, niche: str, budget: float,
                   profile: dict) -> dict:
    scored = [(score_sentence(s, words, language, k, len(sents)), s) for k, s in enumerate(sents)]
    total = sum(s["end"] - s["start"] for s in sents)
    keep = {s["id"] for s in sents}
    if total > budget:
        # drop weakest sentences (never the first/last) until within budget
        for sc, s in sorted(scored, key=lambda x: x[0]):
            if total <= budget:
                break
            if s["id"] in (sents[0]["id"], sents[-1]["id"]):
                continue
            keep.discard(s["id"])
            total -= s["end"] - s["start"]
    # hook: strongest sentence among the first 40% (or the first one); moved to the front
    hook_type = profile.get("hook", {}).get("type", "bold_claim")
    boost = HOOK_TYPE_WORDS.get(hook_type, set())
    window = [(sc + 2.5 * sum(norm(words[i]["text"]) in boost for i in s["words"]), s)
              for sc, s in scored if s["id"] in keep][: max(1, int(len(sents) * 0.4) + 1)]
    hook = sents[0]
    if window:
        best = max(window, key=lambda x: x[0])
        first = next((x for x in window if x[1]["id"] == hook["id"]), None)
        # only re-order when the alternative is clearly stronger than the natural opening
        if first is None or best[0] > first[0] + 2.0:
            hook = best[1]
    title = make_title(hook["text"], language)
    emph, emojis = {}, []
    per_min = profile.get("overlays", {}).get("emoji_per_min", 4)
    max_emoji = max(1, int(per_min * budget / 60))
    for s in sents:
        if s["id"] not in keep:
            continue
        emph[s["id"]] = emphasis_words(s, words, language, n=1 if len(s["words"]) < 8 else 2)
        e = pick_emoji(s["text"], niche)
        if e and len(emojis) < max_emoji:
            emojis.append({"sentence_id": s["id"], "emoji": e})
    lang = _lang(language)
    cta = profile.get("structure", {}).get(f"cta_text_{lang}") or ("עקבו לעוד 👇" if lang == "he" else "Follow for more 👇")
    return {
        "keep": [s["id"] for s in sents if s["id"] in keep],
        "hook_id": hook["id"],
        "hook_type": hook_type,
        "title": title,
        "cta": cta,
        "emphasis": {k: v for k, v in emph.items()},
        "emojis": emojis,
        "broll": [],
        "source": "heuristic",
    }


SCHEMA = {
    "type": "object",
    "properties": {
        "keep": {"type": "array", "items": {"type": "integer"}},
        "hook_id": {"type": "integer"},
        "hook_type": {"type": "string", "enum": ["bold_claim", "question", "number_list", "pattern_interrupt",
                                                  "negative", "story", "visual", "curiosity_gap"]},
        "title": {"type": "string"},
        "cta": {"type": "string"},
        "emphasis": {"type": "array", "items": {"type": "object", "properties": {
            "sentence_id": {"type": "integer"}, "words": {"type": "array", "items": {"type": "string"}}},
            "required": ["sentence_id", "words"], "additionalProperties": False}},
        "emojis": {"type": "array", "items": {"type": "object", "properties": {
            "sentence_id": {"type": "integer"}, "emoji": {"type": "string"}},
            "required": ["sentence_id", "emoji"], "additionalProperties": False}},
        "broll": {"type": "array", "items": {"type": "object", "properties": {
            "sentence_id": {"type": "integer"}, "query": {"type": "string"}},
            "required": ["sentence_id", "query"], "additionalProperties": False}},
        "reasoning": {"type": "string"},
    },
    "required": ["keep", "hook_id", "hook_type", "title", "cta", "emphasis", "emojis", "broll", "reasoning"],
    "additionalProperties": False,
}

SYSTEM = (
    "You are the lead editor for a short-form content creator with over a million followers. "
    "You make the editorial calls: which sentences survive, which line becomes the 3-second hook, "
    "which words get emphasized on screen, where emoji and B-roll go, and the closing CTA. "
    "You follow the niche style profile, which was distilled from that niche's viral videos. "
    "Write title and CTA in the same language as the transcript (Hebrew stays Hebrew)."
)


def plan_content(sents: list[dict], words: list[dict], language: str, niche: str, platform: str,
                 budget: float, profile: dict) -> dict:
    base = heuristic_plan(sents, words, language, niche, budget, profile)
    if not llm.available() or not sents:
        return base
    listing = "\n".join(f"[{s['id']}] ({s['end'] - s['start']:.1f}s) {s['text']}" for s in sents)
    prompt = (
        f"Niche: {niche}. Platform: {platform}. Max duration: {budget:.0f}s "
        f"(ideal per profile: ~{profile.get('structure', {}).get('avg_duration', 35)}s).\n"
        f"Style profile (hook / structure / pacing):\n"
        f"{ {k: profile.get(k) for k in ('hook', 'structure', 'pacing', 'learned')} }\n\n"
        f"Transcript sentences (id, duration, text):\n{listing}\n\n"
        "Decide:\n"
        "- keep: sentence ids to keep, in original order, total within the max duration; cut weak, redundant or off-topic lines.\n"
        "- hook_id: the single strongest line to open the video (it will be moved to the very start).\n"
        "- title: on-screen hook title, 2-7 words, punchy.\n"
        "- emphasis: 1-2 exact words per kept sentence to highlight (copy them verbatim from the sentence).\n"
        "- emojis: at most one per sentence and only where it adds meaning.\n"
        "- broll: short visual search queries for lines that benefit from a cutaway.\n"
        "- cta: closing call to action suited to the niche and platform.\n"
        "- reasoning: one or two sentences on why."
    )
    res = llm.ask_json(SYSTEM, prompt, SCHEMA)
    if not res:
        return base
    ids = {s["id"] for s in sents}
    keep = [i for i in res["keep"] if i in ids] or base["keep"]
    emph = {}
    for e in res.get("emphasis", []):
        s = next((x for x in sents if x["id"] == e["sentence_id"]), None)
        if not s:
            continue
        wanted = {norm(w) for w in e["words"]}
        emph[s["id"]] = [i for i in s["words"] if norm(words[i]["text"]) in wanted][:2]
    return {
        "keep": keep,
        "hook_id": res["hook_id"] if res["hook_id"] in keep else keep[0],
        "hook_type": res["hook_type"],
        "title": res["title"],
        "cta": res["cta"],
        "emphasis": emph or base["emphasis"],
        "emojis": [e for e in res["emojis"] if e["sentence_id"] in ids],
        "broll": [b for b in res["broll"] if b["sentence_id"] in ids],
        "reasoning": res.get("reasoning", ""),
        "source": "claude",
    }

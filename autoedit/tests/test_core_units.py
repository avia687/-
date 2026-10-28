"""Fast unit tests for the editing core (no media decoding)."""
from autoedit import captions, cleanup, score, selection, timeline
from autoedit.profiles_default import default_profile


def W(text, s, e):
    return {"text": text, "start": s, "end": e}


def test_fillers_stutters_and_repeats_are_marked():
    words = [W("Um,", 0, .3), W("the", 1, 1.1), W("first", 1.1, 1.3), W("one", 1.3, 1.5),
             W("the", 1.8, 1.9), W("first", 1.9, 2.1), W("one", 2.1, 2.3), W("is", 2.3, 2.4), W("great.", 2.4, 2.8)]
    r = cleanup.mark_words(words, "en")
    assert r[0] == "filler"
    assert r[1:4] == ["repeat"] * 3
    assert r[4:] == [None] * 5


def test_hebrew_fillers():
    words = [W("אממ", 0, .3), W("שלום", .5, .9), W("לכולם", .9, 1.3)]
    assert cleanup.mark_words(words, "he") == ["filler", None, None]


def test_segments_split_on_silence_and_pad():
    words = [W("a", 0, .5), W("b", .55, 1), W("c", 3, 3.5)]
    segs = cleanup.build_segments(words, [None] * 3, max_silence=0.3)
    assert len(segs) == 2
    assert segs[0]["start"] == 0 and segs[0]["end"] > 1
    assert segs[1]["start"] < 3


def test_title_ends_on_clause_and_drops_lead_filler():
    assert selection.make_title("Stop doing crunches if you want flat abs.", "en") == "Stop doing crunches"
    assert selection.make_title("הנה שלושה תרגילים שישנו לכם את הגוף", "he").startswith("שלושה")


def test_heuristic_plan_respects_budget_and_keeps_first_last():
    words, t = [], 0.0
    for k in range(12):
        for w in f"sentence number {k} has some words.".split():
            words.append(W(w, t, t + 0.3))
            t += 0.32
        t += 0.8
    sents = selection.split_sentences(words, set(range(len(words))))
    plan = selection.heuristic_plan(sents, words, "en", "fitness", 15, default_profile("fitness"))
    kept = sum(s["end"] - s["start"] for s in sents if s["id"] in plan["keep"])
    assert kept <= 15.5
    assert sents[0]["id"] in plan["keep"] and sents[-1]["id"] in plan["keep"]


def _plan():
    words = [{"i": i, "text": f"w{i}", "src": "S0", "start": i * 0.5, "end": i * 0.5 + 0.4, "sid": i // 4} for i in range(16)]
    return {"meta": {"platform": "tiktok"}, "sources": {"S0": {"kind": "video"}},
            "clips": [{"src": "S0", "in": 4.0, "out": 6.0}, {"src": "S0", "in": 0.0, "out": 2.0, "speed": 2.0}],
            "words": words, "title": {"text": "x"}, "cta": {"text": "y"}, "captions": {"enabled": True},
            "punch": [{"word": 9}], "emojis": [], "broll": [], "transitions": [], "music": {"path": "m"}}


def test_timeline_maps_words_with_reorder_and_speed():
    p = _plan()
    lay = timeline.layout(p)
    assert lay[1]["t0"] == 2.0 and lay[1]["t1"] == 3.0
    ow = timeline.output_words(p, lay)
    assert ow[0]["i"] == 8 and abs(ow[0]["start"]) < 1e-6
    w0 = next(w for w in ow if w["i"] == 0)
    assert abs(w0["start"] - 2.0) < 1e-6
    assert timeline.word_time(ow, 9) == 0.5


def test_score_range_and_suggestions():
    r = score.score_plan(_plan(), default_profile("fitness"))
    assert 1 <= r["score"] <= 100
    assert isinstance(r["suggestions"], list)


def test_ass_rtl_and_emoji_stripping():
    words = [{"text": t, "start": i * .4, "end": i * .4 + .3, "emph": False, "sid": 0} for i, t in enumerate("שלום לכולם 💪".split())]
    ass = captions.build_ass(words, default_profile("fitness")["captions"], 1080, 1920, 3,
                             title={"text": "כותרת 🔥", "start": 0, "end": 2}, cta={"text": "עקבו 👇"})
    assert ",-1\n" in ass  # RTL auto base direction
    assert "💪" not in ass and "🔥" not in ass and "👇" not in ass
    assert ass.count("Dialogue:") >= 4


def test_wrap_balanced():
    lines = captions.wrap_words("one two three four five six".split(), 12)
    assert max(len(" ".join(l)) for l in lines) <= 14

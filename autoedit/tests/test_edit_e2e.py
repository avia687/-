"""End-to-end: raw talking-head video in -> edited vertical video out."""
import json

from autoedit import pipeline
from autoedit.media import probe, run


def test_edit_end_to_end(sample_video, tmp_root):
    out = tmp_root / "edited.mp4"
    res = pipeline.edit(sample_video, "fitness", "tiktok", out, remove_logo="auto")
    plan = res["plan"]
    info = probe(out)
    assert (info.width, info.height) == (1080, 1920)
    assert info.has_audio
    src = probe(sample_video)
    assert info.duration < src.duration - 2  # silences/fillers/repeats removed
    assert plan["stats"]["removed_fillers"] >= 1
    assert plan["title"]["text"]
    assert 1 <= plan["score"]["score"] <= 100
    assert plan["sources"]["S0"]["inpaint"], "watermark should be detected"
    json.dumps(plan)  # plan must be serializable for the UI
    loud = run(["ffmpeg", "-hide_banner", "-i", str(out), "-af", "ebur128", "-f", "null", "-"], quiet=False).stderr
    i_val = float(loud.split("Integrated loudness:")[1].split("I:")[1].split("LUFS")[0])
    assert -16.5 < i_val < -11.5


def test_rerender_from_edited_plan(sample_video, tmp_root):
    from autoedit.render import render

    plan = pipeline.build_plan(sample_video, "business", "youtube")
    plan["captions"]["enabled"] = False
    plan["clips"] = plan["clips"][:2]
    res = render(plan, tmp_root / "re.mp4", tmp_root / "rw", preview=True)
    assert res["width"] == 960 and res["height"] == 540

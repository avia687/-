"""Phase 1 of the AI Video Studio: projects + versions, encrypted AI-service keys, styles, explanations."""
import os

import pytest

from autoedit import db


@pytest.fixture()
def work(tmp_path, monkeypatch):
    from autoedit import config

    monkeypatch.setattr(config, "WORK_DIR", tmp_path / "work")
    db.set_db_path(tmp_path / "t.db")
    yield tmp_path
    db.set_db_path(tmp_path / "unused.db")


def _plan(n=6, mode="montage"):
    clips = [{"src": "S0", "in": 0.0, "out": 2.0 + (k % 3) * 0.5, "role": "hook" if k == 0 else "body"} for k in range(n)]
    clips[-1]["role"] = "cta"
    return {"meta": {"mode": mode, "niche": "fitness", "platform": "tiktok", "bpm": 120},
            "sources": {"S0": {"kind": "image"}}, "clips": clips, "words": [], "punch": [{"word": 1}, {"word": 2}, {"word": 3}],
            "emojis": [{"word": 1, "emoji": "🔥"}], "transitions": [{"after_clip": 0, "type": "whip", "sfx": "impact"}],
            "graphics": [{"type": "kinetic_title", "text": "x", "start": 0, "end": 2},
                         {"type": "end_card", "text": "y", "start": 10, "end": 12.4}],
            "captions": {"enabled": True}, "music": {"enabled": True, "path": "m.wav", "volume_db": -19},
            "color": {}, "progress_bar": {"enabled": True}, "title": {}, "stats": {}}


def test_versions_undo_redo_restore_survive_restart(work):
    from autoedit import projects

    projects.create("p1", "דירה בתל אביב", platform="reels", style="viral")
    a, b, c = _plan(), _plan(), _plan()
    b["music"]["volume_db"] = -25
    c["music"]["volume_db"] = -30
    projects.record("p1", 1, a, "AI")
    projects.record("p1", 1, b, "מוזיקה שקטה")
    projects.record("p1", 1, c, "עוד יותר שקט")
    assert projects.undo("p1", 1)["music"]["volume_db"] == -25
    assert projects.undo("p1", 1)["music"]["volume_db"] == -19
    assert projects.undo("p1", 1) is None
    assert projects.redo("p1", 1)["music"]["volume_db"] == -25
    # a new edit after undo drops the redo branch
    d = _plan()
    d["music"]["volume_db"] = -10
    projects.record("p1", 1, d, "חזק")
    h = projects.history("p1", 1)
    assert h["count"] == 3 and not h["can_redo"]
    assert projects.restore("p1", 1, 1)["music"]["volume_db"] == -19
    # crash recovery: in-progress projects become 'interrupted', data intact
    projects.update("p1", status="working")
    assert projects.recover_interrupted() == ["p1"]
    assert projects.get("p1")["status"] == "interrupted"
    assert projects.history("p1", 1)["count"] == 3
    k2 = projects.duplicate("p1", 1)
    assert k2 == 2 and projects.history("p1", 2)["count"] == 1
    projects.delete("p1")
    assert projects.get("p1") is None


def test_secrets_encrypted_and_never_returned(work, monkeypatch):
    from autoedit import secrets_store

    monkeypatch.delenv("PEXELS_API_KEY", raising=False)
    st = secrets_store.save({"PEXELS_API_KEY": "sk-secret-123", "UNKNOWN": "x"})
    raw = (work / "work" / "secure" / "secrets.enc").read_bytes()
    assert b"sk-secret-123" not in raw
    assert os.environ["PEXELS_API_KEY"] == "sk-secret-123"
    row = next(r for r in st if r["key"] == "PEXELS_API_KEY")
    assert row["configured"] and "sk-secret" not in str(st)
    secrets_store.save({"PEXELS_API_KEY": ""})
    assert "PEXELS_API_KEY" not in os.environ


def test_styles_reduce_effects_and_fit_duration():
    from autoedit import timeline
    from autoedit.studio import styles

    cin = styles.apply(_plan(), "cinematic")
    assert cin["emojis"] == [] and all(t["type"] == "cut" for t in cin["transitions"])
    assert len(cin["punch"]) < 3 and cin["progress_bar"]["enabled"] is False
    prem = styles.apply(_plan(), "premium")
    assert prem["emojis"] == [] and len(prem["punch"]) <= 2
    p = _plan(10)
    total = timeline.total_duration(p)
    removed = styles.fit_duration(p, 12)
    assert removed > 0 and timeline.total_duration(p) <= 12 * 1.12
    assert p["clips"][0]["role"] == "hook" and p["clips"][-1]["role"] == "cta"
    end = next(g for g in p["graphics"] if g["type"] == "end_card")
    assert abs(end["end"] - timeline.total_duration(p)) < 1e-6 and total > timeline.total_duration(p)
    ex = styles.explain(p)
    assert any("ביט" in x for x in ex) and all(isinstance(x, str) for x in ex)


def test_score_breakdown():
    from autoedit.studio.critic import score_breakdown

    plan = {"critic": {"checks": [{"key": "hook", "score": 0.9}, {"key": "pacing", "score": 0.8}, {"key": "retention", "score": 1.0},
                                  {"key": "sound", "score": 0.95}, {"key": "payoff", "score": 1.0}]}, "brand": {"logo": "x"}}
    b = score_breakdown(plan)
    assert b["hook"] == 90 and b["pacing"] == 90 and b["brand"] == 100 and b["audio"] == 95


def test_friendly_errors():
    from autoedit.tasks import friendly_error

    assert "דיסק" in friendly_error(OSError("No space left on device"))
    assert friendly_error(ValueError("לא נמצאו תמונות")) == "לא נמצאו תמונות"
    assert "Traceback" not in friendly_error(KeyError("x"))

"""Learning engine: relative success scoring, dedupe, source failover, model + versioned promotion, feedback."""
import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from autoedit import db
from autoedit.learn import engine, feedback, model
from autoedit.scout import scout
from autoedit.scout.sources import SourceBlocked
from autoedit.style import library


@pytest.fixture()
def fresh_db(tmp_path, monkeypatch, isolated_profiles):
    from autoedit import config

    db.set_db_path(tmp_path / "t.db")
    monkeypatch.setattr(config, "WORK_DIR", tmp_path / "work")
    yield
    db.set_db_path(tmp_path / "unused.db")


def _vid(i, views, followers, likes, days=10, niche="fitness"):
    pub = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return {"id": f"youtube:{i}", "platform": "shorts", "url": f"u{i}", "niche": niche, "views": views,
            "followers": followers, "likes": likes, "comments": likes // 20, "published_at": pub, "fetched_at": db.now()}


class FakeSource:
    def __init__(self, name, videos=None, blocked=False):
        self.name, self.videos, self.blocked, self.calls = name, videos or [], blocked, 0

    def available(self):
        return True

    def search(self, q, niche, max_age, limit, **_):
        self.calls += 1
        if self.blocked:
            raise SourceBlocked(f"{self.name} quota")
        return [dict(v, query=q) for v in self.videos]


def test_relative_success_not_raw_views(fresh_db):
    # small channel with a breakout beats a huge channel with average numbers
    db.upsert_video(_vid(1, 200_000, 2_000, 18_000))
    db.upsert_video(_vid(2, 900_000, 5_000_000, 9_000))
    for i in range(3, 12):
        db.upsert_video(_vid(i, 20_000 + i * 1000, 50_000, 400))
    scout.relabel("fitness")
    r1 = db.one("SELECT label, success_score FROM videos WHERE id='youtube:1'")
    r2 = db.one("SELECT label, success_score FROM videos WHERE id='youtube:2'")
    assert r1["label"] == "success"
    assert r1["success_score"] > r2["success_score"]


def test_scout_dedupes_and_fails_over(fresh_db):
    vids = [_vid(i, 10_000 * i, 10_000, 500 * i) for i in range(1, 9)]
    bad, good = FakeSource("bad", blocked=True), FakeSource("good", vids)
    r1 = scout.run("fitness", sources=[bad, good], max_keywords=2)
    assert r1["new"] == 8 and any("quota" in e for e in r1["errors"])
    r2 = scout.run("fitness", sources=[good], max_keywords=1)
    assert r2["new"] == 0  # duplicates never re-enter
    assert db.one("SELECT COUNT(*) n FROM videos")["n"] == 8


def _seed_features(n=60, seed=0):
    rng = np.random.default_rng(seed)
    for i in range(n):
        fast = rng.random() < 0.5
        caps = rng.random() < 0.5
        p = 0.08 + 0.42 * fast + 0.42 * caps
        success = rng.random() < p
        vec = {"avg_shot_sec": (1.2 if fast else 3.5) + rng.normal(0, .2), "caption_presence": float(caps),
               "music_bpm": 100 + rng.normal(0, 10), "cuts_per_min": (40 if fast else 15) + rng.normal(0, 3),
               "hook_question": float(rng.random() < .5), "duration": 30 + rng.normal(0, 5)}
        db.upsert_video({**_vid(i, 1000, 1000, 10), "id": f"youtube:s{i}"})
        db.execute("UPDATE videos SET label=?, success_score=?, status='analyzed' WHERE id=?",
                   ("success" if success else "regular", 0.9 if success else 0.1, f"youtube:s{i}"))
        db.execute("INSERT INTO features (video_id, niche, vector, profile, topic) VALUES (?,?,?,?,?)",
                   (f"youtube:s{i}", "fitness", json.dumps(vec), "{}", "[]"))


def test_model_learns_signal_and_versions_promote_only_on_improvement(fresh_db):
    _seed_features(120)
    r1 = engine.learn("fitness")
    assert r1["status"] == "trained" and r1["auc"] > 0.6
    top = {i["feature"] for i in r1["importances"][:3]}
    assert top & {"avg_shot_sec", "caption_presence", "cuts_per_min"}
    assert r1["promoted"] and library.active_version("fitness") == r1["version"]
    prof = library.load_profile("fitness")
    assert prof["pacing"]["avg_shot_sec"] < 2.5  # moved toward what successful videos do
    # retrain on identical data: cannot beat itself -> saved but not activated
    r2 = engine.learn("fitness")
    assert not r2["promoted"]
    assert library.active_version("fitness") == r1["version"]
    assert len(library.list_versions("fitness")) == 2
    assert model.predict("fitness", {"avg_shot_sec": 1.1, "caption_presence": 1, "cuts_per_min": 45}) > \
        model.predict("fitness", {"avg_shot_sec": 3.8, "caption_presence": 0, "cuts_per_min": 12})


def test_insufficient_data_is_reported_not_crashing(fresh_db):
    _seed_features(5)
    assert engine.learn("fitness")["status"] == "insufficient_data"


def test_feedback_checkpoints(fresh_db):
    pub = (datetime.now(timezone.utc) - timedelta(hours=80)).isoformat()
    pid = feedback.add_post("https://www.youtube.com/shorts/abcdefghijk", "fitness", published_at=pub)
    due = {cp for p, cp in feedback.due_checkpoints()}
    assert due == {"24h", "72h"}
    res = feedback.run(fetcher=lambda url: {"views": 1234, "likes": 50, "comments": 3, "source": "fake"})
    assert res["recorded"] == 2
    assert feedback.due_checkpoints() == []
    assert db.one("SELECT views FROM post_metrics WHERE post_id=? AND checkpoint='72h'", (pid,))["views"] == 1234


def test_cycle_survives_stage_failure(fresh_db, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(scout, "run", boom)
    res = engine.run_cycle("fitness")
    assert any("network down" in e for e in res["errors"])
    assert "learn" in res  # later stages still ran


def test_scheduler_reads_config(fresh_db):
    from autoedit.learn import scheduler

    scheduler.start()
    try:
        ids = {j["id"] for j in scheduler.jobs()}
        assert ids == {"scout", "feedback", "learn"}
    finally:
        scheduler.stop()

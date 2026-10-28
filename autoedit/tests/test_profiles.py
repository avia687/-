from autoedit.style import library


def test_aggregate_weighted_median_and_mode():
    refs = [{"pacing": {"avg_shot_sec": v}, "hook": {"type": t}, "music": {"present": m}}
            for v, t, m in [(1.0, "question", True), (2.0, "question", True), (9.0, "story", False)]]
    agg = library.aggregate(refs)
    assert agg["pacing"]["avg_shot_sec"] == 2.0
    assert agg["hook"]["type"] == "question"
    assert agg["music"]["present"] is True


def test_versions_activate_and_rollback(isolated_profiles):
    base = library.load_profile("fitness")
    assert base["profile_version"] == "default"
    v1 = library.save_version("fitness", {"pacing": {"avg_shot_sec": 1.1}}, {"auc": 0.6}, activate=True)
    assert library.load_profile("fitness")["pacing"]["avg_shot_sec"] == 1.1
    v2 = library.save_version("fitness", {"pacing": {"avg_shot_sec": 0.9}}, {"auc": 0.7}, activate=True)
    assert library.active_version("fitness") == v2
    library.set_active("fitness", v1)
    assert library.load_profile("fitness")["pacing"]["avg_shot_sec"] == 1.1
    assert [v["version"] for v in library.list_versions("fitness")] == [v1, v2]

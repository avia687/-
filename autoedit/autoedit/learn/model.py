"""Success model per niche (and platform when there is enough data): LightGBM on the style
feature vector, evaluated on a held-out test set; importances + effect directions for the dashboard."""
from __future__ import annotations

import json
import logging
import pickle
from pathlib import Path

import numpy as np

from .. import config, db, settings
from . import features as feats

log = logging.getLogger(__name__)


def _matrix(X: list[dict], names: list[str] | None = None) -> tuple[np.ndarray, list[str]]:
    names = names or sorted({k for x in X for k in x})
    return np.array([[float(x.get(n, 0.0) or 0.0) for n in names] for x in X], dtype=np.float64), names


def _split(y: np.ndarray, frac: float, seed: int = 13) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    test = []
    for cls in (0, 1):
        idx = np.where(y == cls)[0]
        rng.shuffle(idx)
        test.extend(idx[: max(1, int(round(len(idx) * frac)))])
    test = np.array(sorted(test))
    train = np.array([i for i in range(len(y)) if i not in set(test)])
    return train, test


def _fit(Xtr: np.ndarray, ytr: np.ndarray, wtr: np.ndarray):
    n = len(ytr)
    if n >= 150:  # trees need data; below this a regularized linear model generalizes better
        import lightgbm as lgb

        clf = lgb.LGBMClassifier(n_estimators=250, learning_rate=0.04, num_leaves=15, min_child_samples=max(3, n // 25),
                                 subsample=0.85, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
                                 importance_type="gain", verbose=-1, random_state=7)
        clf.fit(Xtr, ytr, sample_weight=wtr)
        return clf, "lightgbm"
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    clf = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000))
    clf.fit(Xtr, ytr, logisticregression__sample_weight=wtr)
    return clf, "logreg"


def _importances(clf, kind: str, names: list[str]) -> np.ndarray:
    if kind == "lightgbm":
        imp = np.asarray(clf.feature_importances_, dtype=float)
    else:
        lr = clf.named_steps["logisticregression"]
        imp = np.abs(lr.coef_[0])
    return imp / (imp.sum() or 1.0)


def _auc(y: np.ndarray, p: np.ndarray) -> float:
    from sklearn.metrics import roc_auc_score

    if len(set(y.tolist())) < 2:
        return 0.5
    return float(roc_auc_score(y, p))


def model_path(niche: str, run_id: int) -> Path:
    d = config.WORK_DIR / "models" / niche
    d.mkdir(parents=True, exist_ok=True)
    return d / f"model_{run_id:05d}.pkl"


def active_model(niche: str) -> dict | None:
    r = db.one("SELECT * FROM model_runs WHERE niche=? AND promoted=1 ORDER BY id DESC LIMIT 1", (niche,))
    if not r or not r["model_path"] or not Path(r["model_path"]).exists():
        return None
    with open(r["model_path"], "rb") as f:
        return pickle.load(f)


def predict(niche: str, vec: dict) -> float | None:
    m = active_model(niche)
    if not m:
        return None
    X, _ = _matrix([vec], m["names"])
    return float(m["clf"].predict_proba(X)[0, 1])


def train(niche: str, platform: str | None = None) -> dict:
    cfg = settings.load()["learn"]
    X, y, w, ids = feats.dataset(niche, platform)
    y_arr = np.array(y)
    if len(y) < cfg["min_samples"] or y_arr.sum() < 4 or (len(y_arr) - y_arr.sum()) < 4:
        return {"status": "insufficient_data", "n": len(y), "positives": int(y_arr.sum()) if len(y) else 0}
    M, names = _matrix(X)
    w_arr = np.array(w)
    tr, te = _split(y_arr, cfg["test_fraction"])
    clf, kind = _fit(M[tr], y_arr[tr], w_arr[tr])
    p_te = clf.predict_proba(M[te])[:, 1]
    auc = _auc(y_arr[te], p_te)
    acc = float(np.mean((p_te >= 0.5) == y_arr[te]))
    # previous active model evaluated on *this* test set: fair head-to-head comparison
    prev = active_model(niche)
    baseline = None
    if prev:
        Mp, _ = _matrix([X[i] for i in te], prev["names"])
        baseline = _auc(y_arr[te], prev["clf"].predict_proba(Mp)[:, 1])
    imp = _importances(clf, kind, names)
    pos, neg = M[y_arr == 1], M[y_arr == 0]
    importances = []
    for i in np.argsort(-imp):
        if imp[i] <= 0:
            continue
        sm, rm = float(np.median(pos[:, i])), float(np.median(neg[:, i]))
        importances.append({"feature": names[i], "importance": round(float(imp[i]), 4),
                            "success_median": round(sm, 3), "regular_median": round(rm, 3),
                            "direction": "higher" if sm > rm else ("lower" if sm < rm else "same")})
    # refit on all data for production use
    clf_all, _ = _fit(M, y_arr, w_arr)
    run_id = db.execute("INSERT INTO model_runs (niche, platform, created_at, n_train, n_test, auc, accuracy, baseline_auc, "
                        "importances, promoted, note) VALUES (?,?,?,?,?,?,?,?,?,0,?)",
                        (niche, platform, db.now(), int(len(tr)), int(len(te)), auc, acc, baseline,
                         json.dumps(importances[:25]), kind))
    path = model_path(niche, run_id)
    with open(path, "wb") as f:
        pickle.dump({"clf": clf_all, "names": names, "kind": kind}, f)
    db.execute("UPDATE model_runs SET model_path=? WHERE id=?", (str(path), run_id))
    return {"status": "trained", "run_id": run_id, "kind": kind, "auc": round(auc, 4), "accuracy": round(acc, 4),
            "baseline_auc": None if baseline is None else round(baseline, 4), "n": len(y),
            "n_test": int(len(te)), "importances": importances[:12]}


def promote(run_id: int, version: str | None) -> None:
    r = db.one("SELECT niche FROM model_runs WHERE id=?", (run_id,))
    db.execute("UPDATE model_runs SET promoted=0 WHERE niche=?", (r["niche"],))
    db.execute("UPDATE model_runs SET promoted=1, profile_version=? WHERE id=?", (version, run_id))

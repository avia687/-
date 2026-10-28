import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).parent))

# Tests use a small Whisper model; set AUTOEDIT_TEST_WHISPER to a local CTranslate2 dir offline.
os.environ.setdefault("AUTOEDIT_WHISPER_MODEL", os.environ.get("AUTOEDIT_TEST_WHISPER", "small"))
os.environ.setdefault("AUTOEDIT_WHISPER_MODEL_HE", "")
os.environ["AUTOEDIT_NO_LLM"] = os.environ.get("AUTOEDIT_TEST_LLM_OFF", "1")


@pytest.fixture(scope="session")
def tmp_root(tmp_path_factory):
    d = tmp_path_factory.mktemp("autoedit")
    os.environ["AUTOEDIT_WORK_DIR"] = str(d / "work")
    from autoedit import config

    config.WORK_DIR = d / "work"
    return d


@pytest.fixture(scope="session")
def sample_video(tmp_root):
    from make_sample import make_video

    return make_video(tmp_root / "raw_short.mp4", "en", size=(1280, 720), short=True)


@pytest.fixture()
def isolated_profiles(tmp_path, monkeypatch):
    from autoedit import config

    monkeypatch.setattr(config, "PROFILES_DIR", tmp_path / "profiles")
    return tmp_path / "profiles"

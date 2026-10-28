"""AutoEdit - automatic professional video editing."""
import os
import sys

__version__ = "0.3.0"

os.environ.setdefault("GLOG_minloglevel", "2")  # keep MediaPipe/LiteRT quiet
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

_default_hook = sys.unraisablehook


def _quiet_teardown(unraisable):
    # MediaPipe task objects raise harmless errors from __del__ during interpreter shutdown
    mod = getattr(getattr(unraisable, "object", None), "__module__", "") or ""
    if "mediapipe" in mod or "mediapipe" in repr(unraisable.object):
        return
    _default_hook(unraisable)


sys.unraisablehook = _quiet_teardown

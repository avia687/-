"""Thin Claude API wrapper. Every caller has a heuristic fallback, so the system runs
without a key; with ANTHROPIC_API_KEY set, editorial decisions come from Claude."""
from __future__ import annotations

import base64
import json
import logging
import os
from pathlib import Path

from . import config

log = logging.getLogger(__name__)


def available() -> bool:
    if os.environ.get("AUTOEDIT_NO_LLM"):
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _client():
    import anthropic

    return anthropic.Anthropic()


def ask_json(system: str, prompt: str, schema: dict, images: list[Path] | None = None,
             effort: str = "medium", max_tokens: int = 16000) -> dict | None:
    """Ask Claude for a JSON object matching `schema`. Returns None on any failure."""
    if not available():
        return None
    import anthropic

    content: list[dict] = []
    for img in images or []:
        data = base64.standard_b64encode(Path(img).read_bytes()).decode()
        media = "image/png" if str(img).endswith(".png") else "image/jpeg"
        content.append({"type": "image", "source": {"type": "base64", "media_type": media, "data": data}})
    content.append({"type": "text", "text": prompt})
    try:
        client = _client()
        with client.beta.messages.stream(
            model=config.CLAUDE_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            betas=["server-side-fallback-2026-07-01"],
            extra_body={"fallbacks": "default"},
        ) as stream:
            msg = stream.get_final_message()
        if msg.stop_reason == "refusal":
            log.warning("Claude declined the request; using heuristics")
            return None
        text = next((b.text for b in msg.content if b.type == "text"), None)
        return json.loads(text) if text else None
    except anthropic.AuthenticationError:
        log.error("ANTHROPIC_API_KEY is invalid; using heuristics")
    except anthropic.RateLimitError:
        log.warning("Claude rate limited; using heuristics")
    except anthropic.APIStatusError as e:
        log.warning("Claude API error %s: %s", e.status_code, e.message)
    except anthropic.APIConnectionError:
        log.warning("Claude API unreachable; using heuristics")
    except (json.JSONDecodeError, StopIteration) as e:
        log.warning("Claude returned unparsable output: %s", e)
    return None

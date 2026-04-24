"""
添削バッチ用 Claude モデル解決。

ファイル名は後方互換のため gemini_working_model.py のまま残す。
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from typing import Optional

from anthropic import Anthropic


def get_env_or_secret(key: str, default: str = "") -> str:
    val = os.environ.get(key)
    if val:
        if key == "EMAIL_PASSWORD":
            return val.replace(" ", "").replace("\u3000", "")
        return val
    return default


_model_lock = threading.Lock()
_cached_working_model = None
_configured_api_key: Optional[str] = (get_env_or_secret("ANTHROPIC_API_KEY") or "").strip() or None

DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-20240620"
DEFAULT_CLAUDE_FALLBACKS = (
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
)


def _candidate_models() -> list[str]:
    preferred = (get_env_or_secret("CLAUDE_MODEL", DEFAULT_CLAUDE_MODEL) or "").strip() or DEFAULT_CLAUDE_MODEL
    fallback_raw = (get_env_or_secret("CLAUDE_MODEL_FALLBACKS", "") or "").strip()
    if fallback_raw:
        env_fallbacks = [m.strip() for m in fallback_raw.split(",") if m.strip()]
    else:
        env_fallbacks = []
    # 常に内蔵フォールバックを末尾に足す（env 指定時でも安全側）。
    ordered = [preferred, *env_fallbacks, *DEFAULT_CLAUDE_FALLBACKS, DEFAULT_CLAUDE_MODEL]
    return list(dict.fromkeys(ordered))


@dataclass
class _SimpleResponse:
    text: str


class _ClaudeModel:
    def __init__(self, model_names: list[str], api_key: str):
        self._model_names = [m for m in model_names if m]
        self.model_name = self._model_names[0] if self._model_names else DEFAULT_CLAUDE_MODEL
        self._client = Anthropic(api_key=api_key)

    def generate_content(self, prompt: str, generation_config=None):
        generation_config = generation_config or {}
        temperature = float(generation_config.get("temperature", 0.25))
        max_tokens = int(generation_config.get("max_output_tokens", 1400))
        last_err = None
        for model_name in self._model_names:
            try:
                res = self._client.messages.create(
                    model=model_name,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    messages=[{"role": "user", "content": prompt}],
                )
                self.model_name = model_name
                parts = []
                for blk in res.content:
                    if getattr(blk, "type", None) == "text":
                        parts.append(getattr(blk, "text", ""))
                return _SimpleResponse(text="".join(parts).strip())
            except Exception as e:
                last_err = e
                # モデル名が無効な場合は次候補へフォールバックする。
                if "not_found_error" in str(e) or "model:" in str(e):
                    continue
                raise
        if last_err is not None:
            raise last_err
        raise RuntimeError("no_claude_model_candidates")


def _ensure_client_configured() -> str:
    global _configured_api_key
    key = (get_env_or_secret("ANTHROPIC_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("missing_env:ANTHROPIC_API_KEY")
    if key != _configured_api_key:
        _configured_api_key = key
        _reset_cached_model()
    return key


def get_working_model():
    global _cached_working_model
    key = _ensure_client_configured()
    if _cached_working_model is not None:
        return _cached_working_model
    with _model_lock:
        if _cached_working_model is not None:
            return _cached_working_model
        candidates = _candidate_models()
        _cached_working_model = _ClaudeModel(model_names=candidates, api_key=key)
        return _cached_working_model


def _reset_cached_model():
    global _cached_working_model
    with _model_lock:
        _cached_working_model = None


def generate_content_with_retry(
    payload,
    *,
    generation_config=None,
    request_options=None,
    max_attempts=2,
):
    del request_options
    last_err = None
    attempts = max(1, int(max_attempts or 1))
    for i in range(attempts):
        try:
            model = get_working_model()
            return model.generate_content(payload, generation_config=generation_config)
        except Exception as e:
            last_err = e
            if i >= attempts - 1:
                break
            _reset_cached_model()
    raise last_err

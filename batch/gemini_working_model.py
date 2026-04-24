"""
添削バッチ用 Gemini モデル解決（親 monorepo の services.ai に依存しない）。

google.generativeai は非推奨だが、現行の google.genai 移行までは API キー＋generateContent で動作する。
"""

from __future__ import annotations

import os
import threading
import warnings
from typing import Optional

import google.generativeai as genai
from google.generativeai.types import HarmBlockThreshold, HarmCategory

warnings.filterwarnings("ignore", category=FutureWarning)


def get_env_or_secret(key: str, default: str = "") -> str:
    val = os.environ.get(key)
    if val:
        if key == "EMAIL_PASSWORD":
            return val.replace(" ", "").replace("\u3000", "")
        return val
    return default


gemini_key = get_env_or_secret("GEMINI_API_KEY") or get_env_or_secret("GOOGLE_API_KEY")
if gemini_key:
    genai.configure(api_key=gemini_key)

_model_lock = threading.Lock()
_cached_working_model = None
_configured_api_key: Optional[str] = gemini_key or None

DEFAULT_GEMINI_MODEL = "models/gemini-flash-latest"
DEFAULT_GEMINI_FALLBACKS = (
    "gemini-2.5-flash",
    "models/gemini-2.5-flash",
    "models/gemini-2.5-flash-lite",
)


def _candidate_models() -> list[str]:
    preferred = (get_env_or_secret("GEMINI_MODEL", DEFAULT_GEMINI_MODEL) or "").strip() or DEFAULT_GEMINI_MODEL
    fallback_raw = (get_env_or_secret("GEMINI_MODEL_FALLBACKS", "") or "").strip()
    if fallback_raw:
        fallbacks = [m.strip() for m in fallback_raw.split(",") if m.strip()]
    else:
        fallbacks = list(DEFAULT_GEMINI_FALLBACKS)
    ordered = [preferred, *fallbacks]
    return list(dict.fromkeys(ordered))


def _ensure_genai_configured() -> None:
    global _configured_api_key
    key = (get_env_or_secret("GEMINI_API_KEY") or get_env_or_secret("GOOGLE_API_KEY") or "").strip()
    if not key:
        return
    if key != _configured_api_key:
        genai.configure(api_key=key)
        _configured_api_key = key
        _reset_cached_model()


def get_working_model():
    global _cached_working_model
    _ensure_genai_configured()
    if _cached_working_model is not None:
        return _cached_working_model
    safety = {
        HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
        HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
    }
    with _model_lock:
        if _cached_working_model is not None:
            return _cached_working_model
        last_err = None
        for candidate in _candidate_models():
            try:
                _cached_working_model = genai.GenerativeModel(
                    model_name=candidate, safety_settings=safety
                )
                break
            except Exception as e:
                last_err = e
        if _cached_working_model is None:
            raise RuntimeError(f"failed_to_initialize_gemini_model: {last_err}") from last_err
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
    last_err = None
    attempts = max(1, int(max_attempts or 1))
    for i in range(attempts):
        try:
            model = get_working_model()
            kwargs = {}
            if generation_config is not None:
                kwargs["generation_config"] = generation_config
            if request_options is not None:
                kwargs["request_options"] = request_options
            return model.generate_content(payload, **kwargs)
        except Exception as e:
            last_err = e
            if i >= attempts - 1:
                break
            _reset_cached_model()
    raise last_err

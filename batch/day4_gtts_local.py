"""
Day4 用 TTS（gTTS）。親リポの services/tts に依存しない。
"""

from __future__ import annotations

import re
from io import BytesIO

from gtts import gTTS

TTS_LANG = "en"
TTS_TLD = "us"
TTS_SLOW = False


def _normalize_tts_text(text):
    clean_text = str(text or "").replace("```", "").strip()
    while True:
        n = re.sub(
            r"\s*[\(（]\s*\d+\s*(?:語|words?)\s*[\)）]\s*$",
            "",
            clean_text,
            flags=re.IGNORECASE,
        )
        if n == clean_text:
            break
        clean_text = n.strip()
    clean_text = re.sub(r"\s+", " ", clean_text).strip()
    return clean_text


def _split_for_tts(text, max_len=180):
    if len(text) <= max_len:
        return [text]
    chunks = []
    current = []
    current_len = 0
    pieces = re.split(r"([.!?;:,])", text)
    for i in range(0, len(pieces), 2):
        body = (pieces[i] or "").strip()
        punct = pieces[i + 1] if i + 1 < len(pieces) else ""
        part = (body + punct).strip()
        if not part:
            continue
        part_len = len(part) + (1 if current else 0)
        if current and current_len + part_len > max_len:
            chunks.append(" ".join(current).strip())
            current = [part]
            current_len = len(part)
        else:
            current.append(part)
            current_len += part_len
    if current:
        chunks.append(" ".join(current).strip())
    return [c for c in chunks if c]


def generate_tts_bytes(text):
    try:
        fp = BytesIO()
        clean_text = _normalize_tts_text(text)
        if not clean_text:
            return None
        chunks = _split_for_tts(clean_text, max_len=180)
        for chunk in chunks:
            tts = gTTS(text=chunk, lang=TTS_LANG, tld=TTS_TLD, slow=TTS_SLOW)
            tts.write_to_fp(fp)
        return fp.getvalue()
    except Exception as e:
        print(f"gTTS生成エラー: {e}")
        return None

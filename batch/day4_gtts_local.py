"""
Day4 用 TTS（Google Cloud Text-to-Speech / WaveNet）。
親リポの services/tts に依存しない。ADC または GOOGLE_APPLICATION_CREDENTIALS が必要。
"""

from __future__ import annotations

import os
import re
from io import BytesIO
from typing import List

from google.cloud import texttospeech

# 女性寄りの US 英語 WaveNet（環境変数 DAY4_TTS_VOICE_NAME で上書き可）
TTS_VOICE_NAME = (os.environ.get("DAY4_TTS_VOICE_NAME") or "en-US-Wavenet-F").strip()
TTS_LANGUAGE_CODE = "en-US"
# Cloud TTS 同期 API の入力上限（5000 バイト）に余裕を持たせる
TTS_CHUNK_MAX_BYTES = 4800


def _normalize_tts_text(text: str) -> str:
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


def _utf8_len(s: str) -> int:
    return len(s.encode("utf-8"))


def _split_for_tts(text: str, max_bytes: int = TTS_CHUNK_MAX_BYTES) -> List[str]:
    if _utf8_len(text) <= max_bytes:
        return [text]
    chunks: List[str] = []
    current: List[str] = []
    current_bytes = 0
    pieces = re.split(r"([.!?;:,])", text)
    for i in range(0, len(pieces), 2):
        body = (pieces[i] or "").strip()
        punct = pieces[i + 1] if i + 1 < len(pieces) else ""
        part = (body + punct).strip()
        if not part:
            continue
        part_bytes = _utf8_len(part)
        gap = 1 if current else 0
        if current and current_bytes + gap + part_bytes > max_bytes:
            chunks.append(" ".join(current).strip())
            current = [part]
            current_bytes = part_bytes
        else:
            current.append(part)
            current_bytes += gap + part_bytes
    if current:
        chunks.append(" ".join(current).strip())
    return [c for c in chunks if c]


def _get_tts_client() -> texttospeech.TextToSpeechClient:
    return texttospeech.TextToSpeechClient()


def _synthesize_chunk(client: texttospeech.TextToSpeechClient, chunk: str) -> bytes:
    response = client.synthesize_speech(
        input=texttospeech.SynthesisInput(text=chunk),
        voice=texttospeech.VoiceSelectionParams(
            language_code=TTS_LANGUAGE_CODE,
            name=TTS_VOICE_NAME,
        ),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
        ),
    )
    audio = response.audio_content
    if not audio:
        raise RuntimeError("empty_audio_content")
    return audio


def generate_tts_bytes(text: str) -> bytes | None:
    try:
        clean_text = _normalize_tts_text(text)
        if not clean_text:
            return None
        chunks = _split_for_tts(clean_text, max_bytes=TTS_CHUNK_MAX_BYTES)
        client = _get_tts_client()
        fp = BytesIO()
        for chunk in chunks:
            fp.write(_synthesize_chunk(client, chunk))
        return fp.getvalue()
    except Exception as e:
        print(f"Cloud TTS（WaveNet）生成エラー: {e}")
        return None

import os
from typing import Optional

from day4_gtts_local import generate_tts_bytes


def synthesize_mp3_to_path(*, text: str, out_path: str) -> Optional[str]:
    audio = generate_tts_bytes(text)
    if not audio:
        return None
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(audio)
    return out_path

from __future__ import annotations

import os
from typing import Optional

import qrcode


def make_qr_png(*, url: str, out_path: str, box_size: int = 8, border: int = 4) -> Optional[str]:
    if not url or not url.strip():
        return None
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(url.strip())
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path)
    return out_path


from __future__ import annotations

import os
from datetime import timedelta
from typing import Optional


def _require_env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        raise RuntimeError(f"missing_env:{name}")
    return val


def upload_mp3_and_get_signed_url(*, local_path: str, object_name: str, expires_days: int) -> str:
    """
    GCSへmp3をアップロードし、署名付きURLを返します（QRへ埋め込む用途）。
    前提: GOOGLE_APPLICATION_CREDENTIALS が設定済みであること。
    """
    from google.cloud import storage

    bucket_name = _require_env("GCS_BUCKET_NAME")

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(object_name)

    # 明示的にcontent-typeを付けると、配信側の扱いが安定します。
    blob.upload_from_filename(local_path, content_type="audio/mpeg")

    url = blob.generate_signed_url(
        expiration=timedelta(days=int(expires_days)),
        method="GET",
    )
    return url


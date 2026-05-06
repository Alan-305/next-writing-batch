from __future__ import annotations

import os
from datetime import timedelta
from typing import Optional


def _bucket_candidates_from_env() -> list[str]:
    # Firebase Storage は実体が GCS バケットなので、Firebase 系の env も許可する。
    out: list[str] = []
    for key in ("GCS_BUCKET_NAME", "FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"):
        val = os.environ.get(key, "").strip()
        if val:
            out.append(val)
            # Firebase の Web 設定が `*.firebasestorage.app` でも、
            # 実バケットが `*.appspot.com` のプロジェクトがあるため両方試す。
            if val.endswith(".firebasestorage.app"):
                out.append(f"{val.removesuffix('.firebasestorage.app')}.appspot.com")
            if val.endswith(".appspot.com"):
                out.append(f"{val.removesuffix('.appspot.com')}.firebasestorage.app")
    # 重複除去（順序維持）
    uniq: list[str] = []
    seen = set()
    for b in out:
        if b not in seen:
            uniq.append(b)
            seen.add(b)
    return uniq


def upload_mp3_and_get_signed_url(*, local_path: str, object_name: str, expires_days: int) -> str:
    """
    GCSへmp3をアップロードし、署名付きURLを返します（QRへ埋め込む用途）。
    前提: GOOGLE_APPLICATION_CREDENTIALS が設定済みであること。
    """
    from google.cloud import storage

    bucket_candidates = _bucket_candidates_from_env()
    if not bucket_candidates:
        raise RuntimeError("missing_env:GCS_BUCKET_NAME")

    client = storage.Client()
    last_err: Exception | None = None
    for bucket_name in bucket_candidates:
        try:
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(object_name)
            # 明示的にcontent-typeを付けると、配信側の扱いが安定します。
            blob.upload_from_filename(local_path, content_type="audio/mpeg")
            return blob.generate_signed_url(
                expiration=timedelta(days=int(expires_days)),
                method="GET",
            )
        except Exception as e:
            last_err = e
            continue

    if last_err is not None:
        raise last_err
    raise RuntimeError("upload_failed")


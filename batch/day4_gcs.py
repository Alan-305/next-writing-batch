from __future__ import annotations

import os
from datetime import timedelta
from typing import Optional


def _bucket_candidates_from_env() -> list[str]:
    # Day4 では明示設定された専用バケットを最優先する。
    # ここで Firebase 系の候補まで混ぜると、存在しない *.appspot.com 側にフォールバックして
    # 原因が見えづらくなるため、GCS_BUCKET_NAME がある場合はそれだけを使う。
    explicit = os.environ.get("GCS_BUCKET_NAME", "").strip()
    if explicit:
        return [explicit]

    # 互換: GCS_BUCKET_NAME が未設定のときだけ Firebase 系 env を候補にする。
    out: list[str] = []
    for key in ("FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"):
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
    import google.auth
    from google.auth.transport.requests import Request

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

            # Cloud Run の ADC（Metadata 経由トークン）では秘密鍵を持たないため、
            # service_account_email + access_token を明示して IAM 署名で URL を作る。
            credentials, _project = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            if not credentials.valid:
                credentials.refresh(Request())
            service_account_email = getattr(credentials, "service_account_email", None)
            access_token = getattr(credentials, "token", None)

            if service_account_email and access_token:
                return blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(days=int(expires_days)),
                    method="GET",
                    service_account_email=service_account_email,
                    access_token=access_token,
                )

            return blob.generate_signed_url(
                version="v4",
                expiration=timedelta(days=int(expires_days)),
                method="GET",
            )
        except Exception as e:
            last_err = e
            continue

    if last_err is not None:
        tried = ", ".join(bucket_candidates)
        raise RuntimeError(f"gcs_upload_failed: tried buckets=[{tried}] last_error={last_err}") from last_err
    raise RuntimeError("upload_failed")


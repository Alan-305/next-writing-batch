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


# GCS V4 署名付き URL の上限（秒）。これを超えると期限切れ後に SignatureDoesNotMatch になる。
GCS_V4_SIGNED_URL_MAX_SECONDS = 604800


def _upload_mp3_blob(*, local_path: str, object_name: str):
    """GCS へ mp3 を上げ、成功した blob を返す。"""
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
            blob.upload_from_filename(local_path, content_type="audio/mpeg")
            return blob
        except Exception as e:
            last_err = e
            continue

    if last_err is not None:
        tried = ", ".join(bucket_candidates)
        raise RuntimeError(f"gcs_upload_failed: tried buckets=[{tried}] last_error={last_err}") from last_err
    raise RuntimeError("upload_failed")


def upload_mp3_to_gcs(*, local_path: str, object_name: str) -> None:
    """GCS へ mp3 をアップロードする（署名 URL は作らない）。"""
    _upload_mp3_blob(local_path=local_path, object_name=object_name)


def public_audio_url_for_day4(*, task_id: str, mp3_filename: str) -> Optional[str]:
    """
    QR / Firestore 用の安定した公開 URL（アプリが GCS またはローカル output から配信）。
    AUDIO_BASE_URL または NWB_PUBLIC_APP_URL が必要。
    """
    # 独自ドメインが Cloud Run に未接続でも動くよう、実サービス URL を優先する。
    base = (os.environ.get("NWB_PUBLIC_APP_URL") or os.environ.get("AUDIO_BASE_URL") or "").strip().rstrip("/")
    if not base:
        return None
    tid = (task_id or "").strip()
    fn = (mp3_filename or "").strip()
    if not tid or not fn or ".." in tid or ".." in fn or "/" in fn or "\\" in fn:
        return None
    return f"{base}/api/day4-audio/{tid}/{fn}"


def upload_mp3_and_get_signed_url(*, local_path: str, object_name: str, expires_days: int) -> str:
    """
    GCSへmp3をアップロードし、署名付きURLを返します（公開ベース URL が無いときのフォールバック）。
    V4 署名は最大 7 日。それ以上を指定しても 7 日に切り詰めます。
    前提: GOOGLE_APPLICATION_CREDENTIALS が設定済みであること。
    """
    import google.auth
    from google.auth.transport.requests import Request

    blob = _upload_mp3_blob(local_path=local_path, object_name=object_name)

    requested = int(expires_days)
    expiration = timedelta(seconds=min(max(1, requested) * 86400, GCS_V4_SIGNED_URL_MAX_SECONDS))

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
            expiration=expiration,
            method="GET",
            service_account_email=service_account_email,
            access_token=access_token,
        )

    return blob.generate_signed_url(
        version="v4",
        expiration=expiration,
        method="GET",
    )


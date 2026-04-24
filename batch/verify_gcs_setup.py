#!/usr/bin/env python3
"""
Day4 用の GCS 設定を検証します（オブジェクト1件のアップロード → 署名付きURL生成 →
（既定）HTTP GET で本文確認 → 削除）。

前提:
  - 環境変数 GCS_BUCKET_NAME（または --bucket）
  - 環境変数 GOOGLE_APPLICATION_CREDENTIALS（または --credentials）
  - その SA に対象バケットへのオブジェクト作成・削除（推奨: バケット単位で roles/storage.objectAdmin）
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify GCS credentials and bucket for Day4.")
    parser.add_argument(
        "--bucket",
        default="",
        help="Override GCS_BUCKET_NAME (otherwise read from environment)",
    )
    parser.add_argument(
        "--credentials",
        default="",
        help="Override GOOGLE_APPLICATION_CREDENTIALS (otherwise read from environment)",
    )
    parser.add_argument(
        "--no-fetch",
        action="store_true",
        help="Skip HTTP GET on the signed URL (e.g. strict outbound firewall)",
    )
    args = parser.parse_args()

    bucket_name = (args.bucket or os.environ.get("GCS_BUCKET_NAME") or "").strip()
    cred_path = (args.credentials or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
    if args.credentials.strip():
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

    if not bucket_name:
        print("GCS_BUCKET_NAME が未設定です。export するか --bucket を指定してください。", file=sys.stderr)
        return 1
    if not cred_path:
        print(
            "GOOGLE_APPLICATION_CREDENTIALS が未設定です。サービスアカウント JSON の絶対パスを export してください。",
            file=sys.stderr,
        )
        return 1
    if not os.path.isfile(cred_path):
        print(f"鍵ファイルが見つかりません: {cred_path!r}", file=sys.stderr)
        return 1

    try:
        from google.cloud import storage
    except ImportError:
        print("google-cloud-storage が入っていません。./.venv/bin/python3 -m pip install -r requirements.txt", file=sys.stderr)
        return 1

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    object_name = f"__healthcheck/{uuid.uuid4().hex}.txt"
    blob = bucket.blob(object_name)

    try:
        blob.upload_from_string(b"ok", content_type="text/plain")
    except Exception as e:  # noqa: BLE001 — surface any API error to the user
        print(f"アップロードに失敗しました（権限・バケット名・API 有効化を確認）: {e}", file=sys.stderr)
        return 1

    try:
        url = blob.generate_signed_url(expiration=timedelta(minutes=10), method="GET")
        if not url or not url.startswith("http"):
            print(f"署名付きURLの生成結果が想定外です: {url!r}", file=sys.stderr)
            return 1
    except Exception as e:  # noqa: BLE001
        print(f"署名付きURLの生成に失敗しました: {e}", file=sys.stderr)
        try:
            blob.delete()
        except Exception:
            pass
        return 1

    if not args.no_fetch:
        try:
            with urlopen(url, timeout=30) as resp:
                if resp.status != 200:
                    print(f"署名付きURLの GET が 200 以外でした: status={resp.status}", file=sys.stderr)
                    try:
                        blob.delete()
                    except Exception:
                        pass
                    return 1
                body = resp.read()
                if body != b"ok":
                    print(
                        f"署名付きURLの本文が想定と異なります（アップロード内容の不一致）: {body!r}",
                        file=sys.stderr,
                    )
                    try:
                        blob.delete()
                    except Exception:
                        pass
                    return 1
        except HTTPError as e:
            print(f"署名付きURLへの GET が失敗しました（HTTP {e.code}）: {e}", file=sys.stderr)
            try:
                blob.delete()
            except Exception:
                pass
            return 1
        except URLError as e:
            print(
                "署名付きURLへの GET が失敗しました（ネットワーク・プロキシ・ファイアウォールを確認。"
                "オフライン検証なら --no-fetch）:",
                e,
                file=sys.stderr,
            )
            try:
                blob.delete()
            except Exception:
                pass
            return 1

    try:
        blob.delete()
    except Exception as e:  # noqa: BLE001
        print(f"検証用オブジェクトの削除に失敗しました（手動で削除してください）: gs://{bucket_name}/{object_name}\n{e}", file=sys.stderr)
        return 1

    if args.no_fetch:
        print("GCS 接続確認: OK（アップロード・署名付きURL・削除まで成功）")
    else:
        print("GCS 接続確認: OK（アップロード・署名付きURL・HTTP取得・削除まで成功）")
    print(f"  bucket: {bucket_name}")
    print(f"  credentials: {cred_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

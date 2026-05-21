#!/usr/bin/env python3
"""
添削・Day4 バッチが動く前提を、専門用語を抑えて確認するスクリプト。

使い方（ターミナル）:
  cd next-writing-batch
  ./.venv/bin/python3 batch/check_setup.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)

from env_local import hydrate_claude_key_from_disk, load_env_local  # noqa: E402


def _print_tts_setup_help(root: Path) -> None:
    creds = (os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
    print("[要対応] Cloud TTS（WaveNet）を使えません。次を確認してください:")
    if creds:
        print(f"  ・GOOGLE_APPLICATION_CREDENTIALS={creds}（.env.local から読込可）")
    else:
        print("  ・gcloud auth application-default login")
        print("  ・または .env.local に GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json")
    print("  ・GCP で Cloud Text-to-Speech API を有効化")
    print("  ・サービスアカウントに roles/cloudtexttospeech.user（または Editor）")


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    os.chdir(root)
    load_env_local(root)
    hydrate_claude_key_from_disk(root)
    print("=== 動作チェック（next-writing-batch） ===\n")

    ok = True
    vpy = root / ".venv" / "bin" / "python3"
    if vpy.exists():
        print("[OK] 仮想環境 .venv が見つかります。")
    else:
        print("[要対応] .venv がありません。次を実行してください:")
        print("  python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt")
        ok = False

    def pip_mod(name: str, import_name: str | None = None) -> bool:
        try:
            __import__(import_name or name)
            print(f"[OK] Python パッケージ「{name}」が使えます。")
            return True
        except Exception as e:
            print(f"[要対応] パッケージ「{name}」を読み込めません: {e}")
            print(f"  ./.venv/bin/pip install -r requirements.txt を試してください。")
            return False

    pip_mod("anthropic")
    pip_mod("google.cloud.texttospeech", "google.cloud.texttospeech")
    pip_mod("reportlab")

    key = (os.environ.get("NEXT_WRITING_BATCH_KEY") or "").strip()
    key_file = root / "data" / "anthropic_api_key.txt"
    env_local = root / ".env.local"
    if key:
        src = ".env.local" if env_local.is_file() else "環境変数"
        print(f"[OK] Claude 用の API キーがあります（{src} または export）。")
    elif key_file.is_file() and key_file.read_text(encoding="utf-8").strip():
        hydrate_claude_key_from_disk(root)
        print("[OK] data/anthropic_api_key.txt にキーが保存されています。")
    else:
        print("[要対応] API キーがありません。次のいずれかを行ってください:")
        print("  ・next-writing-batch/.env.local に NEXT_WRITING_BATCH_KEY=… を書く（このスクリプトは自動読込）")
        print("  ・運用画面「Claude API キー」から data/anthropic_api_key.txt に保存")
        print("  ・export NEXT_WRITING_BATCH_KEY='…'")
        ok = False

    batch_dir = root / "batch"
    if str(batch_dir) not in sys.path:
        sys.path.insert(0, str(batch_dir))
    from org_paths import submissions_json  # noqa: E402

    subs = Path(submissions_json(str(root)))
    if subs.is_file():
        try:
            data = json.loads(subs.read_text(encoding="utf-8"))
            n = len(data) if isinstance(data, list) else 0
            print(f"[OK] {subs} が読めます（{n} 件）。NWB_ORGANIZATION_ID 未設定時は default テナントです。")
        except Exception as e:
            print(f"[要対応] submissions.json が壊れている可能性: {e}")
            ok = False
    else:
        print(f"[情報] {subs} がありません（まだ提出が無い状態）。NWB_ORGANIZATION_ID でテナントを切り替えられます。")

    try:
        from gemini_working_model import get_working_model  # noqa: E402

        get_working_model()
        print("[OK] Claude モデルの準備までできました（API キーが有効なら通信も可能です）。")
    except Exception as e:
        print(f"[要対応] Claude モデル初期化に失敗: {e}")
        ok = False

    try:
        from nl_essay_feedback import build_nl_essay_prompt  # noqa: E402

        build_nl_essay_prompt(question="Q", user_answer="Hello.", multipart=False)
        print("[OK] 添削用プロンプトの組み立てができました。")
    except Exception as e:
        print(f"[要対応] 添削プロンプトの読み込みに失敗: {e}")
        ok = False

    try:
        from day4_gtts_local import generate_tts_bytes  # noqa: E402

        b = generate_tts_bytes("Hello.")
        if b:
            print("[OK] 音声合成（Cloud TTS / WaveNet）のテストができました。")
        else:
            _print_tts_setup_help(root)
            ok = False
    except Exception as e:
        err = str(e)
        if "SERVICE_DISABLED" in err or "has not been used in project" in err:
            print("[要対応] Cloud Text-to-Speech API が GCP プロジェクトで無効です。")
            if "project=" in err:
                m = re.search(r"project=(\d+)", err)
                if m:
                    pid = m.group(1)
                    print(
                        f"  ・有効化: https://console.developers.google.com/apis/api/texttospeech.googleapis.com/overview?project={pid}"
                    )
            print("  ・有効化後、数分待ってから check_setup を再実行してください。")
        else:
            print(f"[要対応] 音声合成に失敗: {e}")
            _print_tts_setup_help(root)
        ok = False

    print("\n=== 結果 ===")
    if ok:
        print("問題なさそうです。ブラウザの「添削」やターミナルの run_day3_proofread.py を試せます。")
        return 0
    print("上の [要対応] を直してから、もう一度このスクリプトを実行してください。")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

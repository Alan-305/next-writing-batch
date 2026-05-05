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
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    os.chdir(root)
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
    pip_mod("gtts")
    pip_mod("reportlab")

    key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    key_file = root / "data" / "anthropic_api_key.txt"
    if key:
        print("[OK] 環境変数に Claude 用の API キーがあります。")
    elif key_file.is_file() and key_file.read_text(encoding="utf-8").strip():
        print("[OK] data/anthropic_api_key.txt にキーが保存されています。")
    else:
        print("[要対応] API キーがありません。次のいずれかを行ってください:")
        print("  ・.env.local に ANTHROPIC_API_KEY=（あなたのキー）と書き、npm run dev を再起動")
        print("  ・運用画面「Claude API キー」から保存")
        print("  ・このチェックの前に: export ANTHROPIC_API_KEY='…'")
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
            print("[OK] 音声合成（gTTS）のテストができました。")
        else:
            print("[注意] gTTS は動きましたが音声データが空でした（ネットワークを確認）。")
    except Exception as e:
        print(f"[要対応] 音声合成に失敗: {e}")
        ok = False

    print("\n=== 結果 ===")
    if ok:
        print("問題なさそうです。ブラウザの「添削」やターミナルの run_day3_proofread.py を試せます。")
        return 0
    print("上の [要対応] を直してから、もう一度このスクリプトを実行してください。")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

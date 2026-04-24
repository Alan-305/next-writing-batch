"""Japanese-capable TrueType for Day4 PDFs (ReportLab cannot render CJK with Helvetica)."""

from __future__ import annotations

import os
import threading
import urllib.error
import urllib.request

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Variable TTF (TrueType outlines). OFL — see https://github.com/google/fonts/tree/main/ofl/notosansjp
_NOTO_SANS_JP_VARIABLE_URL = (
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf"
)
_LOCAL_FONT_NAME = "NotoSansJP-Variable.ttf"
_MIN_FONT_BYTES = 500_000
_REGISTERED: str | None = None
_LOCK = threading.Lock()


def _batch_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def _default_font_path() -> str:
    return os.path.join(_batch_dir(), "fonts", _LOCAL_FONT_NAME)


def _env_font_path() -> str | None:
    env = (os.environ.get("DAY4_JP_FONT") or "").strip()
    return env or None


def _download_noto_variable(dest_path: str) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    tmp = f"{dest_path}.part"
    try:
        urllib.request.urlretrieve(_NOTO_SANS_JP_VARIABLE_URL, tmp)
        if not os.path.isfile(tmp) or os.path.getsize(tmp) < _MIN_FONT_BYTES:
            raise OSError("downloaded font file missing or too small")
        os.replace(tmp, dest_path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _noto_path_if_ready() -> str | None:
    p = _default_font_path()
    if os.path.isfile(p) and os.path.getsize(p) >= _MIN_FONT_BYTES:
        return p
    return None


def _resolve_font_path() -> str:
    env_p = _env_font_path()
    if env_p:
        if os.path.isfile(env_p) and os.path.getsize(env_p) >= _MIN_FONT_BYTES:
            return env_p
        raise RuntimeError(
            f"Day4 PDF: DAY4_JP_FONT が無効です（ファイルが無いか小さすぎます）: {env_p!r}"
        )

    ready = _noto_path_if_ready()
    if ready:
        return ready

    dest = _default_font_path()
    try:
        _download_noto_variable(dest)
    except (OSError, urllib.error.URLError) as e:
        raise RuntimeError(
            "Day4 PDF: Noto Sans JP をダウンロードできませんでした（オフライン等）。\n"
            "  次のいずれかを行ってください:\n"
            f"  1) ブラウザ等で次を保存し、{dest} に置く\n"
            f"     {_NOTO_SANS_JP_VARIABLE_URL}\n"
            "  2) 環境変数 DAY4_JP_FONT に、日本語対応の .ttf（TrueType）の絶対パスを指定する\n"
            "  ※ macOS の Arial Unicode への自動フォールバックは、プレビューで欠ける報告があるため廃止しました。"
        ) from e

    ready = _noto_path_if_ready()
    if ready:
        return ready
    raise RuntimeError(
        f"Day4 PDF: フォント取得後も {dest!r} が有効になりませんでした。"
        "ディスク容量と書き込み権限を確認してください。"
    )


def ensure_day4_sans_font() -> str:
    """
    Register and return a ReportLab font name (Day4Sans) covering Japanese + Latin.
    Thread-safe for parallel Day4 workers.
    """
    global _REGISTERED
    if _REGISTERED:
        return _REGISTERED
    with _LOCK:
        if _REGISTERED:
            return _REGISTERED
        path = _resolve_font_path()
        try:
            # asciiReadable=False: マルチバイトを 16 進文字列で出し、ビューアでの欠けを防ぐ
            pdfmetrics.registerFont(TTFont("Day4Sans", path, asciiReadable=False))
        except Exception as e:
            raise RuntimeError(
                f"Day4 PDF: フォントを読み込めませんでした: {path!r} ({e}). "
                "TrueType（PostScript アウトラインではない .ttf）であることを確認してください。"
            ) from e
        _REGISTERED = "Day4Sans"
        return _REGISTERED

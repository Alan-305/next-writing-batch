from __future__ import annotations

import difflib
import os
import re
from typing import Callable, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from day4_pdf_fonts import ensure_day4_sans_font

from nl_essay_feedback import (
    canonicalize_growth_hint_heading_explanation,
    canonicalize_legacy_grammar_heading_explanation,
    normalize_student_explanation_text,
    strip_final_essay_artifacts,
)

# Layout constants (A4 return sheet)
MARGIN_X_MM = 16
MARGIN_TOP_MM = 16
MARGIN_BOTTOM_MM = 18
BLOCK_GAP_MM = 4.0
LINE_STEP_MM = 5.4
TITLE_TO_BODY_MM = 6
MIN_FONT_PT = 7.5
START_BODY_FONT_PT = 10.8
TITLE_FONT_PT = 11.5
HEADER_TITLE_PT = 13.5
MAX_LINES_PER_BLOCK = 28
EXPLAIN_BODY_FONT_PT = 10.2
# 解説見出し（誤→正）を本文より少し強調
EXPLAIN_HEAD_FONT_PT = 10.8
# 完成版下の QR（A4 1枚に収めやすくするためやや小さめ）
QR_SIZE_MM = 24

# student-release.ts の buildExplanationFromSections と同一。旧データの【文法】は PDF 側で下位互換。
_GRAMMAR_HEAD = "【文法・語法・表現】"
_GRAMMAR_HEAD_LEGACY = "【文法】"
_CONTENT_HEAD = "【内容】"
_HINT_HEAD = "【ヒント】"
_CIRCLED_HEAD_RE = re.compile(r"^[\u2460-\u2473]+")
# 旧: 完成版の差分赤。現在は完成版を黒一色で統一（画面 /result と同趣旨）。
_REVISION_RED = colors.HexColor("#b91c1c")


def _grammar_header_marker_in(text: str) -> Optional[str]:
    """explanation 内で最初に現れる文法ブロック見出し（同一位置なら新ラベルを優先）。"""
    hits: List[Tuple[int, str]] = []
    for key in (_GRAMMAR_HEAD, _GRAMMAR_HEAD_LEGACY):
        i = text.find(key)
        if i >= 0:
            hits.append((i, key))
    if not hits:
        return None
    min_i = min(h[0] for h in hits)
    at = [k for i, k in hits if i == min_i]
    return _GRAMMAR_HEAD if _GRAMMAR_HEAD in at else at[0]


def _canonical_grammar_heading_line(line: str) -> str:
    """描画・正規化用に見出しを新表記へ。"""
    s = line.strip()
    if s == _GRAMMAR_HEAD_LEGACY:
        return _GRAMMAR_HEAD
    return line


def _norm_text(s: str) -> str:
    return (s or "").replace("\r\n", "\n").replace("\r", "\n").strip()


# 和文の行頭禁則（句読点）。ASCII の , . は英語折り返しと干渉しうるため含めない。
_JP_LINE_HEAD_FORBID = frozenset("、。，．")


def _reflow_wrapped_lines_avoid_jp_punct_head(
    lines: List[str],
    *,
    measure: Callable[[str], float],
    max_width: float,
) -> List[str]:
    """折り返し後の行頭に句読点が来ないよう、前行末へ寄せる（幅が許すときのみ）。"""
    if not lines:
        return lines
    out: List[str] = [lines[0]]
    for i in range(1, len(lines)):
        cur = lines[i]
        while cur and out and cur[0] in _JP_LINE_HEAD_FORBID:
            ch = cur[0]
            rest = cur[1:]
            trial = out[-1] + ch
            if measure(trial) <= max_width:
                out[-1] = trial
                cur = rest
            else:
                break
        if cur:
            out.append(cur)
    return out


def _wrap_words_to_width(
    c: canvas.Canvas,
    text: str,
    *,
    font: str,
    font_size: float,
    max_width: float,
) -> List[str]:
    """Wrap by words to fit max_width in PDF units."""
    t = re.sub(r"\s+", " ", _norm_text(text))
    if not t:
        return []

    def measure(s: str) -> float:
        return c.stringWidth(s, font, font_size)

    words = t.split(" ")
    lines: List[str] = []
    line = ""
    for w in words:
        trial = (line + " " + w).strip()
        if measure(trial) <= max_width:
            line = trial
        else:
            if line:
                lines.append(line)
            # Single long token: hard-break
            if measure(w) <= max_width:
                line = w
            else:
                chunk = ""
                for ch in w:
                    t2 = chunk + ch
                    if measure(t2) <= max_width:
                        chunk = t2
                    else:
                        if chunk:
                            if ch in _JP_LINE_HEAD_FORBID and len(chunk) >= 1:
                                lines.append(chunk[:-1])
                                chunk = chunk[-1] + ch
                            else:
                                lines.append(chunk)
                                chunk = ch
                        else:
                            chunk = ch
                line = chunk
    if line:
        lines.append(line)
    return _reflow_wrapped_lines_avoid_jp_punct_head(lines, measure=measure, max_width=max_width)


def _fit_lines(
    c: canvas.Canvas,
    text: str,
    *,
    font: str,
    max_width: float,
    max_lines: int,
) -> Tuple[List[str], float]:
    """
    Choose largest font in [MIN_FONT_PT, START_BODY_FONT_PT] that fits max_lines,
    or shrink and truncate with ellipsis.
    """
    size = START_BODY_FONT_PT
    while size >= MIN_FONT_PT:
        lines = _wrap_words_to_width(c, text, font=font, font_size=size, max_width=max_width)
        if len(lines) <= max_lines:
            return lines, size
        size -= 0.5
    lines = _wrap_words_to_width(c, text, font=font, font_size=MIN_FONT_PT, max_width=max_width)
    if len(lines) <= max_lines:
        return lines, MIN_FONT_PT
    lines = lines[:max_lines]
    if lines:
        last = lines[-1]
        ell = "…"
        while last and c.stringWidth(last + ell, font, MIN_FONT_PT) > max_width:
            last = last[:-1]
        lines[-1] = (last + ell).strip()
    return lines, MIN_FONT_PT


def _count_english_words(text: str) -> int:
    t = (text or "").strip()
    if not t:
        return 0
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", t)
    return len(words)


def _strip_trailing_word_count_marker(s: str) -> str:
    t = (s or "").strip()
    t = re.sub(r"\s*[\(（]\s*\d+\s*(?:語|words?)\s*[\)）]\s*$", "", t, flags=re.IGNORECASE)
    return t.rstrip()


def _final_essay_with_word_count_line(text: str) -> str:
    """完成版本文の直後に英語の語数のみ表記（別行）。改行は空白に寄せて段落表示。"""
    base = _strip_trailing_word_count_marker(_norm_text(text))
    if not base:
        return ""
    base = re.sub(r"\s+", " ", base.replace("\n", " ")).strip()
    n = _count_english_words(base)
    return f"{base}\n（{n} words）"


def _normalize_deduction_marks(s: str) -> str:
    """PDF フォントで欠ける減号を ASCII ハイフンにそろえる。"""
    if not s:
        return s
    t = s
    for u in (
        "\u2796",
        "\u2212",
        "\uff0d",
        "\u2012",
        "\u2013",
        "\u2014",
        "➖",
        "－",
    ):
        t = t.replace(u, "-")
    t = re.sub(r"（\s*-\s*", "（-", t)
    t = re.sub(r"\(\s*-\s*", "(-", t)
    return t


def _insert_jp_wrap_spaces(s: str) -> str:
    """和文は句読点で強制区切りしない（不自然な改行を避ける）。"""
    return _norm_text(s)


def _is_explanation_deduction_summary_line(s: str) -> bool:
    """減点合計行には ● を付けない。"""
    t = s.strip()
    return bool(re.match(r"^(文法|内容)減点\s*合計\s*[:：]", t))


def _strip_content_line_markers(ln: str) -> str:
    """【内容】ブロック用: 行頭の ● / ○ / Step 1 ラベルを除去（文法ブロックには使わない）。"""
    m = re.match(r"^(\s*)(.*)$", ln)
    indent, rest = (m.group(1), m.group(2)) if m else ("", ln)
    t = rest
    while True:
        n = re.sub(r"^(?:●|○)\s*", "", t)
        if n == t:
            break
        t = n
    t = re.sub(r"(?i)^step\s*1\s*[：:．.]?\s*", "", t)
    return indent + t


def _content_line_skips_strip(st: str) -> bool:
    """見出し・減点行などはマーカー除去の対象外にしない（そのまま）。"""
    t = st.strip()
    if not t:
        return True
    if t == _CONTENT_HEAD:
        return True
    if _is_explanation_deduction_summary_line(st):
        return True
    return False


def _ensure_content_bullet_lines(text: str) -> str:
    """【内容】ブロックでは ● を付けない。既存の ● / Step 1 ラベルは除去する。"""
    nt = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    gkey = _grammar_header_marker_in(nt)
    if gkey:
        gi = nt.index(gkey)
        head, tail = nt[:gi], nt[gi:]
    else:
        head, tail = nt, ""
    lines = head.split("\n")
    out: List[str] = []
    seen_content = False
    for ln in lines:
        st = ln.strip()
        if st == _CONTENT_HEAD:
            seen_content = True
            out.append(ln)
            continue
        if not seen_content:
            out.append(ln)
            continue
        if re.match(r"^\s*内容減点\s*合計\s*[:：]", ln):
            out.append(ln)
            seen_content = False
            continue
        if not st:
            out.append(ln)
            continue
        if _content_line_skips_strip(ln):
            out.append(ln)
            continue
        out.append(_strip_content_line_markers(ln))
    merged_head = "\n".join(out)
    return merged_head + tail if tail else merged_head


def _ensure_grammar_bullet_lines(text: str) -> str:
    """文法ブロック見出し以降の各行の先頭に ● が無ければ付与する。"""
    key = _grammar_header_marker_in(text)
    if not key:
        return text
    i = text.index(key)
    before = text[: i + len(key)]
    after = text[i + len(key) :]
    lines = after.split("\n")
    out: List[str] = []
    for ln in lines:
        if not ln.strip():
            out.append(ln.rstrip() if ln else "")
            continue
        s = ln.strip()
        if _is_explanation_deduction_summary_line(s):
            out.append(s)
        elif s.startswith(("●", "○")):
            out.append(s)
        else:
            out.append(f"● {s}")
    new_after = "\n".join(out).lstrip("\n")
    return before + ("\n" + new_after if new_after else "")


def _split_explanation_head_body(chunk: str) -> Tuple[str, str]:
    """「誤り → 正：解説…」を見出しと本文に分ける（全角コロン優先）。"""
    ch = chunk.strip()
    if not ch:
        return "", ""
    if "：" in ch:
        i = ch.index("：")
        return ch[:i].strip(), ch[i + 1 :].strip()
    # ASCII colon only when it separates head (contains →) from body
    if "→" in ch:
        m = re.search(r"(?<=[^\s]):(?=\s)", ch)
        if m:
            head = ch[: m.start()].strip()
            body = ch[m.end() :].strip()
            if head:
                return head, body
    return ch, ""


def _format_explanation_bullets(raw: str) -> str:
    """
    解説テキストを ● 単位で分割し、各項目を
    ● 誤り → 正：解説本文（改行せず 1 論理行）
    の形にそろえる。【内容】等の見出し行には ● を付けない。
    """
    t = _normalize_deduction_marks(_norm_text(raw))
    if not t:
        return ""
    parts = [p.strip() for p in re.split(r"\s*[●○]\s*", t) if p.strip()]
    blocks: List[str] = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        m_hdr = re.match(r"^(【[^】]+】)\s*(.*)$", p, re.DOTALL)
        if m_hdr:
            hdr, rest = m_hdr.group(1).strip(), (m_hdr.group(2) or "").strip()
            blocks.append(hdr)
            if not rest:
                blocks.append("")
                continue
            p = rest
        head, body = _split_explanation_head_body(p)
        if not head:
            continue
        body_n = _normalize_deduction_marks(body) if body else ""
        if "→" in head:
            line = f"● {head}：{body_n}" if body_n else f"● {head}"
            blocks.append(line)
        else:
            blocks.append(head)
            if body_n:
                blocks.append(body_n)
        blocks.append("")
    # 空ブロックを除き、【内容】と次行の間に余白行が入らないようにする
    return "\n".join(b for b in blocks if b.strip()).strip()


def _line_step_for_font(font_pt: float) -> float:
    return LINE_STEP_MM * mm * max(0.85, min(1.15, font_pt / START_BODY_FONT_PT))


def _circled_bold_prefix_and_tail(stripped: str) -> Tuple[str, str]:
    """①〜⑳ 始まりの行で、太字にする番号＋小見出しと残りを分ける。"""
    m = re.match(r"^([\u2460-\u2473]+\s*)(.*)$", stripped)
    if not m:
        return "", stripped
    circ, rest = m.group(1), m.group(2)
    end = len(rest)
    for ch in ("。", "、", "（", "：", "\n"):
        i = rest.find(ch)
        if i != -1:
            end = min(end, i)
    return circ + rest[:end], rest[end:]


def _split_post_arrow_correct_suffix(post_arrow: str) -> Tuple[str, str]:
    """→ 右側を「正しい英語」と日本語解説に分ける（全角コロン優先、student-release / HTML と同趣旨）。"""
    p = post_arrow.strip()
    if not p:
        return "", ""
    if "：" in p:
        i = p.index("：")
        return p[:i].strip(), p[i + 1 :].strip()
    m = re.search(r"(?<=[^\s]):(?=\s)", p)
    if m:
        head = p[: m.start()].strip()
        body = p[m.end() :].strip()
        if head:
            return head, body
    return p, ""


def _draw_fake_bold_string(
    c: canvas.Canvas,
    *,
    x: float,
    y: float,
    text: str,
    font: str,
    font_size: float,
) -> float:
    """日本語フォントに Bold 面が無い場合の太字風（2重描画）。戻り値: 幅（1回分）。"""
    if not text:
        return 0.0
    c.setFont(font, font_size)
    c.setFillColor(colors.black)
    c.drawString(x, y, text)
    c.drawString(x + 0.28, y, text)
    return c.stringWidth(text, font, font_size)


def _normalize_essay_for_flow_display(s: str) -> str:
    """final-essay-diff-html.ts normalizeEssayForFlowDisplay と同一。"""
    t = (s or "").replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"[ \t\u00a0]+", " ", t)
    t = re.sub(r"\s*\n+\s*", " ", t)
    return t.strip()


def _tokens_words_with_space(s: str) -> List[str]:
    if not s:
        return []
    return [m.group(0) for m in re.finditer(r"\S+\s*|\s+", s)]


def _essay_diff_segments_for_revised_display(original: str, revised_body: str) -> List[Tuple[bool, str]]:
    """
    diffWordsWithSpace に近いトークン列の差分で、完成版側に現れる断片を (is_added, text) にまとめる。
    """
    o = _normalize_essay_for_flow_display(original)
    r = _normalize_essay_for_flow_display(revised_body)
    if not r:
        return [(False, "")]
    ot = _tokens_words_with_space(o)
    rt = _tokens_words_with_space(r)
    sm = difflib.SequenceMatcher(a=ot, b=rt, autojunk=False)
    merged: List[Tuple[bool, str]] = []
    for tag, _i1, _i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            merged.append((False, "".join(rt[j1:j2])))
        elif tag in ("insert", "replace"):
            merged.append((True, "".join(rt[j1:j2])))
    out: List[Tuple[bool, str]] = []
    for is_red, chunk in merged:
        if not chunk:
            continue
        if out and out[-1][0] == is_red:
            out[-1] = (is_red, out[-1][1] + chunk)
        else:
            out.append((is_red, chunk))
    return out if out else [(False, r)]


def _split_final_body_and_wordcount_line(final_with_count: str) -> Tuple[str, str]:
    """_final_essay_with_word_count_line の本文と語数行を分離。"""
    t = _norm_text(final_with_count)
    m = re.search(r"\n\s*（\s*\d+\s*words?\s*）\s*$", t, flags=re.IGNORECASE)
    if not m:
        return t, ""
    return t[: m.start()].strip(), t[m.start() :].strip()


class _PageCtx:
    def __init__(self, pdf_path: str, *, body_font: str) -> None:
        self.pdf_path = pdf_path
        self._font = body_font
        self.c = canvas.Canvas(pdf_path, pagesize=A4)
        self.width, self.height = A4
        self.y = self.height - 42 * mm
        self._new_page()

    def _new_page(self) -> None:
        self.y = self.height - MARGIN_TOP_MM * mm

    def ensure_space(self, need_mm: float) -> None:
        floor = MARGIN_BOTTOM_MM * mm
        if self.y - need_mm * mm < floor:
            self.c.showPage()
            self._new_page()

    def draw_header(
        self,
        *,
        student_name: str,
        task_id: str,
    ) -> None:
        c = self.c
        h = self.height
        c.setFont(self._font, HEADER_TITLE_PT)
        c.drawString(MARGIN_X_MM * mm, h - 18 * mm, task_id)
        c.setFont(self._font, 11)
        c.drawString(MARGIN_X_MM * mm, h - 28 * mm, f"Name: {student_name}")
        self.y = h - 38 * mm

    def draw_qr_below_content(self, qr_path: Optional[str]) -> None:
        """完成版など本文の後に QR と案内文を置く（ヘッダーと重ならない）。"""
        if not qr_path:
            return
        c = self.c
        qr_size = QR_SIZE_MM * mm
        gap_top = 8 * mm
        gap_qr_to_text = 4 * mm
        caption_fs = 7.0
        caption_line_mm = 3.6
        chrome_msg = "Chromeで開いてダウンロードしてください。"
        x = MARGIN_X_MM * mm
        max_w = self.width - 2 * MARGIN_X_MM * mm
        c.setFont(self._font, caption_fs)
        cap_lines = _wrap_words_to_width(
            c, chrome_msg, font=self._font, font_size=caption_fs, max_width=max_w
        )
        text_h = len(cap_lines) * caption_line_mm * mm
        need_mm = gap_top / mm + qr_size / mm + gap_qr_to_text / mm + text_h / mm + 6
        self.ensure_space(need_mm)

        self.y -= gap_top
        qr_top = self.y
        qr_bottom = qr_top - qr_size
        c.drawImage(
            ImageReader(qr_path),
            x,
            qr_bottom,
            width=qr_size,
            height=qr_size,
            preserveAspectRatio=True,
            mask="auto",
        )
        ty = qr_bottom - gap_qr_to_text
        c.setFont(self._font, caption_fs)
        line_h = caption_line_mm * mm
        for ln in cap_lines:
            c.drawString(x, ty, ln)
            ty -= line_h
        self.y = ty - BLOCK_GAP_MM * mm * 0.5

    def draw_block(self, title: str, body: str, *, max_width_mm: float) -> None:
        c = self.c
        x = MARGIN_X_MM * mm
        max_w = max_width_mm * mm

        self.ensure_space(TITLE_TO_BODY_MM + LINE_STEP_MM * 2)
        c.setFont(self._font, TITLE_FONT_PT)
        c.drawString(x, self.y, title)
        self.y -= TITLE_TO_BODY_MM * mm

        lines, size = _fit_lines(c, body, font=self._font, max_width=max_w, max_lines=MAX_LINES_PER_BLOCK)
        c.setFont(self._font, size)
        line_h = LINE_STEP_MM * mm
        for ln in lines:
            self.ensure_space(LINE_STEP_MM)
            c.drawString(x, self.y, ln)
            self.y -= line_h
        self.y -= BLOCK_GAP_MM * mm

    def draw_block_long(
        self,
        title: str,
        body: str,
        *,
        max_width_mm: float,
        font_size: float = START_BODY_FONT_PT,
    ) -> None:
        """本文を省略せず折り返し、必要なら次ページへ続ける。"""
        c = self.c
        x = MARGIN_X_MM * mm
        max_w = max_width_mm * mm
        text = _norm_text(body)
        if not text and not title:
            return

        self.ensure_space(TITLE_TO_BODY_MM + LINE_STEP_MM * 2)
        c.setFont(self._font, TITLE_FONT_PT)
        c.drawString(x, self.y, title)
        self.y -= TITLE_TO_BODY_MM * mm

        if not text:
            self.y -= BLOCK_GAP_MM * mm
            return

        c.setFont(self._font, font_size)
        line_h = _line_step_for_font(font_size)
        for segment in text.split("\n"):
            seg = segment.strip()
            if not seg:
                continue
            lines = _wrap_words_to_width(c, seg, font=self._font, font_size=font_size, max_width=max_w)
            for ln in lines:
                self.ensure_space(line_h / mm)
                c.drawString(x, self.y, ln)
                self.y -= line_h
        self.y -= BLOCK_GAP_MM * mm

    def draw_final_essay_with_revision_highlights(
        self,
        title: str,
        original_essay: str,
        final_with_count: str,
        *,
        max_width_mm: float,
        font_size: float = 10.5,
    ) -> None:
        """完成版: 黒一色の本文（語数行は従来どおり黒）。"""
        body, wc_line = _split_final_body_and_wordcount_line(final_with_count)
        segments = _essay_diff_segments_for_revised_display(original_essay, body)
        flat: List[Tuple[bool, str]] = []
        for _is_red, chunk in segments:
            if not chunk:
                continue
            toks = re.findall(r"\S+\s*|\s+", chunk)
            if not toks:
                toks = [chunk]
            for t in toks:
                if t:
                    flat.append((False, t))

        c = self.c
        x = MARGIN_X_MM * mm
        max_w = max_width_mm * mm
        font = self._font

        self.ensure_space(TITLE_TO_BODY_MM + LINE_STEP_MM * 2)
        c.setFont(self._font, TITLE_FONT_PT)
        c.setFillColor(colors.black)
        c.drawString(x, self.y, title)
        self.y -= TITLE_TO_BODY_MM * mm

        if not flat and not wc_line:
            self.y -= BLOCK_GAP_MM * mm
            return

        lh = _line_step_for_font(font_size)
        line_parts: List[Tuple[bool, str]] = []
        line_width = 0.0

        def emit_line() -> None:
            nonlocal line_parts, line_width
            if not line_parts:
                return
            self.ensure_space(lh / mm)
            rx = x
            for ir, piece in line_parts:
                c.setFillColor(_REVISION_RED if ir else colors.black)
                c.setFont(font, font_size)
                c.drawString(rx, self.y, piece)
                rx += c.stringWidth(piece, font, font_size)
            self.y -= lh
            line_parts = []
            line_width = 0.0

        c.setFont(font, font_size)
        for is_red, tok in flat:
            tw = c.stringWidth(tok, font, font_size)
            if line_width + tw > max_w + 0.01 and line_parts:
                emit_line()
            line_parts.append((is_red, tok))
            line_width += tw
        emit_line()

        if wc_line:
            self.y -= BLOCK_GAP_MM * mm * 0.25
            wc_fs = font_size * 0.92
            wc_lh = _line_step_for_font(wc_fs)
            c.setFillColor(colors.black)
            c.setFont(font, wc_fs)
            for ln in _wrap_words_to_width(c, wc_line, font=font, font_size=wc_fs, max_width=max_w):
                self.ensure_space(wc_lh / mm)
                c.drawString(x, self.y, ln)
                self.y -= wc_lh
        self.y -= BLOCK_GAP_MM * mm

    def _draw_wrapped_paragraph_all_lines(
        self,
        text: str,
        *,
        max_width_mm: float,
        font_size: float,
        indent_mm: float = 0,
        jp_wrap: bool = False,
    ) -> None:
        c = self.c
        x = MARGIN_X_MM * mm + indent_mm * mm
        max_w = max_width_mm * mm - indent_mm * mm
        t = _normalize_deduction_marks(_norm_text(text))
        if not t:
            return
        c.setFont(self._font, font_size)
        line_h = _line_step_for_font(font_size)
        for segment in t.split("\n"):
            seg = segment.strip()
            if not seg:
                continue
            if jp_wrap:
                seg = _insert_jp_wrap_spaces(seg)
            lines = _wrap_words_to_width(c, seg, font=self._font, font_size=font_size, max_width=max_w)
            for ln in lines:
                self.ensure_space(line_h / mm)
                c.drawString(x, self.y, ln)
                self.y -= line_h

    def _draw_black_suffix_from_cx(
        self,
        *,
        x: float,
        start_cx: float,
        max_right: float,
        text: str,
        font_size: float,
    ) -> None:
        """start_cx から黒で描画し折り返す。終了時 self.y は最終行のひとつ下。"""
        c = self.c
        font = self._font
        raw = (text or "").strip()
        if not raw:
            return
        t = _insert_jp_wrap_spaces(_normalize_deduction_marks(raw))
        line_h = _line_step_for_font(font_size)
        c.setFont(font, font_size)
        c.setFillColor(colors.black)
        cur_x = start_cx
        y = self.y
        for ch in t:
            if ch.isspace():
                continue
            tw = c.stringWidth(ch, font, font_size)
            if cur_x + tw <= max_right + 0.01:
                c.drawString(cur_x, y, ch)
                cur_x += tw
            else:
                y -= line_h
                self.ensure_space(line_h / mm)
                cur_x = x
                c.drawString(cur_x, y, ch)
                cur_x += tw
        self.y = y - line_h

    def _draw_wrong_arrow_correct_block(
        self,
        *,
        x: float,
        max_w: float,
        wrong: str,
        correct: str,
        font_size: float,
        suffix_after_correct: str = "",
        suffix_font_size: Optional[float] = None,
        max_width_mm_for_wrap: float,
    ) -> None:
        """● 誤り → 正しい英文（正側のみ赤）。suffix は正が 1 行に収まるとき同一行から続ける。"""
        c = self.c
        font = self._font
        wrong = wrong.strip()
        correct = correct.strip()
        suffix = (suffix_after_correct or "").strip()
        suf_fs = suffix_font_size if suffix_font_size is not None else EXPLAIN_BODY_FONT_PT
        prefix = f"● {wrong} → "
        words = correct.split()
        line_h = _line_step_for_font(font_size)
        c.setFont(font, font_size)

        if not words:
            self.ensure_space(line_h / mm)
            c.setFillColor(colors.black)
            pref = prefix.rstrip()
            c.drawString(x, self.y, pref)
            cx = x + c.stringWidth(pref, font, font_size)
            if suffix:
                self._draw_black_suffix_from_cx(
                    x=x,
                    start_cx=cx,
                    max_right=x + max_w,
                    text="：" + suffix,
                    font_size=suf_fs,
                )
            else:
                self.y -= line_h
            c.setFillColor(colors.black)
            return

        pw = c.stringWidth(prefix, font, font_size)
        idx = 0

        self.ensure_space(line_h / mm)
        cx = x
        c.setFillColor(colors.black)
        c.drawString(cx, self.y, prefix)
        cx += pw
        c.setFillColor(colors.red)
        first_w = True
        while idx < len(words):
            word = words[idx]
            add = word if first_w else " " + word
            if cx + c.stringWidth(add, font, font_size) <= x + max_w:
                c.drawString(cx, self.y, add)
                cx += c.stringWidth(add, font, font_size)
                idx += 1
                first_w = False
            else:
                break
        c.setFillColor(colors.black)
        suffix_drawn_here = False
        if suffix and idx == len(words):
            self._draw_black_suffix_from_cx(
                x=x,
                start_cx=cx,
                max_right=x + max_w,
                text="：" + suffix,
                font_size=suf_fs,
            )
            suffix_drawn_here = True
        else:
            self.y -= line_h

        while idx < len(words):
            self.ensure_space(line_h / mm)
            cx = x
            line_start = idx
            c.setFillColor(colors.red)
            first_w = True
            while idx < len(words):
                word = words[idx]
                add = word if first_w else " " + word
                if cx + c.stringWidth(add, font, font_size) <= x + max_w:
                    c.drawString(cx, self.y, add)
                    cx += c.stringWidth(add, font, font_size)
                    idx += 1
                    first_w = False
                else:
                    break
            c.setFillColor(colors.black)
            self.y -= line_h
            if idx == line_start:
                w = words[idx]
                c.setFillColor(colors.red)
                buf = ""
                max_inner = max_w
                for ch in w:
                    trial = buf + ch
                    if c.stringWidth(trial, font, font_size) <= max_inner:
                        buf = trial
                    else:
                        if buf:
                            self.ensure_space(line_h / mm)
                            c.drawString(x, self.y, buf)
                            self.y -= line_h
                        buf = ch
                        max_inner = max_w
                if buf:
                    self.ensure_space(line_h / mm)
                    c.drawString(x, self.y, buf)
                    self.y -= line_h
                c.setFillColor(colors.black)
                idx += 1

        if suffix and not suffix_drawn_here:
            self._draw_wrapped_paragraph_all_lines(
                "：" + suffix,
                max_width_mm=max_width_mm_for_wrap,
                font_size=suf_fs,
                indent_mm=0,
                jp_wrap=True,
            )

    def _draw_explanation_paragraph_colored(self, para: str, *, max_width_mm: float) -> None:
        """1段落: 先頭行が ●/○ 誤→正 なら正を赤。続きは通常の解説本文。"""
        p = _normalize_deduction_marks(para.strip())
        if not p:
            return
        x = MARGIN_X_MM * mm
        max_w = max_width_mm * mm
        parts = p.split("\n", 1)
        head = parts[0].strip()
        body = parts[1].strip() if len(parts) > 1 else ""

        parsed = False
        if head.startswith(("●", "○")):
            inner = head[1:].strip()
            if "→" in inner:
                wrong, post_arrow = inner.split("→", 1)
                wrong = wrong.strip()
                post_arrow = post_arrow.strip()
                correct, suf = _split_post_arrow_correct_suffix(post_arrow)
                self._draw_wrong_arrow_correct_block(
                    x=x,
                    max_w=max_w,
                    wrong=wrong,
                    correct=correct,
                    font_size=EXPLAIN_HEAD_FONT_PT,
                    suffix_after_correct=suf,
                    max_width_mm_for_wrap=max_width_mm,
                )
                parsed = True
        if not parsed:
            self._draw_wrapped_paragraph_all_lines(
                head,
                max_width_mm=max_width_mm,
                font_size=EXPLAIN_HEAD_FONT_PT,
                indent_mm=0,
                jp_wrap=True,
            )
        if body:
            self._draw_wrapped_paragraph_all_lines(
                body,
                max_width_mm=max_width_mm,
                font_size=EXPLAIN_BODY_FONT_PT,
                indent_mm=0,
                jp_wrap=True,
            )

    def _draw_content_explanation_block(self, para: str, *, max_width_mm: float) -> None:
        """【内容】ブロック: 【内容】・【ヒント】・①〜と小見出しを太字風、その他は黒で折り返し。"""
        p = _normalize_deduction_marks(_norm_text(para.strip()))
        if not p:
            return
        fs = EXPLAIN_BODY_FONT_PT
        line_h = _line_step_for_font(fs)
        x = MARGIN_X_MM * mm
        max_w = max_width_mm * mm
        font = self._font
        c = self.c
        for raw_ln in p.split("\n"):
            ln = raw_ln.rstrip()
            if not ln.strip():
                self.y -= line_h * 0.35
                continue
            t = ln.strip()
            stripped = re.sub(r"^[●○]\s*", "", t)

            if stripped.startswith(_CONTENT_HEAD):
                self.ensure_space(line_h / mm)
                rest = stripped[len(_CONTENT_HEAD) :].strip()
                bw = _draw_fake_bold_string(c, x=x, y=self.y, text=_CONTENT_HEAD, font=font, font_size=fs)
                if rest:
                    cx = x + bw + c.stringWidth(" ", font, fs)
                    if cx + c.stringWidth(rest, font, fs) <= max_w + 0.01:
                        c.setFont(font, fs)
                        c.setFillColor(colors.black)
                        c.drawString(cx, self.y, rest)
                self.y -= line_h
                continue

            if stripped in (_GRAMMAR_HEAD, _GRAMMAR_HEAD_LEGACY):
                self.ensure_space(line_h / mm)
                _draw_fake_bold_string(c, x=x, y=self.y, text=_GRAMMAR_HEAD, font=font, font_size=fs)
                self.y -= line_h
                continue

            if stripped == _HINT_HEAD or stripped.startswith(_HINT_HEAD):
                self.ensure_space(line_h / mm)
                bw = _draw_fake_bold_string(c, x=x, y=self.y, text=_HINT_HEAD, font=font, font_size=fs)
                tail = stripped[len(_HINT_HEAD) :].strip()
                if tail:
                    cx = x + bw + c.stringWidth(" ", font, fs)
                    if cx + c.stringWidth(tail, font, fs) <= max_w + 0.01:
                        c.setFont(font, fs)
                        c.setFillColor(colors.black)
                        c.drawString(cx, self.y, tail)
                    else:
                        self.y -= line_h
                        self._draw_wrapped_paragraph_all_lines(
                            tail,
                            max_width_mm=max_width_mm,
                            font_size=fs,
                            indent_mm=0,
                            jp_wrap=True,
                        )
                        continue
                self.y -= line_h
                continue

            bold_part, tail_part = _circled_bold_prefix_and_tail(stripped)
            if bold_part:
                self.ensure_space(line_h / mm)
                _draw_fake_bold_string(c, x=x, y=self.y, text=bold_part, font=font, font_size=fs)
                self.y -= line_h
                if tail_part.strip():
                    self._draw_wrapped_paragraph_all_lines(
                        tail_part.strip(),
                        max_width_mm=max_width_mm,
                        font_size=fs,
                        indent_mm=0,
                        jp_wrap=True,
                    )
                continue

            self._draw_wrapped_paragraph_all_lines(
                t,
                max_width_mm=max_width_mm,
                font_size=fs,
                indent_mm=0,
                jp_wrap=True,
            )

    def draw_eval_and_explanation(
        self,
        title: str,
        line1: str,
        line2: str,
        line3: str,
        *,
        max_width_mm: float,
    ) -> None:
        """評価・コメント・解説。解説は箇条書き整形・全文掲載。"""
        c = self.c
        x = MARGIN_X_MM * mm
        max_w = max_width_mm * mm

        self.ensure_space(TITLE_TO_BODY_MM + LINE_STEP_MM * 2)
        c.setFont(self._font, TITLE_FONT_PT)
        c.drawString(x, self.y, title)
        self.y -= TITLE_TO_BODY_MM * mm

        # 得点（ルーブリック）
        first = _norm_text(line1)
        lines = _wrap_words_to_width(
            c, first, font=self._font, font_size=START_BODY_FONT_PT, max_width=max_w
        )
        c.setFont(self._font, START_BODY_FONT_PT)
        line_h = _line_step_for_font(START_BODY_FONT_PT)
        for ln in lines:
            self.ensure_space(line_h / mm)
            c.drawString(x, self.y, ln)
            self.y -= line_h
        self.y -= BLOCK_GAP_MM * mm * 0.5

        # 全体コメントは画面から廃止したため PDF にも載せない（line2 は無視）

        # 解説: /result と同じ正規化（student-release + 公開用整形）後、見出し位置で内容/文法に分割して描画。
        line3_proc = normalize_student_explanation_text(
            canonicalize_growth_hint_heading_explanation(
                canonicalize_legacy_grammar_heading_explanation(_norm_text(line3))
            )
        )
        raw3 = _normalize_deduction_marks(line3_proc)
        raw3 = _ensure_content_bullet_lines(raw3)
        gkey = _grammar_header_marker_in(raw3)
        gap = BLOCK_GAP_MM * mm * 0.25

        if gkey:
            gi = raw3.index(gkey)
            content_seg = raw3[:gi].rstrip()
            grammar_raw = raw3[gi:].rstrip()
        else:
            content_seg = raw3.rstrip()
            grammar_raw = ""

        if content_seg.strip():
            self._draw_content_explanation_block(content_seg, max_width_mm=max_width_mm)
            self.y -= gap

        if grammar_raw.strip():
            gw = _ensure_grammar_bullet_lines(grammar_raw)
            gf = _format_explanation_bullets(gw)
            if gf:
                gw = _ensure_grammar_bullet_lines(gf)
            glines = [x.strip() for x in gw.split("\n") if x.strip()]
            if glines:
                first = glines[0].strip()
                if first in (_GRAMMAR_HEAD, _GRAMMAR_HEAD_LEGACY, "【文法】"):
                    h0 = _canonical_grammar_heading_line(glines[0])
                    self._draw_content_explanation_block(h0, max_width_mm=max_width_mm)
                    self.y -= gap
                    rest_g = glines[1:]
                else:
                    rest_g = glines
                for j, gln in enumerate(rest_g):
                    if j:
                        self.y -= gap
                    self._draw_explanation_paragraph_colored(gln, max_width_mm=max_width_mm)
        elif not content_seg.strip() and raw3.strip():
            self._draw_wrapped_paragraph_all_lines(
                raw3,
                max_width_mm=max_width_mm,
                font_size=EXPLAIN_BODY_FONT_PT,
                indent_mm=0,
                jp_wrap=True,
            )

        self.y -= BLOCK_GAP_MM * mm


def render_return_pdf(
    *,
    pdf_path: str,
    student_name: str,
    task_id: str,
    line1: str,
    line2: str,
    line3: str,
    final_essay: str,
    original_essay: str = "",
    qr_path: Optional[str],
) -> str:
    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)

    body_font = ensure_day4_sans_font()
    ctx = _PageCtx(pdf_path, body_font=body_font)
    ctx.draw_header(
        student_name=student_name,
        task_id=task_id,
    )

    ctx.draw_eval_and_explanation(
        "評価と解説",
        line1,
        line2,
        line3,
        max_width_mm=178,
    )
    final_clean = strip_final_essay_artifacts((final_essay or "").strip())
    final_with_count = _final_essay_with_word_count_line(final_clean)
    ctx.draw_final_essay_with_revision_highlights(
        "完成版（1分間スピーチ練習用）",
        original_essay,
        final_with_count,
        max_width_mm=178,
        font_size=10.5,
    )
    ctx.draw_qr_below_content(qr_path)

    ctx.c.save()
    return pdf_path

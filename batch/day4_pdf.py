from __future__ import annotations

import os
import re
from typing import Callable, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from day4_pdf_fonts import ensure_day4_sans_font

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


def _para_first_line_is_grammar_heading(p: str) -> bool:
    first = p.split("\n", 1)[0].strip()
    return first in (_GRAMMAR_HEAD, _GRAMMAR_HEAD_LEGACY)


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
    """完成版本文の直後に英語の語数のみ表記（別行）。"""
    base = _strip_trailing_word_count_marker(_norm_text(text))
    if not base:
        return ""
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


def _is_greeting_or_filler_line(s: str) -> bool:
    """総評の先頭に付きがちな挨拶・導入だけの行（短い行に限定して誤検知を減らす）。"""
    t = s.strip()
    if not t or len(t) > 120:
        return False
    patterns = (
        r"^こんにちは",
        r"^こんばんは",
        r"^お世話になって",
        r"^はじめまして",
        r"一緒に見ていきましょう",
        r"一緒に見ていきます",
        r"一緒に見てきましょう",
        r"^それでは[,、]?\s*$",
        r"^どうも[,、]?\s*$",
        r"^はじめに[,、]",
        r"読ませていただ",
        r"拝見しました",
        r"^本日は",
        r"^今日は",
    )
    return any(re.search(p, t) for p in patterns)


def _strip_leading_greeting_general_comment(s: str) -> str:
    """点数直後の総評から、先頭の挨拶・決まり文句だけの行を除きコンパクトにする。"""
    lines = _norm_text(s).split("\n")
    i = 0
    while i < len(lines):
        st = lines[i].strip()
        if not st:
            i += 1
            continue
        if _is_greeting_or_filler_line(st):
            i += 1
            continue
        break
    return "\n".join(lines[i:]).strip()


def _is_explanation_deduction_summary_line(s: str) -> bool:
    """減点合計行には ● を付けない。"""
    t = s.strip()
    return bool(re.match(r"^(文法|内容)減点\s*合計\s*[:：]", t))


def _ensure_content_bullet_lines(text: str) -> str:
    """【内容】見出し以降〜文法見出しの手前まで、箇条書き行の先頭に ● を付ける（見出し・内容減点合計行は除外）。"""
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
        if st.startswith(("●", "○")):
            out.append(ln)
            continue
        if _is_explanation_deduction_summary_line(st):
            out.append(ln)
            continue
        out.append(f"● {st}")
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
                if "：" in post_arrow:
                    correct, suf = post_arrow.split("：", 1)
                    correct = correct.strip()
                    suf = suf.strip()
                else:
                    correct = post_arrow
                    suf = ""
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

    def _draw_explanation_paragraph_plain(self, para: str, *, max_width_mm: float) -> None:
        """解説段落をすべて黒・本文サイズで描画（【内容】ブロック用）。"""
        p = _normalize_deduction_marks(_norm_text(para.strip()))
        if not p:
            return
        self._draw_wrapped_paragraph_all_lines(
            p,
            max_width_mm=max_width_mm,
            font_size=EXPLAIN_BODY_FONT_PT,
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

        # 全体コメント（挨拶・導入の定型文は先頭から除去）
        second = _insert_jp_wrap_spaces(_norm_text(_strip_leading_greeting_general_comment(line2)))
        lines = _wrap_words_to_width(
            c, second, font=self._font, font_size=START_BODY_FONT_PT, max_width=max_w
        )
        c.setFont(self._font, START_BODY_FONT_PT)
        line_h = _line_step_for_font(START_BODY_FONT_PT)
        for ln in lines:
            self.ensure_space(line_h / mm)
            c.drawString(x, self.y, ln)
            self.y -= line_h
        self.y -= BLOCK_GAP_MM * mm * 0.5

        # 解説: line3 は公開 API / テキストDL（StudentCorrectionLookup の r.explanation）と同一文字列。
        # 【内容】は黒のみ、【文法・語法・表現】は箇条書き ● ＋ 誤→正の赤。
        raw3 = _normalize_deduction_marks(_norm_text(line3))
        raw3 = _ensure_content_bullet_lines(raw3)
        gkey = _grammar_header_marker_in(raw3)
        if gkey:
            gi = raw3.index(gkey)
            content_seg = raw3[:gi].rstrip()
            grammar_seg = raw3[gi:].lstrip()
            grammar_seg = _ensure_grammar_bullet_lines(grammar_seg)
            formatted_g = _format_explanation_bullets(grammar_seg)
            if formatted_g:
                grammar_out = _ensure_grammar_bullet_lines(formatted_g)
            else:
                grammar_out = grammar_seg
            formatted = f"{content_seg}\n\n{grammar_out}".strip()
        else:
            grammar_seg = _ensure_grammar_bullet_lines(raw3)
            formatted = _format_explanation_bullets(grammar_seg)
            if formatted:
                formatted = _ensure_grammar_bullet_lines(formatted)
        if not formatted:
            self._draw_wrapped_paragraph_all_lines(
                _normalize_deduction_marks(_norm_text(line3)),
                max_width_mm=max_width_mm,
                font_size=EXPLAIN_BODY_FONT_PT,
                indent_mm=0,
                jp_wrap=True,
            )
        else:
            section: Optional[str] = None
            gap = BLOCK_GAP_MM * mm * 0.25
            for para in re.split(r"\n\s*\n+", formatted.strip()):
                p = para.strip()
                if not p:
                    continue
                if p.startswith("【内容】"):
                    section = "content"
                    self._draw_explanation_paragraph_plain(p, max_width_mm=max_width_mm)
                elif _para_first_line_is_grammar_heading(p):
                    section = "grammar"
                    glines = [x.strip() for x in p.split("\n") if x.strip()]
                    if glines:
                        h0 = _canonical_grammar_heading_line(glines[0])
                        self._draw_explanation_paragraph_plain(h0, max_width_mm=max_width_mm)
                        for j, gln in enumerate(glines[1:]):
                            if j:
                                self.y -= gap
                            self._draw_explanation_paragraph_colored(gln, max_width_mm=max_width_mm)
                elif section == "content":
                    self._draw_explanation_paragraph_plain(p, max_width_mm=max_width_mm)
                elif section == "grammar":
                    g2 = [x.strip() for x in p.split("\n") if x.strip()]
                    for j, gln in enumerate(g2):
                        if j:
                            self.y -= gap
                        self._draw_explanation_paragraph_colored(gln, max_width_mm=max_width_mm)
                else:
                    self._draw_explanation_paragraph_colored(p, max_width_mm=max_width_mm)
                self.y -= gap

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
    final_with_count = _final_essay_with_word_count_line(final_essay)
    ctx.draw_block_long(
        "完成版（1分間スピーチ練習用）",
        final_with_count,
        max_width_mm=178,
        font_size=10.5,
    )
    ctx.draw_qr_below_content(qr_path)

    ctx.c.save()
    return pdf_path

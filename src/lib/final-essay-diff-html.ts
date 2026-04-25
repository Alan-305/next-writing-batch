import { diffWordsWithSpace } from "diff";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 画面表示用に改行を空白へ寄せ、英文を流しの段落として比較する。 */
function normalizeEssayForFlowDisplay(s: string): string {
  return (s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}

/**
 * 原文（提出テキスト）と完成版を語＋空白単位で比較し、
 * 完成版にあって原文に無い（追加・置換後）の断片を HTML でマークする。
 * 生徒向けページの表示専用（入力値はサーバー上の提出データ）。
 * 改行は段落表示のため正規化してから比較する。
 */
export function finalEssayHtmlWithRevisionHighlights(original: string, revised: string): string {
  const o = normalizeEssayForFlowDisplay(original);
  const r = normalizeEssayForFlowDisplay(revised);
  if (!r) return "";

  const parts = diffWordsWithSpace(o, r);
  let out = "";
  for (const part of parts) {
    if (part.removed) continue;
    const safe = escapeHtml(part.value);
    if (part.added) {
      out += `<span class="essay-revision">${safe}</span>`;
    } else {
      out += safe;
    }
  }
  return `<p class="essay-final-paragraph">${out}</p>`;
}

/** 生徒向け「完成版」: 差分色なし・黒一色の段落（改行は流しの1段落に正規化）。 */
export function finalEssayHtmlPlainBlack(revised: string): string {
  const r = normalizeEssayForFlowDisplay(revised);
  if (!r) return "";
  return `<p class="essay-final-paragraph">${escapeHtml(r)}</p>`;
}

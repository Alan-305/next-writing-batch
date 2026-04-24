import { diffWordsWithSpace } from "diff";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 原文（提出テキスト）と完成版を語＋空白単位で比較し、
 * 完成版にあって原文に無い（追加・置換後）の断片を HTML でマークする。
 * 生徒向けページの表示専用（入力値はサーバー上の提出データ）。
 */
export function finalEssayHtmlWithRevisionHighlights(original: string, revised: string): string {
  const o = original ?? "";
  const r = revised ?? "";
  if (!r.trim()) return "";

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
  return out;
}

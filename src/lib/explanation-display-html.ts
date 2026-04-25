import { formatExplanationForPublicView } from "@/lib/student-release";

const CONTENT_HEAD = "【内容】";
const GRAMMAR_HEAD = "【文法・語法・表現】";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 誤り → 正：解説 の「正」側と日本語解説を分離（PDF と同様に全角コロン優先） */
function splitCorrectEnglishAndSuffix(postArrow: string): { correct: string; suffix: string } {
  const post = postArrow.trim();
  const fullIdx = post.indexOf("：");
  if (fullIdx === -1) {
    return { correct: post, suffix: "" };
  }
  return {
    correct: post.slice(0, fullIdx).trim(),
    suffix: post.slice(fullIdx),
  };
}

function formatGrammarExplainLine(line: string): string {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const t = line.trim();
  const body = t.replace(/^(?:●|○)\s*/, "");
  const arrow = "→";
  const arrowIdx = body.indexOf(arrow);
  if (arrowIdx === -1) {
    return indent + escapeHtml(t);
  }
  let wrong = body.slice(0, arrowIdx).trim();
  const post = body.slice(arrowIdx + arrow.length).trimStart();
  const { correct, suffix } = splitCorrectEnglishAndSuffix(post);
  if (wrong && !/^(?:●|○)/.test(wrong)) {
    wrong = `● ${wrong}`;
  }
  const prefix = escapeHtml(`${wrong} ${arrow} `);
  const correctHtml = `<span class="grammar-correct-en">${escapeHtml(correct)}</span>`;
  return indent + prefix + correctHtml + escapeHtml(suffix);
}

function formatContentExplainLine(line: string): string {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  const t = line.trim();
  if (/^\s*内容減点\s*合計\s*[:：]/.test(line)) {
    return indent + escapeHtml(t);
  }
  const strippedBullet = t.replace(/^(?:●|○)\s*/, "");
  if (strippedBullet === "【ヒント】" || strippedBullet.startsWith("【ヒント】")) {
    if (strippedBullet === "【ヒント】") {
      return `${indent}<strong>【ヒント】</strong>`;
    }
    const rest = strippedBullet.slice("【ヒント】".length);
    return `${indent}<strong>【ヒント】</strong>${escapeHtml(rest)}`;
  }
  if (/^[\u2460-\u2473]/.test(strippedBullet)) {
    const m = strippedBullet.match(/^([\u2460-\u2473]+\s*)([\s\S]*)$/);
    if (!m) return indent + escapeHtml(t);
    const circledRun = m[1];
    const rest = m[2];
    let end = rest.length;
    for (const marker of ["。", "、", "（", "：", "\n"]) {
      const i = rest.indexOf(marker);
      if (i !== -1 && i < end) end = i;
    }
    const sub = rest.slice(0, end);
    const tail = rest.slice(end);
    return `${indent}<strong>${escapeHtml(circledRun + sub)}</strong>${escapeHtml(tail)}`;
  }
  return indent + escapeHtml(t);
}

/**
 * 生徒向け「解説」欄用 HTML（整形済みプレーンテキストを想定）。
 * `formatExplanationForPublicView` 済み文字列を渡すこと。
 */
export function explanationFormattedPlainToDisplayHtml(plain: string): string {
  const lines = (plain ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  type Mode = "outer" | "content" | "grammar";
  let mode: Mode = "outer";
  const out: string[] = [];

  const trimmed = (s: string) => s.trim();

  for (const line of lines) {
    const t = trimmed(line);
    if (mode === "outer") {
      if (t === CONTENT_HEAD) {
        mode = "content";
        out.push(`<div class="explanation-section-head"><strong>${escapeHtml(CONTENT_HEAD)}</strong></div>`);
        continue;
      }
      if (t === GRAMMAR_HEAD || t === "【文法】") {
        mode = "grammar";
        out.push(`<div class="explanation-section-head"><strong>${escapeHtml(GRAMMAR_HEAD)}</strong></div>`);
        continue;
      }
      if (!t) {
        out.push('<div class="explanation-blank-line" aria-hidden="true"></div>');
        continue;
      }
      out.push(`<div class="explanation-line">${escapeHtml(line)}</div>`);
      continue;
    }

    if (mode === "content") {
      if (t === GRAMMAR_HEAD || t === "【文法】") {
        mode = "grammar";
        out.push(`<div class="explanation-section-head"><strong>${escapeHtml(GRAMMAR_HEAD)}</strong></div>`);
        continue;
      }
      if (!t) {
        out.push('<div class="explanation-blank-line" aria-hidden="true"></div>');
        continue;
      }
      out.push(`<div class="explanation-line explanation-line--content">${formatContentExplainLine(line)}</div>`);
      continue;
    }

    // grammar
    if (/^\s*文法減点\s*合計\s*[:：]/.test(line)) {
      mode = "outer";
      out.push(`<div class="explanation-line explanation-line--grammar">${escapeHtml(line)}</div>`);
      continue;
    }
    if (!t) {
      out.push('<div class="explanation-blank-line" aria-hidden="true"></div>');
      continue;
    }
    out.push(`<div class="explanation-line explanation-line--grammar">${formatGrammarExplainLine(line)}</div>`);
  }

  return `<div class="student-explanation-html" lang="ja">${out.join("")}</div>`;
}

/** 未整形の explanation を公開用に整えたうえで HTML 化する。 */
export function studentExplanationToDisplayHtml(explanation: string): string {
  return explanationFormattedPlainToDisplayHtml(formatExplanationForPublicView(explanation));
}

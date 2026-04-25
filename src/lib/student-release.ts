import { sanitizeFinalEssayArtifactText } from "@/lib/student-final-essay-display";
import {
  computeScoreTotal,
  formatRubricEvaluationSummary,
  type TaskProblemsMaster,
} from "@/lib/task-problems-core";

/** 運用が確定した生徒向け・PDF用（AI の proofread とは別） */
export type StudentRelease = {
  scores: Record<string, number>;
  scoreTotal: number;
  evaluation: string;
  generalComment: string;
  explanation: string;
  contentComment?: string;
  grammarComment?: string;
  contentDeduction?: number;
  grammarDeduction?: number;
  finalText: string;
  /** 運用が「確定」した日時。未公開でも Day4 用の文面として使う */
  operatorFinalizedAt?: string;
  operatorApprovedAt?: string;
  updatedAt?: string;
};

export type StudentReleasePatchBody = {
  scores?: Record<string, unknown>;
  evaluation?: unknown;
  generalComment?: unknown;
  explanation?: unknown;
  contentComment?: unknown;
  grammarComment?: unknown;
  deductions?: {
    content?: unknown;
    grammar?: unknown;
  };
  finalText?: unknown;
  /** true で確定日時をセット。false で確定のみ解除（公開は別フィールド） */
  operatorFinalized?: unknown;
  /** true で公開日時をセット。false で取り下げ（下書きに戻す・確定もクリア） */
  operatorApproved?: unknown;
};

export type StudentReleaseValidation = Partial<
  Record<"scores" | "evaluation" | "generalComment" | "explanation" | "finalText" | "_master", string>
>;

const MAX_TEXT = 50000;

function asTrimmedString(v: unknown, max: number): string {
  const s = typeof v === "string" ? v : v != null ? String(v) : "";
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export function normalizeScoresInput(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    const key = k.trim();
    if (!key) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    out[key] = n;
  }
  return out;
}

function clampScore(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

function itemIdByKeyword(master: TaskProblemsMaster, keyword: "content" | "grammar"): string | null {
  const byId = master.rubric.items.find((it) => it.id === keyword);
  if (byId) return byId.id;
  if (keyword === "content") {
    const byLabel = master.rubric.items.find((it) => /内容/.test(it.label));
    return byLabel?.id ?? null;
  }
  const byLabel = master.rubric.items.find((it) => /文法|語法/.test(it.label));
  return byLabel?.id ?? null;
}

function numericOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** PDF・テキスト添削結果と同じ文法ブロック見出し（旧「【文法】」は canonicalize で置換） */
export const GRAMMAR_SECTION_HEAD = "【文法・語法・表現】";

const CONTENT_SECTION_HEAD = "【内容】";

/** 保存済み explanation 内の単独行「【文法】」を新見出しへ（本文中の偶然一致は行単位のため避けやすい） */
export function canonicalizeLegacyGrammarHeadingInExplanation(text: string): string {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => (line.trim() === "【文法】" ? GRAMMAR_SECTION_HEAD : line))
    .join("\n");
}

/** 行頭の「【成長ヒント】」「● 【成長ヒント】」、旧「ヒント」見出しを「【ヒント】」へ */
export function canonicalizeGrowthHintHeadingInExplanation(text: string): string {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => {
      let s = line
        .replace(/^(\s*)(?:●|○)\s*【成長ヒント】\s*/, "$1【ヒント】")
        .replace(/^(\s*)【成長ヒント】\s*/, "$1【ヒント】")
        .replace(/^(\s*)(?:●|○)\s*ヒント\s*$/, "$1【ヒント】")
        .replace(/^(\s*)(?:●|○)\s*ヒント([：:])/, "$1【ヒント】$2");
      const tr = s.trim();
      if (tr === "ヒント") {
        return s.replace(/^(\s*)ヒント\s*$/, "$1【ヒント】");
      }
      if (/^(\s*)ヒント([：:])/.test(s)) {
        return s.replace(/^(\s*)ヒント([：:])/, "$1【ヒント】$2");
      }
      return s;
    })
    .join("\n");
}

function preprocessExplanationBeforeNormalize(explanation: string): string {
  return canonicalizeGrowthHintHeadingInExplanation(
    canonicalizeLegacyGrammarHeadingInExplanation(explanation ?? ""),
  );
}

/** ①〜⑳ の行頭（見出し・箇条書きの番号） */
function leadsWithCircledDigit1To20(s: string): boolean {
  return /^[\u2460-\u2473]/.test(s);
}

/**
 * 【内容】ブロック内で行頭に句読点（、。，．）が来ないよう前行へ寄せる。
 * 【内容】では ● を付けない（①②③・【ヒント】で区切る。行頭の ●・「Step 1」ラベルは除去）。
 * 【文法・語法・表現】ブロックの箇条書き各行の先頭に ● を付ける（減点合計行は除外）。
 */
export function normalizeStudentExplanation(explanation: string): string {
  const raw = (explanation ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n");
  type Mode = "outer" | "content_body" | "grammar_body";
  let mode: Mode = "outer";
  const out: string[] = [];

  const trimmed = (s: string) => s.trim();
  const isContentHead = (s: string) => trimmed(s) === CONTENT_SECTION_HEAD;
  const isGrammarHead = (s: string) => {
    const t = trimmed(s);
    return t === GRAMMAR_SECTION_HEAD || t === "【文法】";
  };
  const isGrammarDeductionLine = (s: string) => /^\s*文法減点\s*合計\s*[:：]/.test(s);
  const leadsJpClausePunct = (t: string) => /^[、。，．]/.test(t);
  const isContentDeductionLine = (s: string) => /^\s*内容減点\s*合計\s*[:：]/.test(s);

  const stripContentLeadingMarkers = (core: string): string => {
    let t = core;
    for (;;) {
      const n = t.replace(/^(?:●|○)\s*/, "");
      if (n === t) break;
      t = n;
    }
    return t.replace(/^\s*step\s*1\s*[：:.．]?\s*/i, "");
  };

  for (const line of lines) {
    if (mode === "outer") {
      if (isContentHead(line)) {
        mode = "content_body";
      } else if (isGrammarHead(line)) {
        mode = "grammar_body";
      }
      out.push(line);
      continue;
    }
    if (mode === "content_body") {
      if (isGrammarHead(line)) {
        mode = "grammar_body";
        out.push(line);
        continue;
      }
      const t0 = line.trimStart();
      if (t0 && leadsJpClausePunct(t0) && out.length > 0) {
        const last = out[out.length - 1] ?? "";
        const lastTrim = trimmed(last);
        if (
          lastTrim &&
          lastTrim !== CONTENT_SECTION_HEAD &&
          !isContentDeductionLine(last) &&
          !isGrammarHead(last)
        ) {
          out[out.length - 1] = `${last}${t0}`;
        } else {
          out.push(line);
        }
        continue;
      }
      const t = trimmed(line);
      if (!t) {
        out.push(line);
        continue;
      }
      if (isContentDeductionLine(line)) {
        out.push(line);
        continue;
      }
      const strippedBullet = stripContentLeadingMarkers(t);
      const indent = line.match(/^\s*/)?.[0] ?? "";
      if (leadsWithCircledDigit1To20(strippedBullet)) {
        out.push(indent + strippedBullet);
        continue;
      }
      if (strippedBullet === "【ヒント】" || strippedBullet.startsWith("【ヒント】")) {
        out.push(indent + strippedBullet);
        continue;
      }
      if (t === "（記載なし）") {
        out.push(line);
        continue;
      }
      out.push(strippedBullet ? indent + strippedBullet : line);
      continue;
    }
    // grammar_body
    if (isGrammarDeductionLine(line)) {
      mode = "outer";
      out.push(line);
      continue;
    }
    const t = trimmed(line);
    if (!t) {
      out.push(line);
      continue;
    }
    if (t.startsWith("●") || t.startsWith("○")) {
      out.push(line);
      continue;
    }
    if (isContentDeductionLine(line) || isGrammarDeductionLine(line)) {
      out.push(line);
      continue;
    }
    if (t === "（記載なし）") {
      out.push(line);
      continue;
    }
    out.push(`● ${t}`);
  }

  return out.join("\n");
}

/** 公開表示・ダウンロード用（見出しの正規化＋句読点・箇条書きの整形）。 */
export function formatExplanationForPublicView(explanation: string): string {
  return normalizeStudentExplanation(preprocessExplanationBeforeNormalize(explanation ?? ""));
}

/** 指摘文内の「➖N点」「-N点」等を合計（AI grammar_deduction との突合用）。 */
export function sumDeductionMarksFromText(text: string): number {
  const s = text ?? "";
  let sum = 0;
  const re = /(?:➖|−|-)\s*(\d+)\s*点/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

/**
 * 【内容】/【文法】見出しが無いとき用。
 * ①〜⑳ と【ヒント】を内容、行頭の ●/○ を文法とみなす（`formatExplanationForPublicView` 済み想定）。
 * どちらにも当てはまらない行は直前の区分へ連なる（内容・文法それぞれの続き）。
 */
function splitExplanationNoSectionHeads(rawLines: string[]): {
  contentComment: string;
  grammarComment: string;
} {
  const contentLines: string[] = [];
  const grammarLines: string[] = [];
  let last: "none" | "content" | "grammar" = "none";
  const stripLeadBullet = (s: string) => s.replace(/^(?:●|○)\s*/, "");

  for (const line of rawLines) {
    const t = line.trim();
    if (!t) continue;

    if (/^内容減点\s*合計\s*[:：]/.test(t)) {
      contentLines.push(line);
      last = "content";
      continue;
    }
    if (/^文法減点\s*合計\s*[:：]/.test(t)) {
      grammarLines.push(line);
      last = "grammar";
      continue;
    }

    const t0 = line.trimStart();
    const afterBullet = stripLeadBullet(t0);

    if (afterBullet === "【ヒント】" || afterBullet.startsWith("【ヒント】")) {
      contentLines.push(line);
      last = "content";
      continue;
    }

    if (leadsWithCircledDigit1To20(afterBullet)) {
      contentLines.push(line);
      last = "content";
      continue;
    }

    if (/^●|^○/.test(t0)) {
      grammarLines.push(line);
      last = "grammar";
      continue;
    }

    if (last === "grammar") {
      grammarLines.push(line);
    } else {
      contentLines.push(line);
      last = last === "none" ? "content" : last;
    }
  }

  return {
    contentComment: contentLines.join("\n"),
    grammarComment: grammarLines.join("\n"),
  };
}

/**
 * 修正入力の「内容の指摘」「文法の指摘」用。`formatExplanationForPublicView` 済みの解説を想定。
 * 【内容】/【文法】見出しがある場合は見出し単位で分割。無い旧形式は ①②③・【ヒント】と ● 箇条書きで分割する。
 */
export function splitExplanationIntoContentGrammarSections(explanation: string): {
  contentComment: string;
  grammarComment: string;
} {
  const src = (explanation || "").trim();
  if (!src) return { contentComment: "", grammarComment: "" };

  const rawLines = src.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const isContentHead = (s: string) => /^【内容】$/.test(s);
  const isGrammarHead = (s: string) => /^【文法(?:・語法・表現)?】$/.test(s);
  const isDeductionLine = (s: string) => /^(内容|文法)減点\s*合計\s*[:：]/.test(s);

  let mode: "none" | "content" | "grammar" = "none";
  let sawHead = false;
  const contentLines: string[] = [];
  const grammarLines: string[] = [];

  for (const line of rawLines) {
    if (isContentHead(line)) {
      mode = "content";
      sawHead = true;
      continue;
    }
    if (isGrammarHead(line)) {
      mode = "grammar";
      sawHead = true;
      continue;
    }
    if (isDeductionLine(line)) continue;
    if (mode === "content") {
      contentLines.push(line);
      continue;
    }
    if (mode === "grammar") {
      grammarLines.push(line);
      continue;
    }
  }

  if (sawHead) {
    return {
      contentComment: contentLines.join("\n"),
      grammarComment: grammarLines.join("\n"),
    };
  }

  return splitExplanationNoSectionHeads(rawLines);
}

/** 旧コンポーネント内関数名との互換（`splitExplanationIntoContentGrammarSections` と同一）。 */
export const splitExplanationToSections = splitExplanationIntoContentGrammarSections;

function buildExplanationFromSections(args: {
  contentComment: string;
  grammarComment: string;
  contentDeduction: number | null;
  grammarDeduction: number | null;
  contentMax: number | null;
  grammarMax: number | null;
}): string {
  const lines: string[] = [];
  lines.push("【内容】");
  lines.push(args.contentComment || "（記載なし）");
  const cd = args.contentDeduction ?? 0;
  const gd = args.grammarDeduction ?? 0;
  if (args.contentMax != null) {
    const score = clampScore(args.contentMax - cd, args.contentMax);
    lines.push(`内容減点 合計: -${cd}点（${score}/${args.contentMax}点）`);
  }
  lines.push("");
  lines.push(GRAMMAR_SECTION_HEAD);
  lines.push(args.grammarComment || "（記載なし）");
  if (args.grammarMax != null) {
    const score = clampScore(args.grammarMax - gd, args.grammarMax);
    lines.push(`文法減点 合計: -${gd}点（${score}/${args.grammarMax}点）`);
  }
  return lines.join("\n").trim();
}

export function validateStudentReleaseAgainstMaster(
  master: TaskProblemsMaster,
  body: StudentReleasePatchBody,
): StudentReleaseValidation {
  const errors: StudentReleaseValidation = {};

  const finalText = asTrimmedString(body.finalText, MAX_TEXT);

  if (!finalText) {
    errors.finalText = "完成版（英文）は必須です";
  }

  const scores = normalizeScoresInput(body.scores);
  const contentId = itemIdByKeyword(master, "content");
  const grammarId = itemIdByKeyword(master, "grammar");
  const hasContentDeduction = numericOrNull(body.deductions?.content) != null;
  const hasGrammarDeduction = numericOrNull(body.deductions?.grammar) != null;
  for (const it of master.rubric.items) {
    const coveredByDeduction =
      (contentId === it.id && hasContentDeduction) || (grammarId === it.id && hasGrammarDeduction);
    if (!(it.id in scores) && !coveredByDeduction) {
      errors.scores = `ルーブリック項目「${it.label}」（${it.id}）の得点が必要です`;
      break;
    }
  }

  return errors;
}

export function buildStudentReleaseFromPatch(
  master: TaskProblemsMaster,
  body: StudentReleasePatchBody,
  prev: StudentRelease | undefined,
): { release: StudentRelease; errors: StudentReleaseValidation } {
  const errors = validateStudentReleaseAgainstMaster(master, body);
  if (Object.keys(errors).length > 0) {
    return {
      release: prev ?? emptyStudentRelease(),
      errors,
    };
  }

  const scores = normalizeScoresInput(body.scores);
  const contentId = itemIdByKeyword(master, "content");
  const grammarId = itemIdByKeyword(master, "grammar");
  const maxById = new Map(master.rubric.items.map((it) => [it.id, it.max] as const));
  const contentMax = contentId ? (maxById.get(contentId) ?? null) : null;
  const grammarMax = grammarId ? (maxById.get(grammarId) ?? null) : null;

  const contentDeductionRaw = numericOrNull(body.deductions?.content);
  const grammarDeductionRaw = numericOrNull(body.deductions?.grammar);
  const contentDeduction =
    contentDeductionRaw != null && contentMax != null ? clampScore(contentDeductionRaw, contentMax) : null;
  const grammarDeduction =
    grammarDeductionRaw != null && grammarMax != null ? clampScore(grammarDeductionRaw, grammarMax) : null;

  if (contentId && contentMax != null && contentDeduction != null) {
    scores[contentId] = clampScore(contentMax - contentDeduction, contentMax);
  }
  if (grammarId && grammarMax != null && grammarDeduction != null) {
    scores[grammarId] = clampScore(grammarMax - grammarDeduction, grammarMax);
  }
  const scoreTotal = computeScoreTotal(master, scores);
  const evaluation = formatRubricEvaluationSummary(master, scores, scoreTotal);
  const generalComment = asTrimmedString(body.generalComment, MAX_TEXT);
  const contentComment = asTrimmedString(body.contentComment, MAX_TEXT);
  const grammarComment = asTrimmedString(body.grammarComment, MAX_TEXT);
  const explanationInput = asTrimmedString(body.explanation, MAX_TEXT);
  const hasSectionInput = Boolean(contentComment) || Boolean(grammarComment);
  const rawExplanation = hasSectionInput
    ? buildExplanationFromSections({
        contentComment,
        grammarComment,
        contentDeduction,
        grammarDeduction,
        contentMax,
        grammarMax,
      })
    : explanationInput;
  const explanation = normalizeStudentExplanation(preprocessExplanationBeforeNormalize(rawExplanation));
  const finalText = asTrimmedString(body.finalText, MAX_TEXT);

  const now = new Date().toISOString();
  let operatorApprovedAt = prev?.operatorApprovedAt;
  let operatorFinalizedAt = prev?.operatorFinalizedAt;

  if (body.operatorApproved === false) {
    operatorApprovedAt = undefined;
    operatorFinalizedAt = undefined;
  } else if (body.operatorApproved === true) {
    operatorApprovedAt = now;
  }

  if (body.operatorApproved !== false) {
    if (body.operatorFinalized === true) {
      operatorFinalizedAt = now;
    } else if (body.operatorFinalized === false) {
      operatorFinalizedAt = undefined;
    }
  }

  const release: StudentRelease = {
    scores,
    scoreTotal,
    evaluation,
    generalComment,
    explanation,
    ...(contentComment ? { contentComment } : {}),
    ...(grammarComment ? { grammarComment } : {}),
    ...(contentDeduction != null ? { contentDeduction } : {}),
    ...(grammarDeduction != null ? { grammarDeduction } : {}),
    finalText,
    ...(operatorFinalizedAt ? { operatorFinalizedAt } : {}),
    ...(operatorApprovedAt ? { operatorApprovedAt } : {}),
    updatedAt: now,
  };

  return { release, errors: {} };
}

export function emptyStudentRelease(): StudentRelease {
  const now = new Date().toISOString();
  return {
    scores: {},
    scoreTotal: 0,
    evaluation: "",
    generalComment: "",
    explanation: "",
    finalText: "",
    updatedAt: now,
  };
}

/** 旧 Day3（evaluation 無し）の line1〜3 を全体コメント相当へまとめる */
export function legacyProofreadGeneralComment(pr: {
  line1_feedback?: string;
  line2_improvement?: string;
  line3_next_action?: string;
}): string {
  const parts = [pr.line1_feedback, pr.line2_improvement, pr.line3_next_action]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return parts.join("\n\n");
}

/** 添削1行目「内容X点＋文法Y点」から減点（各25満点）を復元 */
function nlDeductionsFromEvaluationLine(evaluation: string): { content: number; grammar: number } | null {
  const m = evaluation
    .trim()
    .match(/内容\s*(\d+)\s*点\s*[＋+]\s*文法(?:・語法)?\s*(\d+)\s*点/);
  if (!m) return null;
  const ca = parseInt(m[1]!, 10);
  const ga = parseInt(m[2]!, 10);
  if (!Number.isFinite(ca) || !Number.isFinite(ga)) return null;
  return {
    content: Math.max(0, Math.min(25, 25 - ca)),
    grammar: Math.max(0, Math.min(25, 25 - ga)),
  };
}

/** 添削バッチが既に【内容】＋【文法・語法・表現】型で explanation を保存しているか */
function proofreadExplanationLooksSectionMerged(explanation: string): boolean {
  const t = (explanation ?? "").trim();
  return t.includes("【内容】") && (t.includes("【文法・語法・表現】") || t.includes("【文法】"));
}

const NL_ESSAY_RUBRIC_MAX_PER_AXIS = 25;

export function seedStudentReleaseFromProofread(pr: {
  evaluation?: string;
  general_comment?: string;
  explanation?: string;
  content_comment?: string;
  grammar_comment?: string;
  content_deduction?: number;
  grammar_deduction?: number;
  final_version?: string;
  final_essay?: string;
  line1_feedback?: string;
  line2_improvement?: string;
  line3_next_action?: string;
}): StudentRelease {
  const finalRaw = sanitizeFinalEssayArtifactText((pr.final_essay || pr.final_version || "").trim());
  const explRaw = (pr.explanation || "").trim();
  const formattedExpl = formatExplanationForPublicView(explRaw);
  const splitFromExpl = explRaw
    ? splitExplanationIntoContentGrammarSections(formattedExpl)
    : { contentComment: "", grammarComment: "" };
  const contentCommentFromApi = (pr.content_comment || "").trim();
  const grammarCommentFromApi = (pr.grammar_comment || "").trim();
  /** JSON の content_comment / grammar_comment を優先（レガシー explanation の誤分割を防ぐ） */
  const contentComment = contentCommentFromApi || splitFromExpl.contentComment;
  const grammarComment = grammarCommentFromApi || splitFromExpl.grammarComment;
  const contentDed = Number(pr.content_deduction);
  const grammarDed = Number(pr.grammar_deduction);
  const hasEval = Boolean((pr.evaluation || "").trim());
  const generalComment =
    (pr.general_comment || "").trim() || (!hasEval ? legacyProofreadGeneralComment(pr) : "");

  const alreadyMerged = proofreadExplanationLooksSectionMerged(explRaw);
  let explanationOut = formattedExpl;
  if (
    !alreadyMerged &&
    (contentCommentFromApi ||
      grammarCommentFromApi ||
      Number.isFinite(contentDed) ||
      Number.isFinite(grammarDed) ||
      Boolean(contentComment) ||
      Boolean(grammarComment))
  ) {
    let cd = Number.isFinite(contentDed) ? Math.max(0, Math.floor(contentDed)) : 0;
    let gd = Number.isFinite(grammarDed) ? Math.max(0, Math.floor(grammarDed)) : 0;
    const fromEval = nlDeductionsFromEvaluationLine(String(pr.evaluation ?? ""));
    if (fromEval) {
      cd = fromEval.content;
      gd = fromEval.grammar;
    }
    explanationOut = normalizeStudentExplanation(
      preprocessExplanationBeforeNormalize(
        buildExplanationFromSections({
          contentComment,
          grammarComment,
          contentDeduction: cd,
          grammarDeduction: gd,
          contentMax: NL_ESSAY_RUBRIC_MAX_PER_AXIS,
          grammarMax: NL_ESSAY_RUBRIC_MAX_PER_AXIS,
        }),
      ),
    );
  }

  return {
    scores: {},
    scoreTotal: 0,
    evaluation: "",
    generalComment,
    explanation: explanationOut,
    ...(contentComment ? { contentComment } : {}),
    ...(grammarComment ? { grammarComment } : {}),
    ...(Number.isFinite(contentDed) ? { contentDeduction: Math.max(0, contentDed) } : {}),
    ...(Number.isFinite(grammarDed) ? { grammarDeduction: Math.max(0, grammarDed) } : {}),
    finalText: finalRaw,
    updatedAt: new Date().toISOString(),
  };
}

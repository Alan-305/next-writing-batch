/**
 * 添削コメントの文法箇条書き（● 誤 → 正：理由）を行単位で抽出する。
 * 構造化タグが無い現状データ向けのヒューリスティック。
 */

import {
  classifyGrammarCategory,
  grammarCategoryLabel,
  type GrammarCategoryId,
} from "@/lib/ops/reports/grammar-categories";

export type GrammarBullet = {
  wrong: string;
  correct: string;
  reason: string;
  deduction: number | null;
  raw: string;
  category: GrammarCategoryId;
  submissionId?: string;
  taskId?: string;
  studentName?: string;
  pdfAvailable?: boolean;
};

export type WeaknessSourceRef = {
  submissionId: string;
  taskId: string;
  studentName: string;
  pdfAvailable: boolean;
};

export type AggregatedGrammarWeakness = {
  key: string;
  wrong: string;
  correct: string;
  count: number;
  totalDeduction: number;
  sampleReason: string;
  category: GrammarCategoryId;
  categoryLabel: string;
  /** この表現が出た提出（最大件数で打ち切り） */
  sources: WeaknessSourceRef[];
  /** 匿名ハンドアウト用の代表例（氏名なし） */
  examples: Array<{ wrong: string; correct: string; reason: string }>;
};

const BULLET_LEAD_RE = /^(?:●|○|・)\s*/;
const ARROW_RE = /\s*(?:→|->|⇒|➡)\s*/;
const DEDUCTION_RE = /[（(]\s*[➖\-−]?\s*(\d+(?:\.\d+)?)\s*点\s*[）)]\s*$/;

function stripBullet(line: string): string {
  return line.trim().replace(BULLET_LEAD_RE, "").trim();
}

function isSkippedLine(body: string): boolean {
  if (!body) return true;
  if (/^(内容|文法)減点\s*合計\s*[:：]/.test(body)) return true;
  if (/^【/.test(body)) return true;
  if (/^[①-⑳]/.test(body) && !ARROW_RE.test(body)) return true;
  return false;
}

function splitReason(rest: string): { correct: string; reason: string } {
  const colon = rest.search(/[：:]/);
  if (colon < 0) return { correct: rest.trim(), reason: "" };
  return {
    correct: rest.slice(0, colon).trim(),
    reason: rest.slice(colon + 1).trim(),
  };
}

function extractDeduction(reason: string): { reason: string; deduction: number | null } {
  const m = reason.match(DEDUCTION_RE);
  if (!m) return { reason, deduction: null };
  const n = Number(m[1]);
  return {
    reason: reason.replace(DEDUCTION_RE, "").trim(),
    deduction: Number.isFinite(n) ? n : null,
  };
}

/** 誤表現の集約キー（小文字・空白正規化） */
export function normalizeWrongPhrase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/[。．.!?！？]+$/g, "");
}

/**
 * 1 本のコメント文字列から文法ミス行を抽出する。
 * 形式例: `● the solution of … → tackling …：理由。（-1点）`
 */
export function parseGrammarBulletLines(text: string): GrammarBullet[] {
  const src = (text ?? "").replace(/\r\n/g, "\n");
  if (!src.trim()) return [];

  const out: GrammarBullet[] = [];
  for (const line of src.split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    const body = stripBullet(raw);
    if (isSkippedLine(body)) continue;
    if (!ARROW_RE.test(body)) continue;

    const parts = body.split(ARROW_RE);
    if (parts.length < 2) continue;
    const wrong = (parts[0] ?? "").trim();
    const rest = parts.slice(1).join(" → ").trim();
    if (!wrong || !rest) continue;

    const { correct, reason: reasonRaw } = splitReason(rest);
    const { reason, deduction } = extractDeduction(reasonRaw);
    if (!correct) continue;

    const category = classifyGrammarCategory({ wrong, correct, reason });
    out.push({
      wrong,
      correct,
      reason,
      deduction,
      raw,
      category,
    });
  }
  return out;
}

export function aggregateGrammarWeaknesses(
  bullets: GrammarBullet[],
  options?: { topN?: number; maxExamplesPerKey?: number; maxSourcesPerKey?: number },
): AggregatedGrammarWeakness[] {
  const topN = options?.topN ?? 200;
  const maxExamples = options?.maxExamplesPerKey ?? 3;
  const maxSources = options?.maxSourcesPerKey ?? 12;
  const map = new Map<
    string,
    {
      wrong: string;
      correct: string;
      count: number;
      totalDeduction: number;
      sampleReason: string;
      category: GrammarCategoryId;
      categoryVotes: Map<GrammarCategoryId, number>;
      sources: WeaknessSourceRef[];
      sourceIds: Set<string>;
      examples: Array<{ wrong: string; correct: string; reason: string }>;
    }
  >();

  for (const b of bullets) {
    const key = normalizeWrongPhrase(b.wrong);
    if (!key) continue;
    const cur = map.get(key);
    const source: WeaknessSourceRef | null =
      b.submissionId && b.submissionId.trim()
        ? {
            submissionId: b.submissionId.trim(),
            taskId: (b.taskId ?? "").trim() || "—",
            studentName: (b.studentName ?? "").trim() || "—",
            pdfAvailable: Boolean(b.pdfAvailable),
          }
        : null;

    if (!cur) {
      const categoryVotes = new Map<GrammarCategoryId, number>([[b.category, 1]]);
      const sources: WeaknessSourceRef[] = [];
      const sourceIds = new Set<string>();
      if (source) {
        sources.push(source);
        sourceIds.add(source.submissionId);
      }
      map.set(key, {
        wrong: b.wrong,
        correct: b.correct,
        count: 1,
        totalDeduction: b.deduction ?? 0,
        sampleReason: b.reason,
        category: b.category,
        categoryVotes,
        sources,
        sourceIds,
        examples: [{ wrong: b.wrong, correct: b.correct, reason: b.reason }],
      });
      continue;
    }
    cur.count += 1;
    cur.totalDeduction += b.deduction ?? 0;
    cur.categoryVotes.set(b.category, (cur.categoryVotes.get(b.category) ?? 0) + 1);
    let bestCat = cur.category;
    let bestVotes = 0;
    for (const [cat, votes] of cur.categoryVotes) {
      if (votes > bestVotes || (votes === bestVotes && cat !== "other" && bestCat === "other")) {
        bestVotes = votes;
        bestCat = cat;
      }
    }
    cur.category = bestCat;
    if (!cur.sampleReason && b.reason) cur.sampleReason = b.reason;
    if (source && !cur.sourceIds.has(source.submissionId) && cur.sources.length < maxSources) {
      cur.sources.push(source);
      cur.sourceIds.add(source.submissionId);
    } else if (source && cur.sourceIds.has(source.submissionId) && source.pdfAvailable) {
      const hit = cur.sources.find((s) => s.submissionId === source.submissionId);
      if (hit) hit.pdfAvailable = true;
    }
    if (cur.examples.length < maxExamples) {
      const dup = cur.examples.some(
        (e) => normalizeWrongPhrase(e.wrong) === key && e.correct === b.correct,
      );
      if (!dup) cur.examples.push({ wrong: b.wrong, correct: b.correct, reason: b.reason });
    }
  }

  return Array.from(map.entries())
    .map(([key, v]) => {
      const { categoryVotes: _votes, sourceIds: _ids, ...rest } = v;
      return {
        key,
        ...rest,
        categoryLabel: grammarCategoryLabel(rest.category),
      };
    })
    .sort((a, b) => b.count - a.count || b.totalDeduction - a.totalDeduction || a.wrong.localeCompare(b.wrong, "ja"))
    .slice(0, topN);
}

export function filterGrammarWeaknessesByCategories(
  items: AggregatedGrammarWeakness[],
  categoryIds: readonly string[] | null | undefined,
): AggregatedGrammarWeakness[] {
  // null/undefined = 未初期化扱いですべて表示。空配列 = 意図的に0件
  if (categoryIds == null) return items;
  if (categoryIds.length === 0) return [];
  const set = new Set(categoryIds);
  return items.filter((w) => set.has(w.category));
}

/** 内容コメントの「改善点」系箇条書きをざっくり抽出（頻度集計用） */
export function parseContentImprovementLines(text: string): string[] {
  const src = (text ?? "").replace(/\r\n/g, "\n");
  if (!src.trim()) return [];
  const lines: string[] = [];
  let inImprove = false;
  for (const line of src.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/改善点|伸びしろ|直したい/.test(t)) {
      inImprove = true;
      continue;
    }
    if (/良い点|【ヒント】|^【/.test(t) && !/改善/.test(t)) {
      inImprove = false;
      continue;
    }
    const body = stripBullet(t);
    if (!body || isSkippedLine(body)) continue;
    if (inImprove || /^[・●○]/.test(t) || /^[-－—]/.test(t)) {
      if (body.length >= 4) lines.push(body);
    }
  }
  return lines;
}

export type ContentThemeItem = {
  key: string;
  label: string;
  count: number;
  sources: WeaknessSourceRef[];
};

export function aggregateContentThemes(
  lines: Array<{ text: string; source?: WeaknessSourceRef }>,
  options?: { topN?: number; maxSourcesPerKey?: number },
): ContentThemeItem[] {
  const topN = options?.topN ?? 15;
  const maxSources = options?.maxSourcesPerKey ?? 12;
  const map = new Map<
    string,
    { label: string; count: number; sources: WeaknessSourceRef[]; sourceIds: Set<string> }
  >();
  for (const row of lines) {
    const line = row.text;
    const key = normalizeWrongPhrase(line).slice(0, 80);
    if (!key) continue;
    const cur = map.get(key);
    if (!cur) {
      const sources: WeaknessSourceRef[] = [];
      const sourceIds = new Set<string>();
      if (row.source) {
        sources.push(row.source);
        sourceIds.add(row.source.submissionId);
      }
      map.set(key, { label: line.trim().slice(0, 120), count: 1, sources, sourceIds });
      continue;
    }
    cur.count += 1;
    if (row.source && !cur.sourceIds.has(row.source.submissionId) && cur.sources.length < maxSources) {
      cur.sources.push(row.source);
      cur.sourceIds.add(row.source.submissionId);
    }
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      label: v.label,
      count: v.count,
      sources: v.sources,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja"))
    .slice(0, topN);
}

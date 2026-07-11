import type { Submission } from "@/lib/submissions-store";
import {
  GRAMMAR_CATEGORY_DEFS,
  grammarCategoryLabel,
  type GrammarCategoryId,
} from "@/lib/ops/reports/grammar-categories";
import {
  aggregateContentThemes,
  aggregateGrammarWeaknesses,
  parseContentImprovementLines,
  parseGrammarBulletLines,
  type AggregatedGrammarWeakness,
} from "@/lib/ops/reports/parse-grammar-bullets";
import {
  parseReportFilterSearchParams,
  submissionMatchesReportFilters,
  type ReportFilterInput,
} from "@/lib/ops/reports/build-report-summary";

export type GrammarCategoryStat = {
  id: GrammarCategoryId;
  label: string;
  /** 集約後のユニーク表現数 */
  itemCount: number;
  /** 元の箇条書き行数 */
  bulletCount: number;
};

export type ReportWeaknessesResult = {
  matchedCount: number;
  grammarBulletCount: number;
  /** 集約後の全件数（カテゴリフィルタ前） */
  grammarItemCount: number;
  categories: GrammarCategoryStat[];
  topGrammar: AggregatedGrammarWeakness[];
  contentThemes: Array<{ key: string; label: string; count: number }>;
  /** 個人フィルタ時: その生徒のミス一覧（氏名は呼び出し側で付与） */
  personalGrammar: AggregatedGrammarWeakness[];
};

function grammarTextFromSubmission(s: Submission): string {
  const sr = s.studentRelease;
  const fromRelease = String(sr?.grammarComment ?? "").trim();
  if (fromRelease) return fromRelease;
  const expl = String(sr?.explanation ?? "").trim();
  if (expl) return expl;
  return String(s.proofread?.grammar_comment ?? s.proofread?.explanation ?? "").trim();
}

function contentTextFromSubmission(s: Submission): string {
  const sr = s.studentRelease;
  const fromRelease = String(sr?.contentComment ?? "").trim();
  if (fromRelease) return fromRelease;
  const expl = String(sr?.explanation ?? "").trim();
  if (expl) return expl;
  return String(s.proofread?.content_comment ?? "").trim();
}

function buildCategoryStats(
  bullets: ReturnType<typeof parseGrammarBulletLines>,
  aggregated: AggregatedGrammarWeakness[],
): GrammarCategoryStat[] {
  const bulletByCat = new Map<GrammarCategoryId, number>();
  for (const b of bullets) {
    bulletByCat.set(b.category, (bulletByCat.get(b.category) ?? 0) + 1);
  }
  const itemByCat = new Map<GrammarCategoryId, number>();
  for (const w of aggregated) {
    itemByCat.set(w.category, (itemByCat.get(w.category) ?? 0) + 1);
  }

  return GRAMMAR_CATEGORY_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    itemCount: itemByCat.get(def.id) ?? 0,
    bulletCount: bulletByCat.get(def.id) ?? 0,
  })).filter((c) => c.bulletCount > 0 || c.itemCount > 0);
}

export function buildReportWeaknesses(
  submissions: Submission[],
  filters: ReportFilterInput,
  options?: { topN?: number },
): ReportWeaknessesResult {
  const matched = submissions.filter((s) => submissionMatchesReportFilters(s, filters));
  const allBullets = matched.flatMap((s) => parseGrammarBulletLines(grammarTextFromSubmission(s)));
  const contentLines = matched.flatMap((s) => parseContentImprovementLines(contentTextFromSubmission(s)));
  const topN = options?.topN ?? 200;
  const topGrammar = aggregateGrammarWeaknesses(allBullets, { topN });
  const contentThemes = aggregateContentThemes(contentLines, { topN: 15 });
  const categories = buildCategoryStats(allBullets, topGrammar);

  const studentQ = (filters.studentQuery ?? "").trim();
  const personalGrammar = studentQ
    ? aggregateGrammarWeaknesses(allBullets, { topN: 200 })
    : [];

  return {
    matchedCount: matched.length,
    grammarBulletCount: allBullets.length,
    grammarItemCount: topGrammar.length,
    categories,
    topGrammar,
    contentThemes,
    personalGrammar,
  };
}

export { grammarCategoryLabel, parseReportFilterSearchParams };
export type { GrammarCategoryId };

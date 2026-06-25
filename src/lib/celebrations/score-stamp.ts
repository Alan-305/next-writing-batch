export type ScoreStampTier = "excellent" | "very_good" | "good_try";

export type ScoreStamp = {
  tier: ScoreStampTier;
  /** 0–100（整数） */
  percentage: number;
  label: string;
};

/** 合計得点の満点に対する割合（0–100）。算出不能なら null。 */
export function computeScorePercentage(scoreTotal: number, scoreMaxTotal: number): number | null {
  const total = Number(scoreTotal);
  const max = Number(scoreMaxTotal);
  if (!Number.isFinite(total) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((total / max) * 100);
}

/**
 * 得点率に応じたスタンプ。
 * - 90%以上: Excellent!
 * - 80%以上: Very Good!
 * - 70%以上: Good Try：もう少しだ！
 */
export function resolveScoreStamp(scoreTotal: number, scoreMaxTotal: number): ScoreStamp | null {
  const percentage = computeScorePercentage(scoreTotal, scoreMaxTotal);
  if (percentage === null) return null;

  if (percentage >= 90) {
    return { tier: "excellent", percentage, label: "Excellent!" };
  }
  if (percentage >= 80) {
    return { tier: "very_good", percentage, label: "Very Good!" };
  }
  if (percentage >= 70) {
    return { tier: "good_try", percentage, label: "Good Try：もう少しだ！" };
  }
  return null;
}

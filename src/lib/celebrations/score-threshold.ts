/** 満点の80％以上で祝福演出を出す */
export function isScoreCelebrationEligible(scoreTotal: number, scoreMaxTotal: number): boolean {
  const total = Number(scoreTotal);
  const max = Number(scoreMaxTotal);
  if (!Number.isFinite(total) || !Number.isFinite(max) || max <= 0) return false;
  return total >= max * 0.8;
}

export function resolveScoreMaxTotalFromRubric(
  maxTotal: number | undefined,
  itemMaxSum: number,
  fallback = 50,
): number {
  if (typeof maxTotal === "number" && maxTotal > 0) return maxTotal;
  if (itemMaxSum > 0) return itemMaxSum;
  return fallback;
}

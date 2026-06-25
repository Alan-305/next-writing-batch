import { resolveScoreStamp } from "@/lib/celebrations/score-stamp";

type Props = {
  scoreTotal: number;
  scoreMaxTotal: number;
};

export function ScoreEvaluationStamp({ scoreTotal, scoreMaxTotal }: Props) {
  const stamp = resolveScoreStamp(scoreTotal, scoreMaxTotal);
  if (!stamp) return null;

  return (
    <div
      className={`score-eval-stamp score-eval-stamp--${stamp.tier}`}
      role="img"
      aria-label={`得点率 ${stamp.percentage}パーセント — ${stamp.label}`}
    >
      <span className="score-eval-stamp__ring" aria-hidden="true" />
      <span className="score-eval-stamp__text">{stamp.label}</span>
    </div>
  );
}

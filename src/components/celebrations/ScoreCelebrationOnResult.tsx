"use client";

import { ScoreBalloonCelebration } from "@/components/celebrations/ScoreBalloonCelebration";

type Props = {
  scoreTotal: number;
  scoreMaxTotal: number;
};

/** 結果ページで得点表示と同時にバルーン演出 */
export function ScoreCelebrationOnResult({ scoreTotal, scoreMaxTotal }: Props) {
  return <ScoreBalloonCelebration scoreTotal={scoreTotal} scoreMaxTotal={scoreMaxTotal} />;
}

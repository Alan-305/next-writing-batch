"use client";

import { useEffect, useState } from "react";

import { pickRandomMessage, SCORE_ENCOURAGEMENT_MESSAGES } from "@/lib/celebrations/encouragement-messages";
import { isScoreCelebrationEligible } from "@/lib/celebrations/score-threshold";

const BALLOON_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

type Props = {
  scoreTotal: number;
  scoreMaxTotal: number;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function ScoreBalloonCelebration({ scoreTotal, scoreMaxTotal }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const eligible = isScoreCelebrationEligible(scoreTotal, scoreMaxTotal);
  const [active, setActive] = useState(false);
  const [message] = useState(() => pickRandomMessage(SCORE_ENCOURAGEMENT_MESSAGES));

  useEffect(() => {
    if (!eligible) return;
    setActive(true);
    const t = window.setTimeout(() => setActive(false), reducedMotion ? 3500 : 5500);
    return () => window.clearTimeout(t);
  }, [eligible, scoreTotal, scoreMaxTotal, reducedMotion]);

  if (!eligible || !active) return null;

  const balloons = Array.from({ length: reducedMotion ? 6 : 12 }, (_, i) => ({
    id: i,
    left: `${8 + ((i * 19) % 84)}%`,
    color: BALLOON_COLORS[i % BALLOON_COLORS.length],
    delay: `${(i % 6) * 0.18}s`,
    duration: `${3.8 + (i % 4) * 0.35}s`,
    scale: 0.75 + (i % 3) * 0.12,
  }));

  return (
    <div className="celebration-overlay celebration-overlay--score no-print" role="presentation">
      {!reducedMotion ? (
        <div className="celebration-balloons" aria-hidden>
          {balloons.map((b) => (
            <span
              key={b.id}
              className="celebration-balloon"
              style={{
                left: b.left,
                background: b.color,
                animationDelay: b.delay,
                animationDuration: b.duration,
                transform: `scale(${b.scale})`,
              }}
            />
          ))}
        </div>
      ) : null}
      <div className="celebration-toast celebration-toast--score" role="status">
        <p className="celebration-toast__eyebrow">高得点おめでとう！</p>
        <p className="celebration-toast__message">{message}</p>
        <p className="celebration-toast__score muted">
          {scoreTotal} / {scoreMaxTotal} 点（満点の80％以上）
        </p>
      </div>
    </div>
  );
}

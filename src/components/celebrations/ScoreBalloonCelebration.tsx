"use client";

import { useEffect, useState } from "react";

import { pickRandomMessage, SCORE_ENCOURAGEMENT_MESSAGES } from "@/lib/celebrations/encouragement-messages";
import { isScoreCelebrationEligible } from "@/lib/celebrations/score-threshold";

const BALLOON_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#06b6d4"];
const CONFETTI_COLORS = ["#fbbf24", "#f472b6", "#34d399", "#60a5fa", "#c084fc", "#fb7185"];

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
    const t = window.setTimeout(() => setActive(false), reducedMotion ? 4500 : 8000);
    return () => window.clearTimeout(t);
  }, [eligible, scoreTotal, scoreMaxTotal, reducedMotion]);

  if (!eligible || !active) return null;

  const balloonCount = reducedMotion ? 10 : 22;
  const confettiCount = reducedMotion ? 0 : 36;

  const balloons = Array.from({ length: balloonCount }, (_, i) => ({
    id: i,
    left: `${4 + ((i * 13) % 92)}%`,
    color: BALLOON_COLORS[i % BALLOON_COLORS.length],
    delay: `${(i % 8) * 0.12}s`,
    duration: `${3.2 + (i % 5) * 0.28}s`,
    scale: 0.9 + (i % 4) * 0.14,
  }));

  const confetti = Array.from({ length: confettiCount }, (_, i) => ({
    id: i,
    left: `${(i * 11 + 3) % 100}%`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${(i % 10) * 0.08}s`,
    duration: `${2.8 + (i % 6) * 0.22}s`,
    size: 8 + (i % 4) * 4,
  }));

  return (
    <div
      className="celebration-overlay celebration-overlay--score no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-score-title"
      onClick={() => setActive(false)}
    >
      {!reducedMotion ? (
        <>
          <div className="celebration-confetti" aria-hidden>
            {confetti.map((c) => (
              <span
                key={c.id}
                className="celebration-confetti-piece"
                style={{
                  left: c.left,
                  background: c.color,
                  width: c.size,
                  height: c.size * 0.65,
                  animationDelay: c.delay,
                  animationDuration: c.duration,
                }}
              />
            ))}
          </div>
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
                  ["--balloon-scale" as string]: String(b.scale),
                }}
              />
            ))}
          </div>
        </>
      ) : null}
      <div
        className="celebration-toast celebration-toast--score"
        role="status"
        onClick={(ev) => ev.stopPropagation()}
      >
        <p id="celebration-score-title" className="celebration-toast__eyebrow">
          🎉 高得点おめでとう！
        </p>
        <p className="celebration-toast__message">{message}</p>
        <p className="celebration-toast__score">
          <strong>
            {scoreTotal} / {scoreMaxTotal} 点
          </strong>
          <span className="celebration-toast__score-note">（満点の80％以上）</span>
        </p>
        <button type="button" className="celebration-toast__dismiss" onClick={() => setActive(false)}>
          閉じる
        </button>
      </div>
    </div>
  );
}

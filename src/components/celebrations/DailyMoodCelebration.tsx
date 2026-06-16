"use client";

import { useEffect, useMemo, useState } from "react";

import {
  dailyCelebrationStorageKey,
  hasShownDailyCelebrationToday,
  markDailyCelebrationShown,
} from "@/lib/celebrations/celebration-storage";
import { resolveDailyMoodTheme, todayDateKey } from "@/lib/celebrations/daily-mood-catalog";
import { pickMessageBySeed } from "@/lib/celebrations/encouragement-messages";
import { DAILY_ENCOURAGEMENT_MESSAGES } from "@/lib/celebrations/encouragement-messages";

type Props = {
  audience: "teacher" | "student";
  /** uid / orgId / guest など */
  identity: string;
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

export function DailyMoodCelebration({ audience, identity }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);
  const dateKey = todayDateKey();
  const storageKey = dailyCelebrationStorageKey(audience, identity);

  const theme = useMemo(() => resolveDailyMoodTheme(), []);
  const message = useMemo(
    () => pickMessageBySeed(DAILY_ENCOURAGEMENT_MESSAGES, `${dateKey}:${storageKey}`),
    [dateKey, storageKey],
  );

  useEffect(() => {
    if (!identity.trim()) return;
    if (hasShownDailyCelebrationToday(storageKey, dateKey)) return;
    markDailyCelebrationShown(storageKey, dateKey);
    const t = window.setTimeout(() => setVisible(true), 400);
    return () => window.clearTimeout(t);
  }, [dateKey, identity, storageKey]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), reducedMotion ? 4500 : 7000);
    return () => window.clearTimeout(t);
  }, [visible, reducedMotion]);

  if (!visible) return null;

  const particles = Array.from({ length: theme.particleCount }, (_, i) => ({
    id: i,
    left: `${(i * 17 + 7) % 100}%`,
    delay: `${(i % 8) * 0.35}s`,
    duration: `${4.2 + (i % 5) * 0.4}s`,
    size: `${1.35 + (i % 5) * 0.22}rem`,
  }));

  return (
    <div
      className="celebration-overlay celebration-overlay--daily celebration-overlay--no-dismiss no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-daily-title"
    >
      {!reducedMotion ? (
        <div className="celebration-particles celebration-particles--daily" aria-hidden>
          {particles.map((p) => (
            <span
              key={p.id}
              className="celebration-particle celebration-particle--fall"
              style={{
                left: p.left,
                animationDelay: p.delay,
                animationDuration: p.duration,
                fontSize: p.size,
              }}
            >
              {theme.particleEmoji}
            </span>
          ))}
        </div>
      ) : null}
      <div className="celebration-toast celebration-toast--daily" role="status">
        <p id="celebration-daily-title" className="celebration-toast__eyebrow">
          {theme.particleEmoji} {theme.label}の一日
        </p>
        <p className="celebration-toast__message">{message}</p>
      </div>
    </div>
  );
}

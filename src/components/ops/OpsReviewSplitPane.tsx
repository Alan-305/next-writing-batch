"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_LEFT_PCT = 28;
const MAX_LEFT_PCT = 72;
const STORAGE_KEY = "nwb-ops-review-split-left-pct";

type Props = {
  left: ReactNode;
  right: ReactNode;
  defaultLeftPercent?: number;
};

function clampPct(n: number): number {
  return Math.min(MAX_LEFT_PCT, Math.max(MIN_LEFT_PCT, n));
}

function readStoredPct(fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? clampPct(n) : fallback;
  } catch {
    return fallback;
  }
}

export function OpsReviewSplitPane({ left, right, defaultLeftPercent = 48 }: Props) {
  const [leftPct, setLeftPct] = useState(defaultLeftPercent);
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLeftPct(readStoredPct(defaultLeftPercent));
  }, [defaultLeftPercent]);

  const onDividerPointerDown = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setDragging(true);
  }, []);

  const onDividerPointerMove = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const pct = clampPct((x / rect.width) * 100);
    setLeftPct(pct);
  }, [dragging]);

  const onDividerPointerUp = useCallback((ev: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    try {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    setLeftPct((current) => {
      try {
        localStorage.setItem(STORAGE_KEY, String(Math.round(current)));
      } catch {
        /* ignore */
      }
      return current;
    });
  }, [dragging]);

  return (
    <div
      ref={splitRef}
      className={`ops-review-split${dragging ? " ops-review-split--dragging" : ""}`}
    >
      <div
        className="ops-review-split__pane ops-review-split__pane--left"
        style={{ flexBasis: `${leftPct}%` }}
      >
        {left}
      </div>
      <div
        className="ops-review-split__divider"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(leftPct)}
        aria-valuemin={MIN_LEFT_PCT}
        aria-valuemax={MAX_LEFT_PCT}
        aria-label="左右の幅を調整"
        onPointerDown={onDividerPointerDown}
        onPointerMove={onDividerPointerMove}
        onPointerUp={onDividerPointerUp}
        onPointerCancel={onDividerPointerUp}
      />
      <div className="ops-review-split__pane ops-review-split__pane--right">{right}</div>
    </div>
  );
}

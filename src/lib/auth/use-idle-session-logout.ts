"use client";

import { useEffect, useRef } from "react";

import { IDLE_ACTIVITY_EVENTS, IDLE_SESSION_TIMEOUT_MS } from "@/lib/auth/idle-session-timeout";

type Options = {
  active: boolean;
  onIdle: () => void;
  timeoutMs?: number;
};

/**
 * 指定時間、ユーザー操作（クリック・キー入力等）がなければ onIdle を呼ぶ。
 * タブを非表示にしたあと、表示復帰時に期限切れなら即 onIdle する。
 */
export function useIdleSessionLogout({ active, onIdle, timeoutMs = IDLE_SESSION_TIMEOUT_MS }: Options) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!active) return;

    let lastActivity = Date.now();
    let timer: number | null = null;

    const fireIdle = () => {
      onIdleRef.current();
    };

    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      const remaining = timeoutMs - (Date.now() - lastActivity);
      if (remaining <= 0) {
        fireIdle();
        return;
      }
      timer = window.setTimeout(fireIdle, remaining);
    };

    const bump = () => {
      lastActivity = Date.now();
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity >= timeoutMs) {
        fireIdle();
        return;
      }
      schedule();
    };

    for (const type of IDLE_ACTIVITY_EVENTS) {
      window.addEventListener(type, bump, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    schedule();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      for (const type of IDLE_ACTIVITY_EVENTS) {
        window.removeEventListener(type, bump);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, timeoutMs]);
}

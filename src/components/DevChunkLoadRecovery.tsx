"use client";

import { useEffect } from "react";

const STORAGE_KEY = "nw:dev-chunk-reload-count";
const MAX_RELOADS = 2;

function looksLikeChunkLoadFailure(message: string): boolean {
  return /ChunkLoadError|Loading chunk/i.test(message);
}

/**
 * 開発中に HMR / .next 差し替えで古いチャンク URL が残ると ChunkLoadError になる。
 * 本番では無効。自動再読み込みはセッションあたり MAX_RELOADS 回まで。
 */
export function DevChunkLoadRecovery() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const maybeReload = (message: string) => {
      if (!looksLikeChunkLoadFailure(message)) return;
      const n = Number(sessionStorage.getItem(STORAGE_KEY) || "0");
      if (n >= MAX_RELOADS) return;
      sessionStorage.setItem(STORAGE_KEY, String(n + 1));
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      maybeReload(String(e.message || ""));
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const msg =
        r && typeof r === "object" && "message" in r && typeof (r as Error).message === "string"
          ? (r as Error).message
          : String(r ?? "");
      maybeReload(msg);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

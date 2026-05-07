"use client";

import { useEffect } from "react";

const STORAGE_KEY = "nw:dev-chunk-reload-count";
const MAX_RELOADS = 2;

function looksLikeChunkLoadFailure(message: string): boolean {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|importing a module script failed|dynamic import module|Importing a module script failed/i.test(
    message,
  );
}

function isNextStaticAssetUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname.startsWith("/_next/static/");
  } catch {
    return url.includes("/_next/static/");
  }
}

/**
 * 開発中に HMR / .next 差し替えで古いチャンク URL が残ると ChunkLoadError になる。
 * 本番では無効。自動再読み込みはセッションあたり MAX_RELOADS 回まで。
 */
export function DevChunkLoadRecovery() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const maybeReload = (reason: string) => {
      const should =
        looksLikeChunkLoadFailure(reason) || reason === "next-static-asset-404";
      if (!should) return;
      const n = Number(sessionStorage.getItem(STORAGE_KEY) || "0");
      if (n >= MAX_RELOADS) return;
      sessionStorage.setItem(STORAGE_KEY, String(n + 1));
      window.location.reload();
    };

    /** capture: script / stylesheet の読み込み失敗（メッセージが空のことが多い） */
    const onErrorCapture = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLScriptElement && t.src && isNextStaticAssetUrl(t.src)) {
        maybeReload("next-static-asset-404");
        return;
      }
      if (t instanceof HTMLLinkElement && t.href && isNextStaticAssetUrl(t.href)) {
        maybeReload("next-static-asset-404");
      }
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

    window.addEventListener("error", onErrorCapture, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onErrorCapture, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

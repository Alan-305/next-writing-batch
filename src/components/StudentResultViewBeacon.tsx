"use client";

import { useEffect } from "react";

type Props = { submissionId: string };

const storageKey = (id: string) => `nw:student-result-mark-viewed:${id}`;

/** 公開済み結果ページ表示時に、初回のみ閲覧をサーバへ記録する */
export function StudentResultViewBeacon({ submissionId }: Props) {
  useEffect(() => {
    const id = submissionId.trim();
    if (!id) return;

    const run = async () => {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey(id))) return;
      try {
        const res = await fetch(`/api/submissions/${encodeURIComponent(id)}/mark-viewed`, { method: "POST" });
        if (res.ok && typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(storageKey(id), "1");
        }
      } catch {
        // 次回表示で再試行
      }
    };

    void run();
  }, [submissionId]);

  return null;
}

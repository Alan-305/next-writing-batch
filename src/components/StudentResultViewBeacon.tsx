"use client";

import { useEffect } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type Props = { submissionId: string };

const storageKey = (id: string) => `nw:student-result-mark-viewed:${id}`;

/** 公開済み結果ページ表示時に、初回のみ閲覧をサーバへ記録する（提出者ログイン時のみ） */
export function StudentResultViewBeacon({ submissionId }: Props) {
  const { user, authLoading } = useFirebaseAuthContext();

  useEffect(() => {
    const id = submissionId.trim();
    if (!id || authLoading || !user) return;

    const run = async () => {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey(id))) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/submissions/${encodeURIComponent(id)}/mark-viewed`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(storageKey(id), "1");
        }
      } catch {
        // 次回表示で再試行
      }
    };

    void run();
  }, [submissionId, user, authLoading]);

  return null;
}

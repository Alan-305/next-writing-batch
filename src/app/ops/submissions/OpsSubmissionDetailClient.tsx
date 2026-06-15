"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { OpsSubmissionDetailBody } from "@/components/ops/OpsSubmissionDetailBody";
import type { Submission } from "@/lib/submissions-store";
import type { TaskProblemsMaster } from "@/lib/task-problems-core";

type Bundle = {
  ok?: boolean;
  submission?: Submission;
  master?: TaskProblemsMaster | null;
  taskRubricDefaults?: Record<string, number>;
  teacherSetupDefaults?: Record<string, number>;
  message?: string;
};

export function OpsSubmissionDetailClient() {
  const params = useParams();
  const raw = typeof params?.submissionId === "string" ? params.submissionId : "";
  const submissionId = decodeURIComponent(raw || "").trim();

  const { user, authLoading } = useFirebaseAuthContext();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [err, setErr] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pendingScrollRef = useRef<string | null>(null);

  const handleReloadComplete = useCallback((scrollToId?: string) => {
    if (scrollToId) pendingScrollRef.current = scrollToId;
    setReloadToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!submissionId || authLoading) return;
    if (!user) {
      setErr("ログインが必要です。");
      return;
    }
    let cancelled = false;
    void (async () => {
      setErr("");
      const isInitialLoad = reloadToken === 0;
      if (isInitialLoad) setBundle(null);
      else setRefreshing(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/ops/submissions/${encodeURIComponent(submissionId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        let json: Bundle = {};
        try {
          json = (text ? JSON.parse(text) : {}) as Bundle;
        } catch {
          json = { message: text || "読み込みに失敗しました。" };
        }
        if (cancelled) return;
        if (!res.ok) {
          setErr((json as { message?: string }).message ?? "読み込みに失敗しました。");
          return;
        }
        setBundle(json);
        const scrollId = pendingScrollRef.current;
        if (scrollId) {
          pendingScrollRef.current = null;
          window.setTimeout(() => {
            document.getElementById(scrollId)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 80);
        }
      } catch {
        if (!cancelled) setErr("通信エラーが発生しました。");
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissionId, user, authLoading, reloadToken]);

  if (!submissionId) {
    return (
      <main>
        <h1>確認＆修正</h1>
        <p>受付IDがありません。</p>
        <Link href="/ops/submissions">一覧に戻る</Link>
      </main>
    );
  }

  if (authLoading || (!err && !bundle && user)) {
    return (
      <main>
        <h1>確認＆修正</h1>
        <p className="muted">読み込み中…</p>
      </main>
    );
  }

  if (err || !bundle?.submission) {
    return (
      <main>
        <h1>確認＆修正</h1>
        <p>{err || "該当データが見つかりませんでした。"}</p>
        <p>
          <Link href="/ops/submissions">一覧に戻る</Link>
        </p>
      </main>
    );
  }

  return (
    <>
      {refreshing ? (
        <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.92rem" }} role="status">
          内容を更新しています…
        </p>
      ) : null}
      <OpsSubmissionDetailBody
        submission={bundle.submission}
        master={bundle.master ?? null}
        taskRubricDefaults={bundle.taskRubricDefaults ?? {}}
        teacherSetupDefaults={bundle.teacherSetupDefaults ?? {}}
        onReloadComplete={handleReloadComplete}
      />
    </>
  );
}

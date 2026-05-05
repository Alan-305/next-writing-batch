"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!submissionId || authLoading) return;
    if (!user) {
      setErr("ログインが必要です。");
      return;
    }
    let cancelled = false;
    void (async () => {
      setErr("");
      setBundle(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/ops/submissions/${encodeURIComponent(submissionId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as Bundle;
        if (cancelled) return;
        if (!res.ok) {
          setErr((json as { message?: string }).message ?? "読み込みに失敗しました。");
          return;
        }
        setBundle(json);
      } catch {
        if (!cancelled) setErr("通信エラーが発生しました。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissionId, user, authLoading]);

  if (!submissionId) {
    return (
      <main>
        <h1>提出詳細</h1>
        <p>受付IDがありません。</p>
        <Link href="/ops/submissions">一覧に戻る</Link>
      </main>
    );
  }

  if (authLoading || (!err && !bundle && user)) {
    return (
      <main>
        <h1>提出詳細</h1>
        <p className="muted">読み込み中…</p>
      </main>
    );
  }

  if (err || !bundle?.submission) {
    return (
      <main>
        <h1>提出詳細</h1>
        <p>{err || "該当データが見つかりませんでした。"}</p>
        <p>
          <Link href="/ops/submissions">一覧に戻る</Link>
        </p>
      </main>
    );
  }

  return (
    <OpsSubmissionDetailBody
      submission={bundle.submission}
      master={bundle.master ?? null}
      taskRubricDefaults={bundle.taskRubricDefaults ?? {}}
      teacherSetupDefaults={bundle.teacherSetupDefaults ?? {}}
    />
  );
}

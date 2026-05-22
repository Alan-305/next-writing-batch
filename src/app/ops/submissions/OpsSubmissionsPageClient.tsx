"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { OpsPackageZipTaskPanel } from "@/components/OpsPackageZipTaskPanel";
import { OpsSubmissionsTable } from "@/components/OpsSubmissionsTable";
import { RunProofreadPanel } from "@/components/RunProofreadPanel";
import type { Submission } from "@/lib/submissions-store";

async function fetchSubmissions(token: string): Promise<Submission[]> {
  const res = await fetch("/api/submissions", { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { ok?: boolean; data?: Submission[]; message?: string };
  if (!res.ok || !json.ok || !Array.isArray(json.data)) {
    throw new Error(json.message ?? "提出一覧を読めませんでした。");
  }
  return json.data;
}

export function OpsSubmissionsPageClient() {
  const { user, authLoading } = useFirebaseAuthContext();
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [loadErr, setLoadErr] = useState("");

  const reloadSubmissions = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const data = await fetchSubmissions(token);
      setSubmissions(data);
      setLoadErr("");
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "再読み込みに失敗しました。");
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoadErr("ログインが必要です。");
      setSubmissions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const data = await fetchSubmissions(token);
        if (cancelled) return;
        setSubmissions(data);
        setLoadErr("");
      } catch (e: unknown) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : "通信エラーで提出一覧を読めませんでした。");
          setSubmissions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const hasActiveProofread = useMemo(() => {
    if (!submissions) return false;
    return submissions.some((s) => s.status === "queued" || s.status === "processing");
  }, [submissions]);

  useEffect(() => {
    if (!hasActiveProofread || !user) return;
    const id = window.setInterval(() => {
      void reloadSubmissions();
    }, 5_000);
    return () => window.clearInterval(id);
  }, [hasActiveProofread, user, reloadSubmissions]);

  const pendingByTaskId = useMemo(() => {
    const m = new Map<string, number>();
    if (!submissions) return m;
    for (const s of submissions) {
      if (s.status !== "pending") continue;
      const t = s.taskId.trim();
      if (!t) continue;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [submissions]);

  const pendingTaskIds = useMemo(() => [...pendingByTaskId.keys()].sort(), [pendingByTaskId]);
  const totalPending = useMemo(
    () => (submissions ?? []).filter((s) => s.status === "pending").length,
    [submissions],
  );
  const totalQueued = useMemo(
    () => (submissions ?? []).filter((s) => s.status === "queued" || s.status === "processing").length,
    [submissions],
  );

  const failedByTaskId = useMemo(() => {
    const m = new Map<string, number>();
    if (!submissions) return m;
    for (const s of submissions) {
      if (s.status !== "failed") continue;
      const t = s.taskId.trim();
      if (!t) continue;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [submissions]);

  const failedTaskIds = useMemo(() => [...failedByTaskId.keys()].sort(), [failedByTaskId]);

  const tableRows = useMemo(() => {
    if (!submissions) return [];
    return submissions
      .filter((s) => String(s.submissionId ?? "").trim().length > 0)
      .map((s) => {
        const d4 = s.day4;
        const hasDay4Assets = Boolean(
          d4 &&
            !String(d4.error ?? "").trim() &&
            (String(d4.pdf_path ?? "").trim() ||
              String(d4.audio_path ?? "").trim() ||
              String(d4.qr_path ?? "").trim()),
        );
        const sr = s.studentRelease;
        return {
          submissionId: s.submissionId,
          submittedAt: s.submittedAt,
          taskId: s.taskId,
          studentId: s.studentId,
          studentName: s.studentName,
          status: s.status,
          proofreadQueuedAt: s.proofreadQueuedAt,
          hasDay4Assets,
          resultPublished: Boolean(sr?.operatorApprovedAt),
          studentResultFirstViewedAt: s.studentResultFirstViewedAt,
        };
      });
  }, [submissions]);

  if (authLoading || submissions === null) {
    return (
      <main>
        <h1>提出一覧</h1>
        <p className="muted">読み込み中…</p>
      </main>
    );
  }

  if (loadErr && submissions.length === 0) {
    return (
      <main>
        <h1>提出一覧</h1>
        <p className="error">{loadErr}</p>
        <p>
          <Link href="/ops">運用ハブ</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>提出一覧</h1>
      <p>
        <Link href="/ops">運用ハブ</Link>
        {" · "}
        <Link href="/ops/deliverables">納品ZIP</Link>
        {" · "}
        <Link href="/submit">提出画面へ</Link>
      </p>

      <div className="card">
        <h2>一括添削（今すぐ / 預ける）</h2>
        <p style={{ marginTop: 0, marginBottom: 8 }}>
          現在の <strong>pending</strong> 件数: {totalPending}
          {totalQueued > 0 ? (
            <>
              {" "}
              · <strong>queued / processing</strong>: {totalQueued}
            </>
          ) : null}
          {pendingTaskIds.length > 0 ? (
            <>
              {" "}
              （taskId 別:{" "}
              {pendingTaskIds.map((tid, i) => (
                <span key={tid}>
                  {i > 0 ? " · " : null}
                  <code>{tid}</code> {pendingByTaskId.get(tid) ?? 0} 件
                </span>
              ))}
              ）
            </>
          ) : null}
        </p>
        <RunProofreadPanel
          pendingTaskIds={pendingTaskIds}
          pendingByTaskId={Object.fromEntries(pendingByTaskId)}
          failedTaskIds={failedTaskIds}
          failedByTaskId={Object.fromEntries(failedByTaskId)}
          onEnqueued={() => void reloadSubmissions()}
        />
        <details className="muted" style={{ marginTop: 16 }}>
          <summary>ターミナルから同じことをする場合</summary>
          <p style={{ marginTop: 8, marginBottom: 6 }}>直接 Python する場合:</p>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {`export NEXT_WRITING_BATCH_KEY='…'
export NWB_ORGANIZATION_ID=your_tenant_id

./.venv/bin/python3 batch/run_day3_proofread.py --task-id 課題ID --submission-ids 受付UUID`}
          </pre>
        </details>
      </div>

      <OpsPackageZipTaskPanel />

      <div className="card">
        <OpsSubmissionsTable
          rows={tableRows}
          enableZipSelection
          onReloadSubmissions={() => void reloadSubmissions()}
        />
      </div>
    </main>
  );
}

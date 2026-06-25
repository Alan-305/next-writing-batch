"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { OpsPackageZipTaskPanel } from "@/components/OpsPackageZipTaskPanel";
import { OpsSubmissionsSummary } from "@/components/ops/OpsSubmissionsSummary";
import { OpsSubmissionsTable } from "@/components/OpsSubmissionsTable";
import { RunProofreadPanel } from "@/components/RunProofreadPanel";
import { OPS_DASHBOARD_LABEL } from "@/lib/ops/ops-dashboard-label";
import { OPS_COPY } from "@/lib/ops/submission-status-labels";
import type { Submission } from "@/lib/submissions-store";

async function fetchSubmissions(token: string): Promise<Submission[]> {
  const res = await fetch("/api/submissions", { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as { ok?: boolean; data?: Submission[]; message?: string };
  if (!res.ok || !json.ok || !Array.isArray(json.data)) {
    throw new Error(json.message ?? "提出一覧を読めませんでした。");
  }
  return json.data;
}

function hasStudentViewedPublishedResult(s: Submission): boolean {
  return (
    s.status === "done" &&
    Boolean(s.studentRelease?.operatorApprovedAt) &&
    Boolean(String(s.studentResultFirstViewedAt ?? "").trim())
  );
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

  const summary = useMemo(() => {
    const rows = submissions ?? [];
    return {
      total: rows.length,
      pending: rows.filter((s) => s.status === "pending").length,
      inProgress: rows.filter((s) => s.status === "queued" || s.status === "processing").length,
      failed: rows.filter((s) => s.status === "failed").length,
      done: rows.filter((s) => s.status === "done" && !hasStudentViewedPublishedResult(s)).length,
      viewed: rows.filter((s) => hasStudentViewedPublishedResult(s)).length,
    };
  }, [submissions]);

  const tableRows = useMemo(() => {
    if (!submissions) return [];
    return submissions
      .filter((s) => String(s.submissionId ?? "").trim().length > 0)
      .map((s) => {
        const d4 = s.day4;
        const sr = s.studentRelease;
        const hasDay4Assets = Boolean(
          s.status === "done" &&
            !(d4 && String(d4.error ?? "").trim()) &&
            (String(d4?.pdf_path ?? "").trim() ||
              String(sr?.operatorApprovedAt ?? "").trim() ||
              String(sr?.operatorFinalizedAt ?? "").trim() ||
              String(s.proofread?.evaluation ?? "").trim()),
        );
        const studentViewed = hasStudentViewedPublishedResult(s);
        const operatorWithdrawnAt = String(sr?.operatorWithdrawnAt ?? "").trim();
        const proofreadStartedAt = String(s.proofread?.startedAt ?? "").trim();
        const proofreadFinishedAt = String(
          s.proofread?.finishedAt ?? s.proofread?.generated_at ?? "",
        ).trim();
        const proofreadQueuedAt = String(s.proofreadQueuedAt ?? "").trim();
        return {
          submissionId: s.submissionId,
          submittedAt: s.submittedAt,
          taskId: s.taskId,
          studentId: s.studentId,
          studentName: s.studentName,
          status: studentViewed ? "viewed" : s.status,
          rawStatus: s.status,
          hasDay4Assets,
          resultPublished: Boolean(sr?.operatorApprovedAt),
          releaseWithdrawn: Boolean(operatorWithdrawnAt),
          operatorWithdrawnAt: operatorWithdrawnAt || undefined,
          proofreadStartedAt: proofreadStartedAt || undefined,
          proofreadFinishedAt: proofreadFinishedAt || undefined,
          proofreadQueuedAt: proofreadQueuedAt || undefined,
          studentResultFirstViewedAt: s.studentResultFirstViewedAt,
          studentReceiveMethod: s.studentReceiveMethod,
          studentReceiveMethodAt: s.studentReceiveMethodAt,
          studentViewed,
        };
      });
  }, [submissions]);

  if (authLoading || submissions === null) {
    return (
      <main>
        <h1>{OPS_COPY.pageTitle}</h1>
        <p className="muted">読み込み中…</p>
      </main>
    );
  }

  if (loadErr && submissions.length === 0) {
    return (
      <main>
        <h1>{OPS_COPY.pageTitle}</h1>
        <p className="error">{loadErr}</p>
        <p>
          <Link href="/ops">{OPS_DASHBOARD_LABEL}</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="ops-dashboard">
      <header className="ops-page-header">
        <div>
          <h1>{OPS_COPY.pageTitle}</h1>
          <p className="ops-page-header__lead">{OPS_COPY.pageLead}</p>
        </div>
        <nav className="ops-page-nav" aria-label="関連ページ">
          <Link href="/ops">{OPS_DASHBOARD_LABEL}</Link>
          <Link href="/ops/deliverables">納品ZIP</Link>
          <Link href="/submit">提出画面</Link>
        </nav>
      </header>

      <OpsSubmissionsSummary {...summary} />

      <section className="card ops-section" aria-labelledby="ops-bulk-proofread">
        <div className="ops-section__head">
          <h2 id="ops-bulk-proofread" className="ops-section__title">
            {OPS_COPY.bulkTitle}
          </h2>
          <p className="ops-section__lead">{OPS_COPY.bulkLead}</p>
        </div>
        <RunProofreadPanel
          pendingTaskIds={pendingTaskIds}
          pendingByTaskId={Object.fromEntries(pendingByTaskId)}
          failedTaskIds={failedTaskIds}
          failedByTaskId={Object.fromEntries(failedByTaskId)}
          onEnqueued={() => void reloadSubmissions()}
        />
      </section>

      <section className="card ops-section" aria-labelledby="ops-submissions-list">
        <div className="ops-section__head">
          <h2 id="ops-submissions-list" className="ops-section__title">
            提出リスト
          </h2>
          {hasActiveProofread ? (
            <p className="ops-section__lead">添削処理中のため、5秒ごとに自動更新しています。</p>
          ) : null}
        </div>
        <OpsSubmissionsTable
          rows={tableRows}
          enableZipSelection
          onReloadSubmissions={() => void reloadSubmissions()}
        />
      </section>

      <section className="card ops-section" aria-labelledby="ops-deliverables-zip">
        <div className="ops-section__head">
          <h2 id="ops-deliverables-zip" className="ops-section__title">
            {OPS_COPY.deliverablesZip}
          </h2>
          <p className="ops-section__lead">
            補助機能です。通常は上の<strong>提出リスト左端のチェック</strong>で選び、表下の「選択分の PDF を ZIP 化」を使ってください。
          </p>
        </div>
        <OpsPackageZipTaskPanel embedded />
      </section>
    </main>
  );
}

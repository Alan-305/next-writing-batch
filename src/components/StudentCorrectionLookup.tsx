"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { RegisteredTaskIdField } from "@/components/RegisteredTaskIdField";
import { formatExplanationForPublicView } from "@/lib/student-release";

type Phase = "reviewing" | "published";

type LookupResult =
  | { found: false; message: string }
  | {
      found: true;
      submissionId: string;
      submittedAt: string;
      phase: Phase;
      publishedAt?: string;
      resultSummary?: {
        scoreTotal: number;
        evaluation: string;
        explanation: string;
        finalText: string;
      };
      pdfHref?: string;
    };

const emptyLookup = { taskId: "", studentId: "", studentName: "" };
function buildDownloadBody(
  meta: { taskId: string; studentId: string; studentName: string; submissionId: string; publishedAt?: string },
  r: NonNullable<Extract<LookupResult, { found: true }>["resultSummary"]>,
): string {
  const lines = [
    "添削結果（確定版・テキスト）",
    "",
    `課題ID: ${meta.taskId}`,
    `学籍番号: ${meta.studentId}`,
    `氏名: ${meta.studentName}`,
    `受付番号: ${meta.submissionId}`,
    ...(meta.publishedAt ? [`公開日時: ${meta.publishedAt}`] : []),
    "",
    `合計: ${r.scoreTotal}点`,
    "",
    "【得点・評価】",
    r.evaluation,
    "",
    "【解説】",
    formatExplanationForPublicView(r.explanation),
    "",
    "【完成版（英文）】",
    r.finalText,
    "",
  ];
  return lines.join("\n");
}

function downloadTextFile(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function StudentCorrectionLookup() {
  const router = useRouter();
  const { user, profile } = useFirebaseAuthContext();
  const getAccessToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);
  const [form, setForm] = useState(emptyLookup);
  /** ログイン提出以前のデータ用（課題＋学籍＋氏名） */
  const [legacyMode, setLegacyMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  /** 照会成功時点の課題ID・学籍番号・氏名（ダウンロード文面用） */
  const [metaAtLookup, setMetaAtLookup] = useState<typeof emptyLookup | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setResult(null);
    setMetaAtLookup(null);
    const snapshot = { ...form };
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = await getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const payload = legacyMode
        ? form
        : { taskId: form.taskId, studentId: "", studentName: "" };
      const response = await fetch("/api/submissions/lookup", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const json = await response.json();

      if (!response.ok) {
        setMessage(json?.message ?? "照会に失敗しました。");
        return;
      }

      if (!json.found) {
        setResult({ found: false, message: json.message ?? "見つかりませんでした。" });
        return;
      }

      const metaSnapshot = legacyMode
        ? snapshot
        : {
            taskId: snapshot.taskId,
            studentId: profile?.studentNumber?.trim() ?? "",
            studentName: profile?.nickname?.trim() ?? "",
          };
      setMetaAtLookup(metaSnapshot);
      setResult({
        found: true,
        submissionId: json.submissionId,
        submittedAt: json.submittedAt,
        phase: json.phase,
        publishedAt: json.publishedAt,
        resultSummary: json.resultSummary,
        pdfHref: json.pdfHref,
      });
    } catch {
      setMessage("通信エラーが発生しました。再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  const canDownloadText =
    result?.found && result.phase === "published" && result.resultSummary && metaAtLookup;

  return (
    <section aria-labelledby="correction-lookup-heading">
      <h2 id="correction-lookup-heading">添削結果の確認</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {legacyMode ? (
          <>
            <b>旧形式</b>の提出を照会する場合は、提出時と同じ<b>課題</b>・<b>学籍番号</b>・<b>氏名</b>を入力してください。
          </>
        ) : (
          <>
            ログイン中のアカウントで提出した答案を、<b>課題</b>だけ選んで照会します（学籍・氏名の入力は不要です）。
          </>
        )}
        運用が公開するまで「添削中」と表示されます。公開後は「添削完了」と、詳細ページ・ダウンロードから結果を確認できます。
      </p>

      <p style={{ marginBottom: 12 }}>
        <label style={{ cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            checked={legacyMode}
            disabled={loading}
            onChange={(e) => {
              setLegacyMode(e.target.checked);
              setForm(emptyLookup);
              setResult(null);
              setMetaAtLookup(null);
            }}
          />{" "}
          学籍番号・氏名で照会する（ログイン前の古い提出用）
        </label>
      </p>

      <form className="card" onSubmit={onSubmit}>
        <RegisteredTaskIdField
          value={form.taskId}
          onTaskIdChange={(tid) => {
            setForm((p) => ({ ...p, taskId: tid }));
          }}
          disabled={loading}
          getAccessToken={getAccessToken}
        />
        {legacyMode ? (
          <>
            <label className="field">
              <span>学籍番号</span>
              <input
                value={form.studentId}
                onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))}
                placeholder="提出時と同じ学籍番号"
                disabled={loading}
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>氏名</span>
              <input
                value={form.studentName}
                onChange={(e) => setForm((p) => ({ ...p, studentName: e.target.value }))}
                placeholder="提出時と同じ氏名"
                disabled={loading}
                autoComplete="name"
              />
            </label>
          </>
        ) : null}
        <button type="submit" disabled={loading}>
          {loading ? "照会中..." : "添削状況を照会"}
        </button>
      </form>

      {message ? <p className="error">{message}</p> : null}

      {result && !result.found ? <p className="muted">{result.message}</p> : null}

      {result?.found ? (
        <div className="card">
          <p style={{ marginTop: 0, fontWeight: 600 }}>
            {result.phase === "published" ? (
              <span className="success">添削完了（公開済み）</span>
            ) : (
              <span>添削中（運用が公開するまでお待ちください）</span>
            )}
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            受付番号: {result.submissionId}
            <br />
            提出日時: {result.submittedAt}
            {result.phase === "published" && result.publishedAt ? (
              <>
                <br />
                公開日時: {result.publishedAt}
              </>
            ) : null}
          </p>

          {result.phase === "published" ? (
            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="student-result-open-button"
                onClick={() => router.push(`/result/${result.submissionId}`)}
              >
                添削結果を見る
              </button>
              {canDownloadText && result.resultSummary && metaAtLookup ? (
                <button
                  type="button"
                  onClick={() => {
                    const summary = result.resultSummary;
                    if (!summary) return;
                    const body = buildDownloadBody(
                      {
                        taskId: metaAtLookup.taskId.trim(),
                        studentId: metaAtLookup.studentId.trim(),
                        studentName: metaAtLookup.studentName.trim(),
                        submissionId: result.submissionId,
                        publishedAt: result.publishedAt,
                      },
                      summary,
                    );
                    const safeId = result.submissionId.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
                    downloadTextFile(`添削結果_${safeId}.txt`, body);
                  }}
                >
                  テキストでダウンロード
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useState, type CSSProperties } from "react";
import {
  studentReceiveMethodLabel,
  type StudentReceiveMethod,
} from "@/lib/student-receive-method";
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
      displayNick?: string;
      studentReceiveMethod?: StudentReceiveMethod;
      studentReceiveMethodAt?: string;
      resultSummary?: {
        scoreTotal: number;
        evaluation: string;
        explanation: string;
        finalText: string;
      };
      pdfHref?: string;
    };

type Props = {
  /** 招待リンクの org（匿名提出・照会） */
  organizationId?: string;
};

function buildDownloadBody(
  meta: { displayNick: string; redeemId: string; submissionId: string; publishedAt?: string },
  r: NonNullable<Extract<LookupResult, { found: true }>["resultSummary"]>,
): string {
  const lines = [
    "添削結果（確定版・テキスト）",
    "",
    `ニックネーム: ${meta.displayNick}`,
    `引換ID: ${meta.redeemId}`,
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

const receiveButtonBase: CSSProperties = {
  minHeight: 44,
  padding: "12px 18px",
  fontSize: "0.95rem",
  borderRadius: 8,
  border: "2px solid transparent",
  cursor: "pointer",
  fontWeight: 700,
};

export function StudentCorrectionLookup({ organizationId = "" }: Props) {
  const router = useRouter();
  const org = organizationId.trim();
  const anonymousMode = Boolean(org);

  const [displayNick, setDisplayNick] = useState("");
  const [redeemId, setRedeemId] = useState("");
  const [loading, setLoading] = useState(false);
  const [choosingMethod, setChoosingMethod] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [metaAtLookup, setMetaAtLookup] = useState<{ displayNick: string; redeemId: string } | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!anonymousMode) {
      setMessage("招待リンク（?org=テナントID）からアクセスしてください。");
      return;
    }
    setLoading(true);
    setMessage("");
    setResult(null);
    setMetaAtLookup(null);
    const nickSnapshot = displayNick.trim();
    const redeemSnapshot = redeemId.trim();
    try {
      const response = await fetch("/api/submissions/redeem-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org,
          displayNick: nickSnapshot,
          redeemId: redeemSnapshot,
        }),
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

      setMetaAtLookup({ displayNick: nickSnapshot, redeemId: redeemSnapshot });
      setResult({
        found: true,
        submissionId: json.submissionId,
        submittedAt: json.submittedAt,
        phase: json.phase,
        publishedAt: json.publishedAt,
        displayNick: json.displayNick,
        studentReceiveMethod: json.studentReceiveMethod,
        studentReceiveMethodAt: json.studentReceiveMethodAt,
        resultSummary: json.resultSummary,
        pdfHref: json.pdfHref,
      });
    } catch {
      setMessage("通信エラーが発生しました。再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  const chooseReceiveMethod = useCallback(
    async (method: StudentReceiveMethod) => {
      if (!metaAtLookup || !result?.found || result.phase !== "published") return;
      if (result.studentReceiveMethod) return;

      setChoosingMethod(true);
      setMessage("");
      try {
        const response = await fetch("/api/submissions/receive-method", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: org,
            displayNick: metaAtLookup.displayNick,
            redeemId: metaAtLookup.redeemId,
            method,
          }),
        });
        const json = await response.json();
        if (!response.ok) {
          setMessage(json?.message ?? "受け取り方法の保存に失敗しました。");
          return;
        }
        setResult((prev) => {
          if (!prev || !prev.found) return prev;
          return {
            ...prev,
            studentReceiveMethod: json.method as StudentReceiveMethod,
            studentReceiveMethodAt: json.selectedAt,
          };
        });
      } catch {
        setMessage("通信エラーが発生しました。再度お試しください。");
      } finally {
        setChoosingMethod(false);
      }
    },
    [metaAtLookup, org, result],
  );

  const canDownloadText =
    result?.found && result.phase === "published" && result.resultSummary && metaAtLookup;

  if (!anonymousMode) {
    return (
      <section aria-labelledby="correction-lookup-heading">
        <h2 id="correction-lookup-heading">添削結果の確認</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          先生から共有された<strong>招待リンク</strong>からこのページを開くと、ニックネームと引換IDで結果を確認できます。
        </p>
      </section>
    );
  }

  const publishedResult = result?.found && result.phase === "published" ? result : null;
  const receiveMethod = publishedResult?.studentReceiveMethod;

  return (
    <section aria-labelledby="correction-lookup-heading">
      <h2 id="correction-lookup-heading">添削結果の確認</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        提出時にお渡しした<b>ニックネーム</b>と<b>引換ID</b>の両方を入力してください。運用が公開するまで「添削中」と表示されます。
      </p>

      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>ニックネーム（提出時の表示名）</span>
          <input
            value={displayNick}
            onChange={(e) => setDisplayNick(e.target.value)}
            placeholder="提出完了画面に表示された名前"
            disabled={loading || choosingMethod}
            autoComplete="off"
            maxLength={24}
          />
        </label>
        <label className="field">
          <span>引換ID</span>
          <input
            value={redeemId}
            onChange={(e) => setRedeemId(e.target.value)}
            placeholder="提出完了画面に表示された ID"
            disabled={loading || choosingMethod}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" disabled={loading || choosingMethod}>
          {loading ? "照会中..." : "添削状況を照会"}
        </button>
      </form>

      {message ? <p className="error">{message}</p> : null}
      {result && !result.found ? <p className="muted">{result.message}</p> : null}

      {publishedResult ? (
        <div className="card">
          <p style={{ marginTop: 0, fontWeight: 600 }}>
            <span className="success">添削完了（公開済み）</span>
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            {publishedResult.displayNick ? (
              <>
                ニックネーム: {publishedResult.displayNick}
                <br />
              </>
            ) : null}
            提出日時: {publishedResult.submittedAt}
            {publishedResult.publishedAt ? (
              <>
                <br />
                公開日時: {publishedResult.publishedAt}
              </>
            ) : null}
          </p>

          {!receiveMethod ? (
            <div
              role="group"
              aria-label="結果の受け取り方法"
              style={{
                marginTop: 20,
                padding: "16px 18px",
                borderRadius: 10,
                border: "2px solid #86efac",
                background: "linear-gradient(180deg, #f0fdf4 0%, #fff 100%)",
              }}
            >
              <p style={{ margin: "0 0 12px", fontWeight: 700, lineHeight: 1.55 }}>
                添削が完成しました。結果の受け取り方を選んでください。
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  type="button"
                  disabled={choosingMethod}
                  style={{
                    ...receiveButtonBase,
                    background: choosingMethod ? "#94a3b8" : "#16a34a",
                    color: "#fff",
                  }}
                  onClick={() => void chooseReceiveMethod("web")}
                >
                  {choosingMethod ? "保存中…" : "Web確認"}
                </button>
                <button
                  type="button"
                  disabled={choosingMethod}
                  style={{
                    ...receiveButtonBase,
                    background: choosingMethod ? "#94a3b8" : "#fff",
                    color: "#0f172a",
                    borderColor: "#cbd5e1",
                  }}
                  onClick={() => void chooseReceiveMethod("teacher_meeting")}
                >
                  {choosingMethod ? "保存中…" : "講師面談"}
                </button>
              </div>
              <p className="muted" style={{ margin: "12px 0 0", fontSize: "0.92rem", lineHeight: 1.55 }}>
                <strong>Web確認</strong> … このあと画面で添削結果を読めます。
                <br />
                <strong>講師面談</strong> … 先生のところに行ってください。画面でも結果を確認できます。
              </p>
              <p className="muted" style={{ margin: "12px 0 0", fontSize: "0.92rem", lineHeight: 1.55 }}>
                添削結果に関して質問がある場合には、ページ下の<strong>サポート</strong>から連絡して下さい。
              </p>
            </div>
          ) : (
            <>
              <p style={{ marginTop: 16, marginBottom: 0, fontWeight: 600 }}>
                受け取り方法:{" "}
                <span className="ops-badge ops-badge--done" style={{ verticalAlign: "middle" }}>
                  {studentReceiveMethodLabel(receiveMethod)}
                </span>
              </p>
              {receiveMethod === "teacher_meeting" ? (
                <p className="success" style={{ marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>
                  講師面談を選びました。<strong>先生のところに行ってください。</strong>
                  あわせて、下のボタンから画面でも添削結果を確認できます。
                </p>
              ) : null}
            </>
          )}

          {receiveMethod ? (
            <>
              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  className="student-result-open-button"
                  onClick={() => router.push(`/result/${publishedResult.submissionId}`)}
                >
                  添削結果を見る
                </button>
                {canDownloadText && publishedResult.resultSummary && metaAtLookup ? (
                  <button
                    type="button"
                    onClick={() => {
                      const summary = publishedResult.resultSummary;
                      if (!summary) return;
                      const body = buildDownloadBody(
                        {
                          displayNick: metaAtLookup.displayNick,
                          redeemId: metaAtLookup.redeemId,
                          submissionId: publishedResult.submissionId,
                          publishedAt: publishedResult.publishedAt,
                        },
                        summary,
                      );
                      const safeId = publishedResult.submissionId.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
                      downloadTextFile(`添削結果_${safeId}.txt`, body);
                    }}
                  >
                    テキストでダウンロード
                  </button>
                ) : null}
              </div>
              <p className="muted" style={{ marginTop: 14, marginBottom: 0, fontSize: "0.92rem", lineHeight: 1.6 }}>
                添削結果に関して質問がある場合には、ページ下の<strong>サポート</strong>から連絡して下さい。
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {result?.found && result.phase === "reviewing" ? (
        <div className="card">
          <p style={{ marginTop: 0, fontWeight: 600 }}>
            <span>添削中（運用が公開するまでお待ちください）</span>
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            {result.displayNick ? (
              <>
                ニックネーム: {result.displayNick}
                <br />
              </>
            ) : null}
            提出日時: {result.submittedAt}
          </p>
        </div>
      ) : null}
    </section>
  );
}

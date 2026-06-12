"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useState } from "react";

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
      displayNick?: string;
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

export function StudentCorrectionLookup({ organizationId = "" }: Props) {
  const router = useRouter();
  const org = organizationId.trim();
  const anonymousMode = Boolean(org);

  const [displayNick, setDisplayNick] = useState("");
  const [redeemId, setRedeemId] = useState("");
  const [loading, setLoading] = useState(false);
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
            disabled={loading}
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
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
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
            {result.displayNick ? (
              <>
                ニックネーム: {result.displayNick}
                <br />
              </>
            ) : null}
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
                        displayNick: metaAtLookup.displayNick,
                        redeemId: metaAtLookup.redeemId,
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

"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isTeacherByRoles } from "@/lib/auth/user-roles";
import { joinEssayMultipartBlocks } from "@/lib/essay-multipart";
import {
  countEnglishWords,
  MAX_OFFICIAL_ESSAY_WORDS,
  MAX_SYSTEM_ESSAY_WORDS,
} from "@/lib/english-word-count";
import { RegisteredTaskIdField } from "@/components/RegisteredTaskIdField";
import { StudentCorrectionLookup } from "@/components/StudentCorrectionLookup";
import { StudentSupportMailbox } from "@/components/StudentSupportMailbox";
import { SubmitGradingConfirmDialog } from "@/components/SubmitGradingConfirmDialog";
import { TextareaWithFileDrop } from "@/components/TextareaWithFileDrop";

type FieldErrors = Partial<
  Record<"taskId" | "studentId" | "studentName" | "essayText" | "problemId" | "nickname", string>
>;

const initialMeta = {
  taskId: "",
  studentId: "",
  studentName: "",
  nickname: "",
};

type AnswerMode = "single" | "multipart";

type ImportHint = { text: string; variant: "success" | "error" | "info" };

type SubmitSuccess = {
  displayNick: string;
  redeemId: string;
  submissionId: string;
};

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

export default function SubmitPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteOrg = (searchParams.get("org") ?? "").trim();
  const isAnonymousInvite = Boolean(inviteOrg);

  const { user, roles, authLoading } = useFirebaseAuthContext();
  const isTeacherTrial = Boolean(user && isTeacherByRoles(roles) && !isAnonymousInvite);

  const [form, setForm] = useState({ ...initialMeta, essayText: "" });
  const [answerMode, setAnswerMode] = useState<AnswerMode>("single");
  const [essayParts, setEssayParts] = useState<string[]>(["", ""]);
  const [problemId, setProblemId] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [importHint, setImportHint] = useState<ImportHint | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<SubmitSuccess | null>(null);
  const [copiedPair, setCopiedPair] = useState(false);

  const charCount = useMemo(() => {
    if (answerMode === "multipart") {
      return essayParts.reduce((n, s) => n + s.length, 0);
    }
    return form.essayText.length;
  }, [answerMode, essayParts, form.essayText.length]);

  const essayTextForWordCount = useMemo(() => {
    if (answerMode === "multipart") {
      return joinEssayMultipartBlocks(essayParts);
    }
    return form.essayText;
  }, [answerMode, essayParts, form.essayText]);

  const wordCount = useMemo(() => countEnglishWords(essayTextForWordCount), [essayTextForWordCount]);
  const wordCountBlocksSubmit = wordCount > MAX_SYSTEM_ESSAY_WORDS;

  const getAccessToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  useEffect(() => {
    if (!submitSuccess) return;
    const timer = window.setTimeout(() => {
      document.getElementById("submit-success-credentials")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [submitSuccess]);

  useEffect(() => {
    if (authLoading) return;
    if (isAnonymousInvite) return;
    if (!user) return;
    if (isTeacherByRoles(roles)) return;
    router.replace(`/sign-in?next=${encodeURIComponent("/submit")}`);
  }, [authLoading, user, roles, router, isAnonymousInvite]);

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || wordCountBlocksSubmit) return;
    setSubmitConfirmOpen(true);
  };

  const runSubmit = async () => {
    setSubmitting(true);
    setMessage("");
    setErrors({});
    setImportHint(null);
    setSubmitSuccess(null);

    const pid = problemId.trim();
    const body =
      answerMode === "multipart"
        ? {
            taskId: form.taskId,
            studentId: "",
            studentName: "",
            ...(pid ? { problemId: pid } : {}),
            essayMultipart: true,
            essayParts,
            ...(isAnonymousInvite ? { organizationId: inviteOrg, nickname: form.nickname.trim() } : {}),
          }
        : {
            taskId: form.taskId,
            studentId: "",
            studentName: "",
            ...(pid ? { problemId: pid } : {}),
            essayText: form.essayText,
            essayMultipart: false,
            ...(isAnonymousInvite ? { organizationId: inviteOrg, nickname: form.nickname.trim() } : {}),
          };

    try {
      if (isAnonymousInvite) {
        const response = await fetch("/api/submissions/anonymous", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await response.json();
        if (!response.ok) {
          setErrors((json?.fields ?? {}) as FieldErrors);
          setMessage(json?.message ?? "送信に失敗しました。");
          return;
        }
        setSubmitSuccess({
          displayNick: String(json.displayNick ?? ""),
          redeemId: String(json.redeemId ?? ""),
          submissionId: String(json.submissionId ?? ""),
        });
        setForm({ ...initialMeta, essayText: "" });
        setEssayParts(["", ""]);
        setAnswerMode("single");
        setProblemId("");
        return;
      }

      if (!user) {
        setMessage("招待リンクからアクセスするか、教員としてログインしてください。");
        return;
      }
      const idToken = await user.getIdToken();
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) {
        setErrors((json?.fields ?? {}) as FieldErrors);
        setMessage(json?.message ?? "送信に失敗しました。");
        return;
      }
      setForm({ ...initialMeta, essayText: "" });
      setEssayParts(["", ""]);
      setAnswerMode("single");
      setProblemId("");
      setMessage(`${json.message} 受付番号: ${json.submissionId}`);
    } catch {
      setMessage("通信エラーが発生しました。再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirmSubmit = () => {
    setSubmitConfirmOpen(false);
    void runSubmit();
  };

  const hintClass = (v: ImportHint["variant"]) =>
    v === "success" ? "success" : v === "info" ? "muted" : "error";

  if (!isAnonymousInvite && !authLoading && !user) {
    return (
      <main>
        <h1>提出・受け取り</h1>
        <p className="warning">
          生徒の方は、先生から共有された<strong>招待リンク</strong>からアクセスしてください。
        </p>
        <p>
          教員の方は <Link href="/sign-in?next=/submit">ログイン</Link> してトライアル提出ができます。
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1 style={{ marginTop: 0 }}>提出・受け取り</h1>
      {isAnonymousInvite ? (
        <p className="student-page-lead">
          ログイン不要で英文を提出できます。提出後に表示される<strong>ニックネーム</strong>と<strong>引換ID</strong>
          を必ず保存してください（スクリーンショット推奨）。添削結果の確認に必要です。
        </p>
      ) : isTeacherTrial ? (
        <p className="student-page-lead">
          教員トライアル提出です。添削のたびに<strong>チケットを1枚消費</strong>します。
        </p>
      ) : null}

      {submitSuccess ? (
        <div
          id="submit-success-credentials"
          className="card"
          role="status"
          style={{
            marginBottom: 20,
            border: "3px solid #f97316",
            background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 45%, #fff 100%)",
            padding: "22px 24px",
            boxShadow: "0 8px 28px rgba(249, 115, 22, 0.35)",
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              fontWeight: 800,
              fontSize: "1.05rem",
              color: "#c2410c",
              letterSpacing: "0.02em",
            }}
          >
            ⚠ 必ず保存してください — 再表示できません
          </p>
          <h2 style={{ marginTop: 0, fontSize: "1.25rem", color: "#9a3412" }}>提出が完了しました</h2>
          <p style={{ margin: "0 0 16px", lineHeight: 1.6, fontWeight: 600 }}>
            以下の<strong>ニックネーム</strong>と<strong>引換ID</strong>をメモまたはスクリーンショットで保存してください。
          </p>
          <dl
            style={{
              margin: "0 0 16px",
              display: "grid",
              gap: 12,
              gridTemplateColumns: "auto 1fr",
              fontSize: "1.2rem",
              padding: "14px 16px",
              borderRadius: 10,
              background: "#fff",
              border: "2px dashed #fb923c",
            }}
          >
            <dt style={{ color: "#9a3412", fontWeight: 700 }}>ニックネーム</dt>
            <dd style={{ margin: 0, fontWeight: 800, color: "#ea580c" }}>{submitSuccess.displayNick}</dd>
            <dt style={{ color: "#9a3412", fontWeight: 700 }}>引換ID</dt>
            <dd
              style={{
                margin: 0,
                fontWeight: 800,
                fontFamily: "monospace",
                letterSpacing: "0.08em",
                color: "#dc2626",
                fontSize: "1.35rem",
              }}
            >
              {submitSuccess.redeemId}
            </dd>
          </dl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                copyText(`${submitSuccess.displayNick}\n${submitSuccess.redeemId}`);
                setCopiedPair(true);
                window.setTimeout(() => setCopiedPair(false), 2000);
              }}
              style={{ minHeight: 44, padding: "10px 16px" }}
            >
              {copiedPair ? "コピーしました" : "ニックネームと引換IDをコピー"}
            </button>
          </div>
          <p className="muted" style={{ margin: "14px 0 0", fontSize: "0.92rem" }}>
            受付番号（教員用）: {submitSuccess.submissionId}
          </p>
        </div>
      ) : null}

      <form className="card" onSubmit={onFormSubmit}>
        <RegisteredTaskIdField
          value={form.taskId}
          onTaskIdChange={(tid, defaultProblemId) => {
            setForm((p) => ({ ...p, taskId: tid }));
            setProblemId(defaultProblemId);
          }}
          disabled={submitting}
          errorText={errors.taskId}
          problemId={problemId}
          onProblemIdChange={setProblemId}
          getAccessToken={isAnonymousInvite ? undefined : getAccessToken}
          publicOrganizationId={isAnonymousInvite ? inviteOrg : undefined}
        />
        {errors.problemId ? <p className="error">{errors.problemId}</p> : null}

        {isAnonymousInvite ? (
          <label className="field">
            <span>ニックネーム（任意）</span>
            <input
              value={form.nickname}
              onChange={(e) => setForm((p) => ({ ...p, nickname: e.target.value }))}
              placeholder="空欄の場合はアプリが自動で付けます"
              disabled={submitting}
              autoComplete="off"
              maxLength={24}
            />
            <span className="muted" style={{ fontSize: "0.9em" }}>
              本名は使わないでください。未入力の場合、提出後に自動生成された名前が表示されます。
            </span>
          </label>
        ) : null}

        <fieldset className="field" style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
          <legend style={{ padding: "0 6px" }}>解答の提出形式</legend>
          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="radio"
              name="answerMode"
              checked={answerMode === "single"}
              disabled={submitting}
              onChange={() => setAnswerMode("single")}
            />{" "}
            1つの解答欄で提出する
          </label>
          <label style={{ display: "block" }}>
            <input
              type="radio"
              name="answerMode"
              checked={answerMode === "multipart"}
              disabled={submitting}
              onChange={() => setAnswerMode("multipart")}
            />{" "}
            設問ごとに分ける
          </label>
        </fieldset>

        <p className="warning" style={{ margin: "0 0 12px" }}>
          英文の本文に<strong>学籍番号・氏名・連絡先などの個人情報を書かないでください</strong>。
        </p>

        {answerMode === "single" ? (
          <>
            <TextareaWithFileDrop
              label={`英文の解答（50〜2000文字・目安${MAX_OFFICIAL_ESSAY_WORDS}語まで）`}
              rows={8}
              placeholder="英作文を入力するか、ファイルから取り込んでください。"
              value={form.essayText}
              onChange={(essayText) => setForm((p) => ({ ...p, essayText }))}
              confirmOnAppend
              jsonDropBehavior="none"
              disabled={submitting}
              tesseractLang="eng"
              geminiHandwritingOcr
              organizationIdForIngest={isAnonymousInvite ? inviteOrg : undefined}
              onNotify={(msg, variant) => setImportHint({ text: msg, variant })}
            />
            {errors.essayText ? <span className="error">{errors.essayText}</span> : null}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {essayParts.map((part, i) => (
              <div key={i}>
                <TextareaWithFileDrop
                  label={`Question ${i + 1}`}
                  rows={6}
                  value={part}
                  onChange={(next) =>
                    setEssayParts((prev) => {
                      const copy = [...prev];
                      copy[i] = next;
                      return copy;
                    })
                  }
                  confirmOnAppend
                  jsonDropBehavior="none"
                  disabled={submitting}
                  tesseractLang="eng"
                  geminiHandwritingOcr
                  organizationIdForIngest={isAnonymousInvite ? inviteOrg : undefined}
                  onNotify={(msg, variant) => setImportHint({ text: msg, variant })}
                />
              </div>
            ))}
            <button type="button" disabled={submitting} onClick={() => setEssayParts((p) => [...p, ""])}>
              設問を追加
            </button>
            {errors.essayText ? <span className="error">{errors.essayText}</span> : null}
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <span>文字数: {charCount}</span>
          {" · "}
          <span>英単語数: {wordCount}</span>
        </div>

        <button type="submit" disabled={submitting || wordCountBlocksSubmit} style={{ marginTop: 12 }}>
          {submitting ? "送信中..." : "内容を確認して送信"}
        </button>
      </form>

      <SubmitGradingConfirmDialog
        open={submitConfirmOpen}
        onDismiss={() => !submitting && setSubmitConfirmOpen(false)}
        onConfirm={onConfirmSubmit}
        busy={submitting}
        title="採点に使われる文面の確認"
      >
        <p style={{ margin: 0 }}>入力した英文がそのまま採点に使われます。内容を確認のうえ送信してください。</p>
      </SubmitGradingConfirmDialog>

      {importHint ? <p className={hintClass(importHint.variant)}>{importHint.text}</p> : null}
      {message ? <p className="error">{message}</p> : null}

      <StudentCorrectionLookup organizationId={isAnonymousInvite ? inviteOrg : undefined} />

      {isAnonymousInvite ? (
        <StudentSupportMailbox
          organizationId={inviteOrg}
          initialDisplayNick={submitSuccess?.displayNick ?? ""}
          initialRedeemId={submitSuccess?.redeemId ?? ""}
        />
      ) : null}
    </main>
  );
}

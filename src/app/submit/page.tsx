"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isTeacherByRoles } from "@/lib/auth/user-roles";
import { shouldRedirectStudentToOnboarding } from "@/lib/student-profile-gate";
import { joinEssayMultipartBlocks } from "@/lib/essay-multipart";
import {
  countEnglishWords,
  MAX_OFFICIAL_ESSAY_WORDS,
  MAX_SYSTEM_ESSAY_WORDS,
} from "@/lib/english-word-count";
import { NexusSupportForm } from "@/components/NexusSupportForm";
import { RegisteredTaskIdField } from "@/components/RegisteredTaskIdField";
import { StudentCorrectionLookup } from "@/components/StudentCorrectionLookup";
import { SubmitGradingConfirmDialog } from "@/components/SubmitGradingConfirmDialog";
import { TextareaWithFileDrop } from "@/components/TextareaWithFileDrop";

type FieldErrors = Partial<
  Record<"taskId" | "studentId" | "studentName" | "essayText" | "problemMemo" | "problemId", string>
>;

const initialMeta = {
  taskId: "",
  studentId: "",
  studentName: "",
  problemMemo: "",
};

type AnswerMode = "single" | "multipart";

type ImportHint = { text: string; variant: "success" | "error" | "info" };

export default function SubmitPage() {
  const router = useRouter();
  const { user, profile, profileLoading, roles, authLoading } = useFirebaseAuthContext();
  const [form, setForm] = useState({ ...initialMeta, essayText: "" });
  const [answerMode, setAnswerMode] = useState<AnswerMode>("single");
  const [essayParts, setEssayParts] = useState<string[]>(["", ""]);
  /** 複数設問マスタ用（単一設問ではサーバー側で補完） */
  const [problemId, setProblemId] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [importHint, setImportHint] = useState<ImportHint | null>(null);

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
    if (authLoading || profileLoading) return;
    if (!user) return;
    if (isTeacherByRoles(roles)) return;
    if (shouldRedirectStudentToOnboarding(roles, profile, profileLoading)) {
      router.replace(`/onboarding?next=${encodeURIComponent("/submit")}`);
    }
  }, [authLoading, profileLoading, user, roles, profile, router]);

  /** ログイン時は学籍・氏名をプロフィールから使うためフォームでは入力しない */
  const hideStudentFields = Boolean(user);

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

    const pid = problemId.trim();
    const body =
      answerMode === "multipart"
        ? {
            taskId: form.taskId,
            studentId: hideStudentFields ? "" : form.studentId,
            studentName: hideStudentFields ? "" : form.studentName,
            problemMemo: form.problemMemo,
            ...(pid ? { problemId: pid } : {}),
            essayMultipart: true,
            essayParts,
          }
        : {
            taskId: form.taskId,
            studentId: hideStudentFields ? "" : form.studentId,
            studentName: hideStudentFields ? "" : form.studentName,
            problemMemo: form.problemMemo,
            ...(pid ? { problemId: pid } : {}),
            essayText: form.essayText,
            essayMultipart: false,
          };

    try {
      if (!user) {
        setMessage("ログイン情報を読み込めませんでした。再ログインしてください。");
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
      setMessage(
        `${json.message} 受付番号: ${json.submissionId}（公開後は下の「添削結果の確認」、または /result/${json.submissionId} ）`,
      );
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

  return (
    <main>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0 }}>解答提出フォーム</h1>
        {user && (profile?.studentNumber || profile?.nickname || isTeacherByRoles(roles)) ? (
          <div
            className="muted"
            style={{ textAlign: "right", fontSize: "0.92rem", maxWidth: 320, lineHeight: 1.5 }}
          >
            {!isTeacherByRoles(roles) && profile?.studentNumber ? (
              <div>
                学籍番号: <strong>{profile.studentNumber}</strong>
              </div>
            ) : null}
            {!isTeacherByRoles(roles) && profile?.nickname ? (
              <div>
                ニックネーム: <strong>{profile.nickname}</strong>
              </div>
            ) : null}
            {isTeacherByRoles(roles) ? (
              <div>
                {profile?.nickname ? (
                  <>
                    表示名: <strong>{profile.nickname}</strong>
                  </>
                ) : (
                  <>教員アカウント</>
                )}
              </div>
            ) : null}
            <Link href="/settings/profile" style={{ display: "inline-block", marginTop: 4 }}>
              プロフィールを編集
            </Link>
          </div>
        ) : null}
      </div>
      <p className="student-page-lead">
        ログイン後は<strong>プロフィールに登録した学籍番号・ニックネーム</strong>が使われます。英文を入力し、内容を確認してから送信してください。
      </p>
      <p>
        <b>課題</b>はリストから選び、必要なら<b>問題メモ（任意）</b>も入力してから、<b>英文の解答</b>を記入して提出します。課題文の手入力は不要です（先生が登録した課題文が自動で使われます）。
        <b>解答欄</b>では写真・PDF・テキストをドロップして取り込めます。誤読やレイアウト崩れがある場合は、必ず手で直してから送信してください。
      </p>
      {!user ? (
        <p className="warning">
          提出には <Link href="/sign-in?next=/submit">ログイン</Link> が必要です。
        </p>
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
          getAccessToken={getAccessToken}
        />
        {errors.problemId ? <p className="error">{errors.problemId}</p> : null}

        {!hideStudentFields ? (
          <>
            <label className="field">
              <span>学籍番号</span>
              <input
                value={form.studentId}
                onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))}
                placeholder="例: A1023"
              />
              {errors.studentId ? <span className="error">{errors.studentId}</span> : null}
            </label>

            <label className="field">
              <span>氏名</span>
              <input
                value={form.studentName}
                onChange={(e) => setForm((p) => ({ ...p, studentName: e.target.value }))}
                placeholder="例: 山田 太郎"
              />
              {errors.studentName ? <span className="error">{errors.studentName}</span> : null}
            </label>
          </>
        ) : null}

        <label className="field">
          <span>問題メモ（任意・目安20字）</span>
          <input
            type="text"
            maxLength={30}
            value={form.problemMemo}
            onChange={(e) => setForm((p) => ({ ...p, problemMemo: e.target.value }))}
            placeholder="例: Week3 自由英作文"
            disabled={submitting}
            autoComplete="off"
          />
          <span className="muted" style={{ fontSize: "0.9em" }}>
            {form.problemMemo.length} / 30 字
          </span>
          {errors.problemMemo ? <span className="error">{errors.problemMemo}</span> : null}
        </label>

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
            1つの解答欄で提出する（設問が一つの場合）
          </label>
          <label style={{ display: "block" }}>
            <input
              type="radio"
              name="answerMode"
              checked={answerMode === "multipart"}
              disabled={submitting}
              onChange={() => setAnswerMode("multipart")}
            />{" "}
            設問ごとに分ける（設問が複数ある場合）
          </label>
        </fieldset>

        {hideStudentFields ? (
          <p className="warning" style={{ margin: "0 0 12px" }}>
            <strong>注意:</strong> 英文の本文に<strong>学籍番号・氏名・連絡先などの個人情報を書かないでください</strong>
            （採点・添削の対象テキストにそのまま含まれます）。
          </p>
        ) : null}

        {answerMode === "single" ? (
          <>
            <TextareaWithFileDrop
              label={`英文の解答（50〜2000文字・目安${MAX_OFFICIAL_ESSAY_WORDS}語まで）`}
              hint={
                <span>
                  用紙やノートの<strong>写真</strong>、<strong>PDF</strong>、<strong>テキスト</strong>をドロップして文字起こし・テキスト抽出します。誤読やレイアウト崩れがある場合は、必ず手で直してから送信してください。
                </span>
              }
              rows={8}
              placeholder="英作文を入力するか、ファイルから取り込んでください。"
              value={form.essayText}
              onChange={(essayText) => setForm((p) => ({ ...p, essayText }))}
              confirmOnAppend
              jsonDropBehavior="none"
              disabled={submitting}
              tesseractLang="eng"
              geminiHandwritingOcr
              onNotify={(msg, variant) => setImportHint({ text: msg, variant })}
            />
            {errors.essayText ? <span className="error">{errors.essayText}</span> : null}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p className="muted" style={{ margin: 0 }}>
              問題に (1)(2)… があるときは、それぞれの英文を <b>Question 1, 2…</b> に入力してください。送信時に{" "}
              <code>【(1)】</code> 形式へ変換して添削します。設問が増えたら「設問を追加」で欄を足せます（最低2欄）。
            </p>
            {essayParts.map((part, i) => (
              <div key={i}>
                <TextareaWithFileDrop
                  label={`Question ${i + 1}（設問 (${i + 1}) の英文）`}
                  hint={
                    <span>
                      各設問15文字以上。設問ごとに最大2500文字。全体の英単語数は目安{MAX_OFFICIAL_ESSAY_WORDS}語、上限{MAX_SYSTEM_ESSAY_WORDS}語です。
                    </span>
                  }
                  rows={6}
                  placeholder={`設問 (${i + 1}) の英文を入力するか、ファイルから取り込んでください。`}
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
                  onNotify={(msg, variant) => setImportHint({ text: msg, variant })}
                />
                {essayParts.length > 2 ? (
                  <button
                    type="button"
                    className="muted"
                    style={{ marginTop: 6, fontSize: "0.9em" }}
                    disabled={submitting}
                    onClick={() =>
                      setEssayParts((prev) => (prev.length <= 2 ? prev : prev.filter((_, j) => j !== i)))
                    }
                  >
                    この設問欄を削除
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              disabled={submitting}
              onClick={() => setEssayParts((p) => [...p, ""])}
            >
              設問を追加
            </button>
            {errors.essayText ? <span className="error">{errors.essayText}</span> : null}
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <span>文字数（目安）: {charCount}</span>
          {" · "}
          <span>英単語数（目安）: {wordCount}</span>
        </div>
        {wordCount > 0 ? (
          wordCount <= MAX_OFFICIAL_ESSAY_WORDS ? (
            <p className="success" style={{ margin: "8px 0 0" }}>
              現在 {wordCount} 語です。
            </p>
          ) : wordCount <= MAX_SYSTEM_ESSAY_WORDS ? (
            <p className="warning" style={{ margin: "8px 0 0" }}>
              現在 {wordCount} 語です。{MAX_OFFICIAL_ESSAY_WORDS}
              語を少し超えていますが、このまま添削可能です。
            </p>
          ) : (
            <p className="error" style={{ margin: "8px 0 0" }}>
              現在 {wordCount} 語です。{MAX_SYSTEM_ESSAY_WORDS}
              語を超えているため、短く調整してください。
            </p>
          )
        ) : null}

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
        <p style={{ margin: 0 }}>
          この画面で入力・修正した<strong>英文</strong>は、そのまま<strong>採点に使われます</strong>
          （写真やファイルから取り込んだ場合も、ここに表示されているテキストが対象です）。
        </p>
        <p style={{ margin: "12px 0 0" }}>
          誤字・取り込みミス・設問文やメモなど<strong>不要な文字の混入</strong>がないか、最終確認のうえ「送信を確定」を押してください。
        </p>
      </SubmitGradingConfirmDialog>

      {importHint ? <p className={hintClass(importHint.variant)}>{importHint.text}</p> : null}

      {message ? (
        <p className={message.includes("受付番号") ? "success" : "error"}>{message}</p>
      ) : null}

      <StudentCorrectionLookup />

      <NexusSupportForm />
    </main>
  );
}

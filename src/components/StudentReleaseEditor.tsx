"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import {
  formatExplanationForPublicView,
  proofreadExplanationLooksSectionMerged,
  seedStudentReleaseFromProofread,
  splitExplanationToSections,
  type StudentRelease,
} from "@/lib/student-release";
import { buildRubricScoresForEditor } from "@/lib/build-rubric-scores-for-editor";
import { computeScoreTotal, type TaskProblemsMaster } from "@/lib/task-problems-core";
import { sanitizeFinalEssayArtifactText } from "@/lib/student-final-essay-display";

type ProofreadSeed = {
  evaluation?: string;
  general_comment?: string;
  explanation?: string;
  content_comment?: string;
  grammar_comment?: string;
  content_deduction?: number;
  grammar_deduction?: number;
  final_version?: string;
  final_essay?: string;
  line1_feedback?: string;
  line2_improvement?: string;
  line3_next_action?: string;
  operator_message?: string;
  error?: string;
};

function coalesceText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

/** API が空文字で返す場合も次候補へ（`??` だけだと空文字で止まる） */
function firstNonEmptyComment(...candidates: (string | undefined | null)[]): string {
  for (const c of candidates) {
    if (c == null) continue;
    const raw = coalesceText(c);
    if (raw.trim()) return raw;
  }
  return "";
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** HTML エラーページ等で `res.json()` が投げるのを防ぐ */
async function parseFetchJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const head = text.slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(
      `HTTP ${res.status}（JSON 以外: ${head}${text.length > 180 ? "…" : ""}）。タイムアウトやプロキシ障害の可能性があります。`,
    );
  }
}

/** 502 などで本文が空のときも HTTP ステータスを出す */
function pickApiErrorMessage(json: unknown, res: Response, fallback: string): string {
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    const err = o.error;
    if (typeof err === "string" && err.trim()) return err.trim();
    const code = o.code;
    if (typeof code === "string" && code.trim())
      return `${fallback}（${code.trim()} / HTTP ${res.status}）`;
  }
  const st = res.statusText?.trim();
  return st ? `${fallback}（HTTP ${res.status} ${st}）` : `${fallback}（HTTP ${res.status}）`;
}

function findRubricItem(master: TaskProblemsMaster, kind: "content" | "grammar") {
  if (kind === "content") {
    return master.rubric.items.find((it) => it.id === "content") ?? master.rubric.items.find((it) => /内容/.test(it.label));
  }
  return (
    master.rubric.items.find((it) => it.id === "grammar") ??
    master.rubric.items.find((it) => /文法|語法/.test(it.label))
  );
}

function parseAiContentGrammarScores(evaluation: string): { content: number; grammar: number } | null {
  const t = (evaluation || "").trim();
  if (!t) return null;
  const m = t.match(/内容\s*(\d+)\s*点\s*[＋+]\s*文法(?:・語法)?\s*(\d+)\s*点/);
  if (!m) return null;
  const content = Number(m[1]);
  const grammar = Number(m[2]);
  if (!Number.isFinite(content) || !Number.isFinite(grammar)) return null;
  return { content, grammar };
}

type Props = {
  submissionId: string;
  taskId: string;
  master: TaskProblemsMaster;
  initialRelease: StudentRelease | null | undefined;
  proofread: ProofreadSeed | null | undefined;
  status: string;
  hasDay4Pdf: boolean;
  day4Error?: string;
  /** 同じ taskId の別提出で運用が保存した、ルーブリックの初期点 */
  taskRubricDefaults: Record<string, number>;
  /** 課題・添削設定（サーバー保存）から来る既定付け点（content / grammar） */
  teacherSetupScoreDefaults: Record<string, number>;
};

export function StudentReleaseEditor({
  submissionId,
  taskId,
  master,
  initialRelease,
  proofread,
  status,
  hasDay4Pdf,
  day4Error,
  taskRubricDefaults,
  teacherSetupScoreDefaults,
}: Props) {
  const router = useRouter();
  const { user } = useFirebaseAuthContext();
  const seeded = useMemo(() => {
    if (initialRelease) return initialRelease;
    if (status === "done" && proofread) {
      return seedStudentReleaseFromProofread(proofread);
    }
    return null;
  }, [initialRelease, proofread, status]);
  const aiScores = useMemo(
    () => parseAiContentGrammarScores(String(proofread?.evaluation ?? "")),
    [proofread?.evaluation],
  );
  /** 添削結果カードの「解説」と同じ整形（見出し・箇条書き）のあとで分割する */
  const proofreadExplanationForEditor = useMemo(
    () => formatExplanationForPublicView(String(proofread?.explanation ?? "")),
    [proofread?.explanation],
  );
  const aiSplitComments = useMemo(
    () => splitExplanationToSections(proofreadExplanationForEditor),
    [proofreadExplanationForEditor],
  );
  const hasSavedScores = Boolean(seeded?.scores && Object.keys(seeded.scores).length > 0);
  const contentItem = useMemo(() => findRubricItem(master, "content"), [master]);
  const grammarItem = useMemo(() => findRubricItem(master, "grammar"), [master]);
  const contentMax = contentItem?.max ?? 0;
  const grammarMax = grammarItem?.max ?? 0;

  const [scores, setScores] = useState<Record<string, number>>(() =>
    {
      const base = buildRubricScoresForEditor(master, {
      submissionScores: seeded?.scores,
      teacherSetupScoreDefaults,
      taskDefaults: taskRubricDefaults,
      });
      if (!hasSavedScores && contentItem && aiScores) {
        base[contentItem.id] = clampInt(aiScores.content, 0, contentMax);
      }
      if (!hasSavedScores && grammarItem && aiScores) {
        base[grammarItem.id] = clampInt(aiScores.grammar, 0, grammarMax);
      }
      return base;
    },
  );
  const [contentComment, setContentComment] = useState(() => {
    const merged = proofreadExplanationLooksSectionMerged(String(proofread?.explanation ?? ""));
    return firstNonEmptyComment(
      seeded?.contentComment,
      merged ? aiSplitComments.contentComment : proofread?.content_comment,
      merged ? proofread?.content_comment : aiSplitComments.contentComment,
    );
  });
  const [grammarComment, setGrammarComment] = useState(() => {
    const merged = proofreadExplanationLooksSectionMerged(String(proofread?.explanation ?? ""));
    return firstNonEmptyComment(
      seeded?.grammarComment,
      merged ? aiSplitComments.grammarComment : proofread?.grammar_comment,
      merged ? proofread?.grammar_comment : aiSplitComments.grammarComment,
    );
  });
  const [contentDeduction, setContentDeduction] = useState(() => {
    const saved = Number(seeded?.contentDeduction);
    if (Number.isFinite(saved)) return clampInt(saved, 0, contentMax);
    const aiDed = Number(proofread?.content_deduction);
    if (Number.isFinite(aiDed)) return clampInt(aiDed, 0, contentMax);
    if (!hasSavedScores && aiScores && contentItem) return clampInt(contentMax - aiScores.content, 0, contentMax);
    if (!contentItem) return 0;
    const score = Number(scores[contentItem.id] ?? 0);
    return clampInt(contentMax - (Number.isFinite(score) ? score : 0), 0, contentMax);
  });
  const [grammarDeduction, setGrammarDeduction] = useState(() => {
    const saved = Number(seeded?.grammarDeduction);
    if (Number.isFinite(saved)) return clampInt(saved, 0, grammarMax);
    const aiDed = Number(proofread?.grammar_deduction);
    if (Number.isFinite(aiDed)) return clampInt(aiDed, 0, grammarMax);
    if (!hasSavedScores && aiScores && grammarItem) return clampInt(grammarMax - aiScores.grammar, 0, grammarMax);
    if (!grammarItem) return 0;
    const score = Number(scores[grammarItem.id] ?? 0);
    return clampInt(grammarMax - (Number.isFinite(score) ? score : 0), 0, grammarMax);
  });
  const [finalText, setFinalText] = useState(() =>
    sanitizeFinalEssayArtifactText(coalesceText(seeded?.finalText)),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reimportFromProofread = () => {
    if (!proofread) return;
    const mergedFmt = proofreadExplanationLooksSectionMerged(String(proofread.explanation ?? ""));
    const mergedContent = firstNonEmptyComment(
      mergedFmt ? aiSplitComments.contentComment : proofread.content_comment,
      mergedFmt ? proofread.content_comment : aiSplitComments.contentComment,
    );
    const mergedGrammar = firstNonEmptyComment(
      mergedFmt ? aiSplitComments.grammarComment : proofread.grammar_comment,
      mergedFmt ? proofread.grammar_comment : aiSplitComments.grammarComment,
    );
    const nextFinalText = sanitizeFinalEssayArtifactText(
      coalesceText(proofread.final_essay ?? proofread.final_version ?? ""),
    );

    const aiDedContent = Number(proofread.content_deduction);
    const aiDedGrammar = Number(proofread.grammar_deduction);
    const parsed = parseAiContentGrammarScores(String(proofread.evaluation ?? ""));

    setContentComment(mergedContent);
    setGrammarComment(mergedGrammar);
    setFinalText(nextFinalText);
    if (Number.isFinite(aiDedContent)) {
      setContentDeduction(clampInt(aiDedContent, 0, contentMax));
    } else if (parsed && contentItem) {
      setContentDeduction(clampInt(contentMax - parsed.content, 0, contentMax));
    }
    if (Number.isFinite(aiDedGrammar)) {
      setGrammarDeduction(clampInt(aiDedGrammar, 0, grammarMax));
    } else if (parsed && grammarItem) {
      setGrammarDeduction(clampInt(grammarMax - parsed.grammar, 0, grammarMax));
    }
    setMessage("最新の添削結果を修正入力へ再取り込みしました。保存するまで確定はされません。");
    setError("");
  };

  const effectiveScores = useMemo(() => {
    const next: Record<string, number> = { ...scores };
    if (contentItem) {
      next[contentItem.id] = clampInt(contentMax - contentDeduction, 0, contentMax);
    }
    if (grammarItem) {
      next[grammarItem.id] = clampInt(grammarMax - grammarDeduction, 0, grammarMax);
    }
    return next;
  }, [contentDeduction, contentItem, contentMax, grammarDeduction, grammarItem, grammarMax, scores]);
  const scoreTotal = useMemo(() => computeScoreTotal(master, effectiveScores), [effectiveScores, master]);

  const finalizedAt = String(initialRelease?.operatorFinalizedAt ?? "").trim();
  const publishedAt = String(initialRelease?.operatorApprovedAt ?? "").trim();
  const canPublish =
    Boolean(finalizedAt) && hasDay4Pdf && !(day4Error && String(day4Error).trim());
  /** 確定済み・未公開で Day4 未完了またはエラー */
  const needsDay4Retry = Boolean(finalizedAt) && !publishedAt && !canPublish;

  const invokeRunDay4Api = async (idToken: string, day4Force: boolean) => {
    const d4 = await fetch("/api/ops/run-day4", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        taskId,
        submissionId,
        force: day4Force,
        chargeTicket: true,
      }),
    });
    const d4json = (await parseFetchJson(d4)) as {
      ok?: boolean;
      message?: string;
      ticketChargeWarning?: string;
      stdout?: string;
      stderr?: string;
    };
    if (!d4.ok) {
      const d4detail = pickApiErrorMessage(d4json, d4, "Day4 の生成に失敗しました");
      const tail = (s: string, n: number) => {
        const t = (s ?? "").trim();
        if (!t) return "";
        return t.length > n ? ` …${t.slice(-n)}` : ` ${t}`;
      };
      const extra =
        typeof d4json.stdout === "string" && d4json.stdout.trim()
          ? `\n（ログ末尾:${tail(d4json.stdout, 400)}）`
          : typeof d4json.stderr === "string" && d4json.stderr.trim()
            ? `\n（stderr末尾:${tail(d4json.stderr, 400)}）`
            : "";
      setError(
        `${d4detail}${extra}。ターミナルから batch/run_day4_tts_qr_pdf.py を実行することもできます。`.trim(),
      );
      return false;
    }
    if (typeof d4json?.ticketChargeWarning === "string" && d4json.ticketChargeWarning.trim()) {
      setError(String(d4json.ticketChargeWarning));
      return false;
    }
    return true;
  };

  const runDay4Only = async () => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (!user) {
        setError("ログインしてください。");
        return;
      }
      if (!finalizedAt) {
        setError("先に「確定（Day4 生成）」で運用文面を確定してください。");
        return;
      }
      const idToken = await user.getIdToken();
      const ok = await invokeRunDay4Api(idToken, hasDay4Pdf);
      if (!ok) return;
      setMessage("Day4 を再生成しました。画面を再読み込みします。");
      window.location.reload();
    } catch (e) {
      console.error("[StudentReleaseEditor] runDay4Only", e);
      const detail = e instanceof Error ? e.message : String(e);
      setError(`Day4 の再生成に失敗しました: ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const patchRelease = async (opts: {
    operatorApproved?: boolean;
    operatorFinalized?: boolean;
    successMessage: string;
    runDay4After?: boolean;
    day4Force?: boolean;
  }) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (!user) {
        setError("ログインしてください。");
        return;
      }
      const idToken = await user.getIdToken();
      const body: Record<string, unknown> = {
        scores: effectiveScores,
        generalComment: "",
        contentComment,
        grammarComment,
        deductions: {
          content: contentDeduction,
          grammar: grammarDeduction,
        },
        finalText,
      };
      if (opts.operatorApproved === true) body.operatorApproved = true;
      if (opts.operatorApproved === false) body.operatorApproved = false;
      if (opts.operatorFinalized === true) body.operatorFinalized = true;

      const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/student-release`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(body),
      });
      const json = (await parseFetchJson(res)) as {
        ok?: boolean;
        message?: string;
        fields?: Record<string, string>;
      };
      if (!res.ok) {
        const fields = json?.fields as Record<string, string> | undefined;
        const baseMsg = pickApiErrorMessage(json, res, "保存に失敗しました。");
        if (fields && Object.keys(fields).length > 0) {
          setError(`${baseMsg} ${Object.values(fields).join(" ")}`.trim());
        } else {
          setError(baseMsg);
        }
        return;
      }

      if (opts.runDay4After) {
        const d4Ok = await invokeRunDay4Api(idToken, Boolean(opts.day4Force));
        if (!d4Ok) return;
      }

      setMessage(opts.successMessage);
      window.location.reload();
    } catch (e) {
      console.error("[StudentReleaseEditor] patchRelease", e);
      const detail = e instanceof Error ? e.message : String(e);
      setError(`処理に失敗しました: ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  if (status === "failed") {
    const op = String(proofread?.operator_message ?? "").trim();
    const err = String(proofread?.error ?? "").trim();
    const detail = op || err || "unknown";
    const likelyApiKey = /GEMINI|GOOGLE_API|API.?キー|API_KEY|ADC|環境変数|\.env\.local|export/i.test(
      `${op} ${err}`,
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="error" style={{ margin: 0 }}>
          添削に失敗しました: {detail || "unknown"}
        </p>
        {likelyApiKey ? (
          <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
            <strong>提出一覧の「添削」</strong>は Next 起動時の環境のキーを使います。{" "}
            <code>next-writing-batch/.env.local</code> にキーを書き{" "}
            <code>npm run dev</code> を再起動するか、{" "}
            <Link href="/ops/gemini-key">Gemini API キー（運用）</Link>
            から保存してください。
          </p>
        ) : null}
      </div>
    );
  }

  if (status !== "done") {
    return (
      <p className="muted" style={{ marginTop: 0 }}>
        まだ添削処理が完了していません。完了後にここでルーブリック得点・確定文面を編集できます。
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {master.rubric.items.map((it) => (
        <label key={it.id} className="field" style={{ marginBottom: 0 }}>
          <span>
            {it.label}（0〜{it.max}）
          </span>
          <input
            type="number"
            min={0}
            max={it.max}
            step={1}
            value={Number.isFinite(effectiveScores[it.id]) ? effectiveScores[it.id] : 0}
            disabled={busy || it.id === contentItem?.id || it.id === grammarItem?.id}
            onChange={(e) => {
              const n = Number(e.target.value);
              setScores((prev) => ({ ...prev, [it.id]: Number.isFinite(n) ? n : 0 }));
            }}
          />
        </label>
      ))}
      <p style={{ margin: 0, fontWeight: 600 }}>
        合計: {scoreTotal}点
      </p>

      {contentItem && grammarItem ? (
        <>
          <div className="card" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>内容点（満点 {contentMax}点）</h3>
            <label className="field" style={{ marginBottom: 10 }}>
              <span>内容の指摘（箇条書き）</span>
              <textarea
                rows={5}
                value={contentComment ?? ""}
                disabled={busy}
                onChange={(e) => setContentComment(e.target.value)}
                placeholder={"例:\n● 立場が冒頭で明確でない\n● 具体例が1つ不足"}
              />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>内容の合計減点（0〜{contentMax}）</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1 }}>-</span>
                <input
                  type="number"
                  min={0}
                  max={contentMax}
                  step={1}
                  value={contentDeduction}
                  disabled={busy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setContentDeduction(clampInt(Number.isFinite(n) ? n : 0, 0, contentMax));
                  }}
                />
              </div>
            </label>
            <p className="muted" style={{ marginBottom: 0 }}>
              内容点: {contentMax} - {contentDeduction} = {clampInt(contentMax - contentDeduction, 0, contentMax)} 点
            </p>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>文法点（満点 {grammarMax}点）</h3>
            <label className="field" style={{ marginBottom: 10 }}>
              <span>文法の指摘（箇条書き）</span>
              <textarea
                rows={5}
                value={grammarComment ?? ""}
                disabled={busy}
                onChange={(e) => setGrammarComment(e.target.value)}
                placeholder={"例:\n● 時制の不一致がある\n● 語法の誤りがある"}
              />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>文法の合計減点（0〜{grammarMax}）</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1 }}>-</span>
                <input
                  type="number"
                  min={0}
                  max={grammarMax}
                  step={1}
                  value={grammarDeduction}
                  disabled={busy}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setGrammarDeduction(clampInt(Number.isFinite(n) ? n : 0, 0, grammarMax));
                  }}
                />
              </div>
            </label>
            <p className="muted" style={{ marginBottom: 0 }}>
              文法点: {grammarMax} - {grammarDeduction} = {clampInt(grammarMax - grammarDeduction, 0, grammarMax)} 点
            </p>
          </div>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          この課題のルーブリックに「内容」「文法」の項目が見つからないため、減点式は使えません。上の得点欄を直接編集してください。
        </p>
      )}

      <label className="field">
        <span>完成版（英文・確定）</span>
        <textarea
          rows={8}
          value={finalText ?? ""}
          disabled={busy}
          onChange={(e) => setFinalText(e.target.value)}
        />
      </label>

      <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
        流れ: <strong>下書き保存</strong> → <strong>確定</strong>（文面ロック・Day4 生成）→ Day4 が成功したら{" "}
        <strong>生徒に公開する</strong>。
        {!finalizedAt ? " まだ確定していません。" : null}
        {finalizedAt && !canPublish ? " Day4 の PDF が揃うまで公開できません。" : null}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          disabled={busy || !proofread}
          onClick={reimportFromProofread}
          style={{
            padding: "10px 14px",
            fontSize: "0.95rem",
            background: busy ? "#94a3b8" : "#475569",
            color: "#fff",
          }}
          title="保存済みの添削データ（Day3）を修正入力欄へまとめて再読み込みします"
        >
          添削結果を再取り込み
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            patchRelease({
              successMessage: "下書きを保存しました。",
            })
          }
        >
          {busy ? "保存中…" : "下書き保存"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            patchRelease({
              operatorFinalized: true,
              successMessage: "確定しました。Day4 を生成しました。",
              runDay4After: true,
              day4Force: hasDay4Pdf,
            })
          }
          style={{
            padding: "10px 14px",
            fontSize: "0.95rem",
            background: busy ? "#94a3b8" : "#ca8a04",
            color: "#fff",
          }}
        >
          確定（Day4 生成）
        </button>
        {needsDay4Retry ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runDay4Only()}
            style={{
              padding: "10px 14px",
              fontSize: "0.95rem",
              background: busy ? "#94a3b8" : "#0d9488",
              color: "#fff",
            }}
            title="運用確定の日時は変えずに Day4 バッチだけ再実行します（タイムアウト・GCS 失敗後の再試行向け）"
          >
            {busy ? "実行中…" : "Day4 だけ再生成"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || !canPublish}
          onClick={() =>
            patchRelease({
              operatorApproved: true,
              successMessage: "生徒向けに公開しました。",
            })
          }
          style={{
            padding: "10px 14px",
            fontSize: "0.95rem",
            background: busy || !canPublish ? "#94a3b8" : "#16a34a",
            color: "#fff",
          }}
        >
          生徒に公開する
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            patchRelease({
              operatorApproved: false,
              successMessage: "公開を取り下げました。",
            })
          }
          style={{
            padding: "10px 14px",
            fontSize: "0.95rem",
            background: busy ? "#94a3b8" : "#dc2626",
            color: "#fff",
          }}
        >
          公開を取り下げ
        </button>
        <a href={`/result/${encodeURIComponent(submissionId)}`} target="_blank" rel="noreferrer">
          生徒向けプレビュー（新しいタブ）
        </a>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

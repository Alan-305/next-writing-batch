"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

const DAY4_TICKET_NOTICE_KEY = "nwb_day4_ticket_notice";

function buildDay4TicketNotice(
  charged: Array<{ submissionId: string; remainingAfter: number }> | undefined,
): string | null {
  if (!charged?.length) return null;
  const count = charged.length;
  const remaining = charged[charged.length - 1]?.remainingAfter;
  if (typeof remaining !== "number" || !Number.isFinite(remaining)) return null;
  return `チケットを${count}枚消費しました。残りは${remaining}枚です。`;
}

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
  /** 確定・公開後に親でデータ再取得（フルリロードの代わり） */
  onReloadComplete?: (scrollToId?: string) => void;
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
  onReloadComplete,
}: Props) {
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

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(DAY4_TICKET_NOTICE_KEY);
      if (!stored?.trim()) return;
      sessionStorage.removeItem(DAY4_TICKET_NOTICE_KEY);
      setMessage(stored.trim());
    } catch {
      /* sessionStorage 不可 */
    }
  }, []);

  const persistDay4TicketNotice = (notice: string | null) => {
    if (!notice) return;
    try {
      sessionStorage.setItem(DAY4_TICKET_NOTICE_KEY, notice);
    } catch {
      /* sessionStorage 不可 */
    }
  };

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
    setMessage("最新の添削結果を修正入力へ再取り込みしました。");
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

  const buildPatchBody = (): Record<string, unknown> => ({
    scores: effectiveScores,
    generalComment: "",
    contentComment,
    grammarComment,
    deductions: {
      content: contentDeduction,
      grammar: grammarDeduction,
    },
    finalText,
  });

  const submitPatch = async (
    idToken: string,
    patch: Record<string, unknown>,
  ): Promise<{ ok: true } | { ok: false }> => {
    const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/student-release`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(patch),
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
      return { ok: false };
    }
    return { ok: true };
  };

  const invokeRunDay4Api = async (
    idToken: string,
    day4Force: boolean,
  ): Promise<{ ok: true; ticketNotice: string | null } | { ok: false }> => {
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
      day4TicketsCharged?: Array<{ submissionId: string; remainingAfter: number }>;
      stdout?: string;
      stderr?: string;
    };
    if (!d4.ok) {
      const d4detail = pickApiErrorMessage(d4json, d4, "PDF・音声の生成に失敗しました");
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
      return { ok: false };
    }
    if (typeof d4json?.ticketChargeWarning === "string" && d4json.ticketChargeWarning.trim()) {
      setError(String(d4json.ticketChargeWarning));
      return { ok: false };
    }
    return { ok: true, ticketNotice: buildDay4TicketNotice(d4json.day4TicketsCharged) };
  };

  const completeReload = (scrollToId?: string) => {
    if (onReloadComplete) {
      onReloadComplete(scrollToId);
      return;
    }
    if (scrollToId) {
      window.location.hash = scrollToId;
    }
    window.location.reload();
  };

  const confirmAndPublish = async () => {
    setBusy(true);
    setMessage("確定＆公開を実行しています…");
    setError("");
    try {
      if (!user) {
        setError("ログインしてください。");
        return;
      }
      const idToken = await user.getIdToken();
      const finalizeOk = await submitPatch(idToken, {
        ...buildPatchBody(),
        operatorFinalized: true,
      });
      if (!finalizeOk.ok) return;

      const d4Result = await invokeRunDay4Api(idToken, hasDay4Pdf);
      if (!d4Result.ok) return;

      const publishOk = await submitPatch(idToken, {
        ...buildPatchBody(),
        operatorApproved: true,
      });
      if (!publishOk.ok) return;

      const combined = d4Result.ticketNotice
        ? `確定して生徒に公開しました。 ${d4Result.ticketNotice}`
        : "確定して生徒に公開しました。";
      persistDay4TicketNotice(combined);
      completeReload("student-release-actions");
    } catch (e) {
      console.error("[StudentReleaseEditor] confirmAndPublish", e);
      const detail = e instanceof Error ? e.message : String(e);
      setError(`確定＆公開に失敗しました: ${detail}`);
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
      const body: Record<string, unknown> = buildPatchBody();
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
        const d4Result = await invokeRunDay4Api(idToken, Boolean(opts.day4Force));
        if (!d4Result.ok) return;
        const combined = d4Result.ticketNotice
          ? `${opts.successMessage} ${d4Result.ticketNotice}`
          : opts.successMessage;
        persistDay4TicketNotice(combined);
      } else {
        setMessage(opts.successMessage);
      }

      const scrollToId =
        opts.runDay4After || opts.operatorFinalized ? "student-release-actions" : undefined;
      completeReload(scrollToId);
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
        <strong>確定＆公開</strong>で文面を確定し、PDF・音声を生成して生徒に公開します。問題があれば{" "}
        <strong>公開取り下げ</strong>を押してください。
        {publishedAt ? " 現在、生徒に公開中です。" : null}
        {!publishedAt && finalizedAt ? " 確定済みですが未公開です。" : null}
      </p>

      {finalizedAt && !publishedAt && day4Error ? (
        <p className="error" style={{ margin: 0 }}>
          PDF・音声の生成でエラーが発生しています。「確定＆公開」を再度お試しください。
        </p>
      ) : null}

      <div
        id="student-release-actions"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
      >
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
          title="保存済みの添削結果を修正入力欄へまとめて再読み込みします"
        >
          添削結果を再取り込み
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirmAndPublish()}
          style={{
            padding: "10px 14px",
            fontSize: "0.95rem",
            background: busy ? "#94a3b8" : "#16a34a",
            color: "#fff",
          }}
        >
          {busy ? "処理中…" : "確定＆公開"}
        </button>
        <a
          href={`/result/${encodeURIComponent(submissionId)}`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 14px",
            fontSize: "0.95rem",
            background: "#fff",
            color: "#0f172a",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            textDecoration: "none",
            minHeight: 44,
          }}
        >
          生徒画面確認
        </a>
        <button
          type="button"
          disabled={busy || !publishedAt}
          onClick={() =>
            patchRelease({
              operatorApproved: false,
              successMessage: "公開を取り下げました。",
            })
          }
          style={{
            padding: "10px 14px",
            fontSize: "0.95rem",
            background: busy || !publishedAt ? "#94a3b8" : "#dc2626",
            color: "#fff",
          }}
        >
          公開取り下げ
        </button>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

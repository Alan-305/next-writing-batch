"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  formatExplanationForPublicView,
  seedStudentReleaseFromProofread,
  splitExplanationToSections,
  type StudentRelease,
} from "@/lib/student-release";
import { buildRubricScoresForEditor } from "@/lib/build-rubric-scores-for-editor";
import { computeScoreTotal, type TaskProblemsMaster } from "@/lib/task-problems-core";

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
};

function coalesceText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
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
  const [generalComment, setGeneralComment] = useState(() => coalesceText(seeded?.generalComment));
  const [contentComment, setContentComment] = useState(() =>
    coalesceText(seeded?.contentComment ?? aiSplitComments.contentComment ?? proofread?.content_comment),
  );
  const [grammarComment, setGrammarComment] = useState(() =>
    coalesceText(seeded?.grammarComment ?? aiSplitComments.grammarComment ?? proofread?.grammar_comment),
  );
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
  const [finalText, setFinalText] = useState(() => coalesceText(seeded?.finalText));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reimportFromProofread = () => {
    const mergedContent = coalesceText(
      proofread?.content_comment ?? aiSplitComments.contentComment ?? "",
    );
    const mergedGrammar = coalesceText(
      proofread?.grammar_comment ?? aiSplitComments.grammarComment ?? "",
    );
    const nextGeneral = coalesceText(proofread?.general_comment ?? "");
    const nextFinalText = coalesceText(
      proofread?.final_version ?? proofread?.final_essay ?? "",
    );

    const aiDedContent = Number(proofread?.content_deduction);
    const aiDedGrammar = Number(proofread?.grammar_deduction);

    setContentComment(mergedContent);
    setGrammarComment(mergedGrammar);
    if (nextGeneral) setGeneralComment(nextGeneral);
    if (nextFinalText) setFinalText(nextFinalText);
    if (Number.isFinite(aiDedContent)) {
      setContentDeduction(clampInt(aiDedContent, 0, contentMax));
    }
    if (Number.isFinite(aiDedGrammar)) {
      setGrammarDeduction(clampInt(aiDedGrammar, 0, grammarMax));
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
  const canPublish =
    Boolean(finalizedAt) && hasDay4Pdf && !(day4Error && String(day4Error).trim());

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
      const body: Record<string, unknown> = {
        scores: effectiveScores,
        generalComment,
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const fields = json?.fields as Record<string, string> | undefined;
        setError(json?.message ?? "保存に失敗しました。");
        if (fields && Object.keys(fields).length > 0) {
          setError(`${json?.message ?? ""} ${Object.values(fields).join(" ")}`.trim());
        }
        return;
      }

      if (opts.runDay4After) {
        const d4 = await fetch("/api/ops/run-day4", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId,
            submissionId,
            force: Boolean(opts.day4Force),
          }),
        });
        const d4json = await d4.json();
        if (!d4.ok) {
          setError(
            `運用は確定しましたが、Day4 の生成に失敗しました: ${d4json?.message ?? d4.statusText}。` +
              ` ターミナルから batch/run_day4_tts_qr_pdf.py を実行することもできます。`,
          );
          router.refresh();
          return;
        }
      }

      setMessage(opts.successMessage);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  if (status !== "done") {
    return (
      <p className="muted" style={{ marginTop: 0 }}>
        Day3 添削が完了すると、ここでルーブリック得点・確定文面を編集できます。
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

      <label className="field">
        <span>全体コメント</span>
        <textarea
          rows={4}
          value={generalComment ?? ""}
          disabled={busy}
          onChange={(e) => setGeneralComment(e.target.value)}
        />
      </label>

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
          disabled={busy}
          onClick={reimportFromProofread}
          style={{
            padding: "10px 14px",
            fontSize: "0.95rem",
            background: busy ? "#94a3b8" : "#475569",
            color: "#fff",
          }}
          title="添削結果の内容解説を内容の指摘へ、文法解説を文法の指摘へ再取り込みします"
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

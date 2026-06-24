/** 提出一覧・ダッシュボードで使う統一ラベル（内部 status コードは英語のまま） */

export type SubmissionStatusCode =
  | "pending"
  | "queued"
  | "processing"
  | "done"
  | "failed"
  | "viewed"
  | "withdrawn";

export type SubmissionStatusMeta = {
  code: SubmissionStatusCode;
  label: string;
  hint: string;
  badgeClass: string;
  /** スピナー付き進行中表示 */
  running?: boolean;
};

const BASE: Record<SubmissionStatusCode, Omit<SubmissionStatusMeta, "code">> = {
  pending: {
    label: "未添削",
    hint: "添削を開始できます",
    badgeClass: "ops-badge ops-badge--pending",
  },
  queued: {
    label: "待機中",
    hint: "キューで順番待ちです",
    badgeClass: "ops-badge ops-badge--queued",
    running: true,
  },
  processing: {
    label: "添削中",
    hint: "AI が添削しています",
    badgeClass: "ops-badge ops-badge--processing",
    running: true,
  },
  done: {
    label: "完了",
    hint: "添削が完了しました",
    badgeClass: "ops-badge ops-badge--done",
  },
  failed: {
    label: "要再実行",
    hint: "添削に失敗しました。やり直してください",
    badgeClass: "ops-badge ops-badge--failed",
  },
  viewed: {
    label: "閲覧済",
    hint: "生徒が結果を閲覧しました",
    badgeClass: "ops-badge ops-badge--viewed",
  },
  withdrawn: {
    label: "取下",
    hint: "公開を取り下げました。確認＆修正から再編集できます",
    badgeClass: "ops-badge ops-badge--withdrawn",
  },
};

function proofreadFinishedAfterWithdraw(
  operatorWithdrawnAt?: string,
  proofreadFinishedAt?: string,
): boolean {
  const withdrawnAt = (operatorWithdrawnAt ?? "").trim();
  const finishedAt = (proofreadFinishedAt ?? "").trim();
  if (!withdrawnAt || !finishedAt) return false;
  const w = Date.parse(withdrawnAt);
  const f = Date.parse(finishedAt);
  if (!Number.isFinite(w) || !Number.isFinite(f)) return false;
  return f > w;
}

export function submissionStatusMeta(
  status: string,
  opts?: {
    studentViewed?: boolean;
    releaseWithdrawn?: boolean;
    operatorWithdrawnAt?: string;
    proofreadFinishedAt?: string;
  },
): SubmissionStatusMeta {
  const isActiveWorkflow = status === "queued" || status === "processing";

  if (isActiveWorkflow) {
    const code = status as "queued" | "processing";
    const base = BASE[code];
    if (opts?.releaseWithdrawn) {
      if (status === "queued") {
        return {
          code: "queued",
          label: "再添削待機中",
          hint: "再添削キューで順番待ちです",
          badgeClass: base.badgeClass,
          running: true,
        };
      }
      return {
        code: "processing",
        label: "再添削中",
        hint: "AI が再添削しています",
        badgeClass: base.badgeClass,
        running: true,
      };
    }
    return { code, ...base };
  }

  if (opts?.releaseWithdrawn && status === "done") {
    const redoDone = proofreadFinishedAfterWithdraw(
      opts.operatorWithdrawnAt,
      opts.proofreadFinishedAt,
    );
    if (!redoDone) {
      return { code: "withdrawn", ...BASE.withdrawn };
    }
  }

  if (status === "done" && opts?.studentViewed) {
    return { code: "viewed", ...BASE.viewed };
  }
  const code = status as SubmissionStatusCode;
  if (code in BASE) {
    return { code, ...BASE[code] };
  }
  return {
    code: "pending",
    label: status || "—",
    hint: "",
    badgeClass: "ops-badge",
  };
}

export const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "すべて" },
  { value: "pending", label: "未添削" },
  { value: "queued", label: "待機中" },
  { value: "processing", label: "添削中" },
  { value: "done", label: "完了" },
  { value: "failed", label: "要再実行" },
];

/** 操作ボタン・メッセージの統一コピー */
export const OPS_COPY = {
  pageTitle: "提出一覧",
  pageLead: "生徒の提出を確認し、添削・返却まで進めます。",
  refresh: "更新",
  refreshing: "更新中…",
  searchPlaceholder: "課題ID・学籍・氏名・受付ID",
  detailLink: "確認＆修正",
  proofreadStart: "添削開始",
  proofreadStartBusy: "預け中…",
  proofreadNow: "今すぐ",
  proofreadQueue: "預ける",
  proofreadNowBusy: "添削中…",
  proofreadQueueBusy: "預け中…",
  proofreadRetryNow: "今すぐ再実行",
  redoProofread: "再添削",
  redoProofreadBusy: "再添削中…",
  redoWaitingInQueue: "再添削待機中",
  redo: "やり直し",
  redoQueue: "預けてやり直し",
  cancel: "中止",
  cancelBusy: "中止中…",
  waitingInQueue: "待機中",
  bulkTitle: "一括添削",
  bulkLead: `課題単位でまとめて添削できます（1回最大5件）。日常運用は「預ける」がおすすめです。`,
  bulkNow: "今すぐ（同期）",
  bulkQueue: "預ける",
  bulkNowBusy: "添削中…",
  bulkQueueBusy: "預け中…",
  deliverablesZip: "納品ZIP",
} as const;

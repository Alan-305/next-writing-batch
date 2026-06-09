"use client";

type Props = {
  submissionId: string;
  /** 確定済み・未公開で Day4 PDF がある */
  readyToPublish: boolean;
  /** Day4 PDF がある（完成品セクションへ誘導） */
  hasDay4Pdf: boolean;
};

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function OpsSubmissionNextSteps({ submissionId, readyToPublish, hasDay4Pdf }: Props) {
  if (!readyToPublish) return null;

  const previewHref = `/result/${encodeURIComponent(submissionId)}`;

  return (
    <div
      className="card ops-submission-next-steps"
      role="region"
      aria-label="次の操作"
      style={{
        marginBottom: 16,
        borderColor: "#86efac",
        background: "linear-gradient(180deg, #f0fdf4 0%, #fff 100%)",
      }}
    >
      <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: "1.05rem" }}>Day4 完了 — 次の操作</p>
      <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.55 }}>
        公開やプレビューはページ下部にもあります。ここからすぐ移動できます。
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => scrollToSection("student-release-actions")}
          style={{
            padding: "10px 16px",
            fontSize: "0.95rem",
            background: "#16a34a",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            minHeight: 44,
          }}
        >
          生徒に公開する
        </button>
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 16px",
            fontSize: "0.95rem",
            background: "#fff",
            color: "#0f172a",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            textDecoration: "none",
            minHeight: 44,
          }}
        >
          生徒向けプレビュー
        </a>
        {hasDay4Pdf ? (
          <button
            type="button"
            onClick={() => scrollToSection("day4-deliverables")}
            style={{
              padding: "10px 16px",
              fontSize: "0.95rem",
              background: "#0f766e",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              minHeight: 44,
            }}
          >
            完成品を見る（Day4）
          </button>
        ) : null}
      </div>
    </div>
  );
}

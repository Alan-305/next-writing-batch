/**
 * 生徒向け「完成版」英文の表示用。
 * 公開データの finalText を優先し、未設定や原文と同一なら Day3 proofread の完成版へフォールバックする。
 */

const NEXUS_SECTION_JSON_MARK = "<<NEXUS_SECTION_JSON>>";

/** AI が完成版末尾に連結した機械読取ブロックを除去（既存データの表示用にも使用）。 */
export function stripNexusSectionJsonFromEssayText(s: string): string {
  const i = s.indexOf(NEXUS_SECTION_JSON_MARK);
  if (i === -1) return s;
  return s.slice(0, i).trimEnd();
}

/** 文頭の `---`（Markdown 区切り線風）を繰り返し除去。 */
export function stripLeadingRuleDashesFromEssayText(s: string): string {
  let t = s.replace(/^\uFEFF/, "").replace(/^[\s\u3000]+/u, "");
  while (/^-{3,}\s*/u.test(t)) {
    t = t.replace(/^-{3,}\s*/u, "").replace(/^[\s\u3000]+/u, "");
  }
  return t;
}

/** 完成版表示用: 文頭 `---` と末尾 NEXUS JSON マーカーを除去。 */
export function sanitizeFinalEssayArtifactText(s: string): string {
  return stripNexusSectionJsonFromEssayText(stripLeadingRuleDashesFromEssayText(s.trim()));
}

function normalizeForCompare(s: string): string {
  return (s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
}

type ProofreadFinal = {
  final_essay?: string;
  final_version?: string;
};

export function resolveFinalEssayForStudentDisplay(args: {
  essayText: string | undefined;
  studentReleaseFinalText: string | undefined;
  proofread?: ProofreadFinal | null;
}): { original: string; revised: string } {
  const original = args.essayText ?? "";
  const origN = normalizeForCompare(original);
  const fromRelease = (args.studentReleaseFinalText ?? "").trim();
  const relN = normalizeForCompare(fromRelease);
  const pr = args.proofread;
  const fromProofread = sanitizeFinalEssayArtifactText(
    String(pr?.final_essay ?? pr?.final_version ?? "").trim(),
  );

  if (fromRelease && relN !== origN) {
    return { original, revised: sanitizeFinalEssayArtifactText(fromRelease) };
  }
  if (fromProofread) {
    return { original, revised: fromProofread };
  }
  if (fromRelease) {
    return { original, revised: sanitizeFinalEssayArtifactText(fromRelease) };
  }
  return { original, revised: "" };
}

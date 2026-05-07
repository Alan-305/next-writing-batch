import type { CSSProperties } from "react";

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

function safeHex(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return HEX6.test(s) ? s : fallback;
}

export type StudentBranding = {
  /** ヘッダー左のプロダクト名（既定: 添削革命） */
  productTitle: string;
  /** バッジ文言（既定: 生徒用） */
  badgeLabel: string;
  /** ヘッダーに表示する学校名など（空なら非表示） */
  schoolDisplayName: string;
  /** 見出し・ブランド文字・ボタン終端色の基調 */
  primaryColor: string;
  /** ボタン開始色・装飾のアクセント */
  accentColor: string;
  /** 背景グラデの上側の色 */
  surfaceTintStart: string;
  /** 背景グラデの下側の色 */
  surfaceTintEnd: string;
};

export const DEFAULT_STUDENT_BRANDING: StudentBranding = {
  productTitle: "添削革命",
  badgeLabel: "生徒用",
  schoolDisplayName: "",
  primaryColor: "#0369a1",
  accentColor: "#0ea5e9",
  surfaceTintStart: "#f0f9ff",
  surfaceTintEnd: "#fffbeb",
};

export function mergeStudentBranding(raw: unknown): StudentBranding {
  const d = DEFAULT_STUDENT_BRANDING;
  if (!raw || typeof raw !== "object") return { ...d };
  const o = raw as Record<string, unknown>;
  const productTitle =
    typeof o.productTitle === "string" && o.productTitle.trim() ? o.productTitle.trim() : d.productTitle;
  const badgeLabel = typeof o.badgeLabel === "string" && o.badgeLabel.trim() ? o.badgeLabel.trim() : d.badgeLabel;
  const schoolDisplayName =
    typeof o.schoolDisplayName === "string" ? o.schoolDisplayName.trim() : d.schoolDisplayName;
  return {
    productTitle,
    badgeLabel,
    schoolDisplayName,
    primaryColor: safeHex(o.primaryColor, d.primaryColor),
    accentColor: safeHex(o.accentColor, d.accentColor),
    surfaceTintStart: safeHex(o.surfaceTintStart, d.surfaceTintStart),
    surfaceTintEnd: safeHex(o.surfaceTintEnd, d.surfaceTintEnd),
  };
}

/** 生徒シェル直下に付与する CSS 変数（壁紙・トーン用） */
export function studentBrandingStyle(b: StudentBranding): CSSProperties {
  return {
    ["--student-primary" as string]: b.primaryColor,
    ["--student-accent" as string]: b.accentColor,
    ["--student-surface-start" as string]: b.surfaceTintStart,
    ["--student-surface-end" as string]: b.surfaceTintEnd,
  };
}

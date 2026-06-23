import type { CSSProperties } from "react";

import { resolveActivePresetId } from "@/lib/student-branding-presets";
import { studentBrandingStyle, type StudentBranding } from "@/lib/student-branding";

export type StudentBrandingShellProps = {
  style: CSSProperties;
  "data-style-preset": string;
};

/** 生徒・教員シェル root に付与するスタイルとプリセット ID */
export function studentBrandingShellProps(branding: StudentBranding): StudentBrandingShellProps {
  return {
    style: studentBrandingStyle(branding),
    "data-style-preset": resolveActivePresetId(branding),
  };
}

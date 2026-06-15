import type { StudentBranding } from "@/lib/student-branding";

export type StudentBrandingPreset = {
  id: string;
  name: string;
  description: string;
  category: "standard" | "classic" | "playful" | "seasonal" | "exam";
  colors: Pick<StudentBranding, "primaryColor" | "accentColor" | "surfaceTintStart" | "surfaceTintEnd">;
};

/**
 * ボタンは accent → primary のグラデ＋白文字のため、両色とも十分な彩度・明度差を確保している。
 */
export const STUDENT_BRANDING_PRESETS: StudentBrandingPreset[] = [
  {
    id: "standard",
    name: "標準（添削革命）",
    description: "落ち着いた青。読みやすさ最優先のデフォルト。",
    category: "standard",
    colors: {
      primaryColor: "#0369a1",
      accentColor: "#0ea5e9",
      surfaceTintStart: "#f0f9ff",
      surfaceTintEnd: "#fffbeb",
    },
  },
  {
    id: "cockpit",
    name: "コックピット",
    description: "計器盤のような紺とシアン。集中した運用向け。",
    category: "classic",
    colors: {
      primaryColor: "#0c4a6e",
      accentColor: "#0891b2",
      surfaceTintStart: "#e0f2fe",
      surfaceTintEnd: "#f1f5f9",
    },
  },
  {
    id: "showa",
    name: "昭和",
    description: "セピアと茶。懐かしく落ち着いた教室の雰囲気。",
    category: "classic",
    colors: {
      primaryColor: "#78350f",
      accentColor: "#b45309",
      surfaceTintStart: "#fffbeb",
      surfaceTintEnd: "#fef3c7",
    },
  },
  {
    id: "american",
    name: "アメリカン",
    description: "ネイビーとレッド。はっきりしたコントラスト。",
    category: "classic",
    colors: {
      primaryColor: "#1e3a8a",
      accentColor: "#dc2626",
      surfaceTintStart: "#eff6ff",
      surfaceTintEnd: "#fef2f2",
    },
  },
  {
    id: "rococo",
    name: "ロココ",
    description: "ローズとゴールド。華やかで上品なトーン。",
    category: "playful",
    colors: {
      primaryColor: "#9d174d",
      accentColor: "#c2410c",
      surfaceTintStart: "#fdf2f8",
      surfaceTintEnd: "#fff7ed",
    },
  },
  {
    id: "library",
    name: "図書館",
    description: "深い緑と紺。真面目な学習空間向け。",
    category: "classic",
    colors: {
      primaryColor: "#14532d",
      accentColor: "#166534",
      surfaceTintStart: "#f0fdf4",
      surfaceTintEnd: "#ecfdf5",
    },
  },
  {
    id: "chalkboard",
    name: "教室の黒板",
    description: "黒板緑とチョーク白の背景。学校らしさ重視。",
    category: "classic",
    colors: {
      primaryColor: "#14532d",
      accentColor: "#15803d",
      surfaceTintStart: "#ecfdf5",
      surfaceTintEnd: "#f8fafc",
    },
  },
  {
    id: "exam-pass",
    name: "合格への一歩",
    description: "深緑とゴールド。受験生を前向きに励ます配色。",
    category: "exam",
    colors: {
      primaryColor: "#166534",
      accentColor: "#ca8a04",
      surfaceTintStart: "#f0fdf4",
      surfaceTintEnd: "#fffbeb",
    },
  },
  {
    id: "exam-focus",
    name: "集中突破",
    description: "インディゴとバイオレット。夜の勉強にも目に優しい。",
    category: "exam",
    colors: {
      primaryColor: "#3730a3",
      accentColor: "#6d28d9",
      surfaceTintStart: "#eef2ff",
      surfaceTintEnd: "#f5f3ff",
    },
  },
  {
    id: "spring-sakura",
    name: "春桜",
    description: "桜色と若葉。新年度・新学期の季節感。",
    category: "seasonal",
    colors: {
      primaryColor: "#9d174d",
      accentColor: "#db2777",
      surfaceTintStart: "#fdf2f8",
      surfaceTintEnd: "#f0fdf4",
    },
  },
  {
    id: "early-summer",
    name: "初夏",
    description: "新緑と空色。さわやかな五月雨明けのトーン。",
    category: "seasonal",
    colors: {
      primaryColor: "#047857",
      accentColor: "#0284c7",
      surfaceTintStart: "#ecfdf5",
      surfaceTintEnd: "#f0f9ff",
    },
  },
  {
    id: "midsummer",
    name: "真夏",
    description: "海の青とサンセットオレンジ。少し遊び心のある夏。",
    category: "seasonal",
    colors: {
      primaryColor: "#0369a1",
      accentColor: "#ea580c",
      surfaceTintStart: "#e0f2fe",
      surfaceTintEnd: "#fff7ed",
    },
  },
  {
    id: "autumn-moon",
    name: "秋日月",
    description: "紅葉と夕暮れ。読書の秋に合う温かみ。",
    category: "seasonal",
    colors: {
      primaryColor: "#9a3412",
      accentColor: "#c2410c",
      surfaceTintStart: "#fff7ed",
      surfaceTintEnd: "#fef3c7",
    },
  },
  {
    id: "winter-snow",
    name: "冬雪",
    description: "冬空の青と銀。静かでクリアな年末年始向け。",
    category: "seasonal",
    colors: {
      primaryColor: "#1e40af",
      accentColor: "#475569",
      surfaceTintStart: "#f8fafc",
      surfaceTintEnd: "#e2e8f0",
    },
  },
  {
    id: "sports",
    name: "スポーツ",
    description: "ネイビーとオレンジ。元気な部活・運動会シーズン。",
    category: "playful",
    colors: {
      primaryColor: "#1e3a8a",
      accentColor: "#ea580c",
      surfaceTintStart: "#eff6ff",
      surfaceTintEnd: "#fff7ed",
    },
  },
  {
    id: "space",
    name: "宇宙",
    description: "深宇宙の紫と星のシアン。ちょっと冒険的な学習。",
    category: "playful",
    colors: {
      primaryColor: "#4c1d95",
      accentColor: "#7c3aed",
      surfaceTintStart: "#ede9fe",
      surfaceTintEnd: "#f5f3ff",
    },
  },
  {
    id: "matcha",
    name: "抹茶",
    description: "和の落ち着き。長時間の学習でも目が疲れにくい緑。",
    category: "classic",
    colors: {
      primaryColor: "#3f6212",
      accentColor: "#65a30d",
      surfaceTintStart: "#f7fee7",
      surfaceTintEnd: "#fefce8",
    },
  },
  {
    id: "custom",
    name: "カスタム",
    description: "色を自分で細かく調整する（上級者向け）。",
    category: "standard",
    colors: {
      primaryColor: "#0369a1",
      accentColor: "#0ea5e9",
      surfaceTintStart: "#f0f9ff",
      surfaceTintEnd: "#fffbeb",
    },
  },
];

export const STUDENT_BRANDING_PRESET_BY_ID = new Map(
  STUDENT_BRANDING_PRESETS.map((p) => [p.id, p] as const),
);

export const STUDENT_BRANDING_PRESET_CATEGORIES: Array<{
  id: StudentBrandingPreset["category"];
  label: string;
}> = [
  { id: "standard", label: "標準" },
  { id: "classic", label: "クラシック" },
  { id: "exam", label: "受験・励まし" },
  { id: "seasonal", label: "季節" },
  { id: "playful", label: "遊び心" },
];

export function resolveActivePresetId(branding: StudentBranding): string {
  const id = (branding.stylePresetId ?? "").trim();
  if (id && STUDENT_BRANDING_PRESET_BY_ID.has(id)) return id;
  const matched = STUDENT_BRANDING_PRESETS.find(
    (p) =>
      p.id !== "custom" &&
      p.colors.primaryColor === branding.primaryColor &&
      p.colors.accentColor === branding.accentColor &&
      p.colors.surfaceTintStart === branding.surfaceTintStart &&
      p.colors.surfaceTintEnd === branding.surfaceTintEnd,
  );
  return matched?.id ?? "custom";
}

export function applyStudentBrandingPreset(
  branding: StudentBranding,
  presetId: string,
): StudentBranding {
  const preset = STUDENT_BRANDING_PRESET_BY_ID.get(presetId);
  if (!preset) return branding;
  if (presetId === "custom") {
    return { ...branding, stylePresetId: "custom" };
  }
  return {
    ...branding,
    stylePresetId: presetId,
    ...preset.colors,
  };
}

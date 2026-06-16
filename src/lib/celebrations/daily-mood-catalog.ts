export type DailyMoodThemeId =
  | "sakura"
  | "snow"
  | "sunshine"
  | "autumn"
  | "spring"
  | "summer"
  | "stars"
  | "sparkle";

export type DailyMoodTheme = {
  id: DailyMoodThemeId;
  label: string;
  particleEmoji: string;
  particleCount: number;
};

const THEMES: DailyMoodTheme[] = [
  { id: "sakura", label: "春桜", particleEmoji: "🌸", particleCount: 28 },
  { id: "snow", label: "冬雪", particleEmoji: "❄️", particleCount: 32 },
  { id: "sunshine", label: "晴れ", particleEmoji: "✨", particleCount: 26 },
  { id: "autumn", label: "秋", particleEmoji: "🍂", particleCount: 26 },
  { id: "spring", label: "新緑", particleEmoji: "🌿", particleCount: 26 },
  { id: "summer", label: "夏", particleEmoji: "🌊", particleCount: 24 },
  { id: "stars", label: "星", particleEmoji: "⭐", particleCount: 24 },
  { id: "sparkle", label: "きらめき", particleEmoji: "💫", particleCount: 28 },
];

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** 季節を優先しつつ、日付でローテーションするテーマ */
export function resolveDailyMoodTheme(now = new Date()): DailyMoodTheme {
  const month = now.getMonth() + 1;
  const doy = dayOfYear(now);
  const seasonalPool: DailyMoodThemeId[] = [];

  if (month >= 3 && month <= 4) seasonalPool.push("sakura", "spring", "sparkle");
  else if (month >= 5 && month <= 6) seasonalPool.push("spring", "summer", "sunshine");
  else if (month >= 7 && month <= 8) seasonalPool.push("summer", "sunshine", "sparkle");
  else if (month >= 9 && month <= 11) seasonalPool.push("autumn", "sunshine", "stars");
  else seasonalPool.push("snow", "stars", "sunshine");

  const pickId = seasonalPool[doy % seasonalPool.length] ?? "sparkle";
  return THEMES.find((t) => t.id === pickId) ?? THEMES[0];
}

export function todayDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

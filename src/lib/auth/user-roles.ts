/** 認可・プロフィール判定用のロールヘルパー（API / クライアント共通） */

export function normalizeRoles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === "string").map((r) => r.trim());
}

export function isTeacherByRoles(roles: string[]): boolean {
  const lower = roles.map((r) => r.toLowerCase());
  return lower.includes("teacher") || lower.includes("admin");
}

/** 生徒向けプロフィール（学籍・ニックネーム）が必要なユーザーか */
export function needsStudentSubjectProfile(roles: string[]): boolean {
  if (isTeacherByRoles(roles)) return false;
  return roles.some((r) => r.toLowerCase() === "student");
}

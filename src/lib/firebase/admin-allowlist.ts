/**
 * 管理者（松尾さん）の Auth uid をカンマ区切りで保持。
 * クライアントの /admin ガード用（NEXT_PUBLIC_*）。値は .env.local のみに書き、リポジトリに含めない。
 */
export function parseAdminUidAllowlist(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_ADMIN_UIDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isAllowlistedAdminUid(uid: string | undefined | null): boolean {
  if (!uid) return false;
  return parseAdminUidAllowlist().has(uid);
}

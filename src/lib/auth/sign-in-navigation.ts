/** ログイン画面の戻り先・既定 next（一般利用者向け。運用ハブ /hub は使わない） */

export function signInPublicHomePath(hostname?: string): string {
  const host = (hostname ?? "").toLowerCase();
  if (host.startsWith("tensaku-kakumei-for-students.")) {
    return "/submit";
  }
  if (host.startsWith("tensaku-kakumei-for-teachers.")) {
    return "/register/teacher?next=%2Fops";
  }
  return "/tensaku-kakumei";
}

export function resolveSignInNextPath(nextRaw: string, hostname?: string): string {
  const trimmed = (nextRaw ?? "").trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && trimmed !== "/hub") {
    return trimmed;
  }
  return signInPublicHomePath(hostname);
}

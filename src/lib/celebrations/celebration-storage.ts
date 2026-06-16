const DAILY_PREFIX = "nwb-celebration-daily";

export function dailyCelebrationStorageKey(audience: "teacher" | "student", identity: string): string {
  const id = (identity ?? "").trim() || "guest";
  return `${audience}:${id}`;
}

export function hasShownDailyCelebrationToday(storageKey: string, dateKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(`${DAILY_PREFIX}:${storageKey}`) === dateKey;
  } catch {
    return true;
  }
}

export function markDailyCelebrationShown(storageKey: string, dateKey: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${DAILY_PREFIX}:${storageKey}`, dateKey);
  } catch {
    /* ignore quota */
  }
}

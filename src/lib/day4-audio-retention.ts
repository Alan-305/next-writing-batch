import type { Submission } from "@/lib/submissions-store";

const DEFAULT_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 365;

/** 環境変数 `DAY4_AUDIO_RETENTION_DAYS`（省略時 30 日）。 */
export function day4AudioRetentionDays(): number {
  const raw = (process.env.DAY4_AUDIO_RETENTION_DAYS ?? "").trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_RETENTION_DAYS;
  return Math.min(n, MAX_RETENTION_DAYS);
}

function parseIsoMs(iso: string | undefined): number | null {
  const s = (iso ?? "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** Day4 音声の公開期限（ISO）。未設定の旧データは generatedAt + 保持日数。 */
export function day4AudioExpiresAtIso(submission: Submission): string | null {
  const d4 = submission.day4;
  if (!d4) return null;

  const explicit = parseIsoMs(d4.audio_expires_at);
  if (explicit != null) return new Date(explicit).toISOString();

  const generatedMs = parseIsoMs(d4.generatedAt);
  if (generatedMs == null) return null;

  const days = day4AudioRetentionDays();
  return new Date(generatedMs + days * 86400_000).toISOString();
}

export function isDay4AudioPlaybackAllowed(submission: Submission): boolean {
  const expiresIso = day4AudioExpiresAtIso(submission);
  if (!expiresIso) return false;
  return Date.now() < Date.parse(expiresIso);
}

export function day4AudioExpiredMessage(): string {
  const days = day4AudioRetentionDays();
  return `音声の公開期限（${days}日間）が過ぎました。`;
}

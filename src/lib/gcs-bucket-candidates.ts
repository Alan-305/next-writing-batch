/**
 * Day4 GCS バケット候補（batch/day4_gcs.py の _bucket_candidates_from_env 相当）。
 * GCS_BUCKET_NAME（Day4 専用バケット）を最優先し、Firebase Storage もフォールバックで試す。
 */
export function gcsBucketCandidates(): string[] {
  const out: string[] = [];

  const explicit = (process.env.GCS_BUCKET_NAME ?? "").trim();
  if (explicit) out.push(explicit);

  for (const key of ["FIREBASE_STORAGE_BUCKET", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"] as const) {
    const val = (process.env[key] ?? "").trim();
    if (!val) continue;
    out.push(val);
    if (val.endsWith(".firebasestorage.app")) {
      out.push(`${val.slice(0, -".firebasestorage.app".length)}.appspot.com`);
    }
    if (val.endsWith(".appspot.com")) {
      out.push(`${val.slice(0, -".appspot.com".length)}.firebasestorage.app`);
    }
  }

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const b of out) {
    if (seen.has(b)) continue;
    seen.add(b);
    uniq.push(b);
  }
  return uniq;
}

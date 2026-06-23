import { hrefForAudioUrl } from "@/lib/audio-url-href";
import { day4AudioMp3Filename } from "@/lib/day4-audio-basename";
import {
  parseDay4AudioPathSegments,
  parseGcsPublicAudioUrl,
} from "@/lib/day4-audio-gcs-objects";
import type { Submission } from "@/lib/submissions-store";

/** Cloud Run 等、実際に `/api/day4-audio` が動く公開オリジン（サーバー・クライアント両方）。 */
export function nwbPublicAppOrigin(): string {
  return (
    process.env.NWB_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_NWB_PUBLIC_APP_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");
}

const BROKEN_AUDIO_HOST_PREFIXES = [
  "tensaku-kakumei-for-students.",
  "tensaku-kakumei-for-teachers.",
] as const;

function isBrokenAudioHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return BROKEN_AUDIO_HOST_PREFIXES.some((p) => h.startsWith(p));
}

function pickServingOrigin(requestOrigin?: string): string {
  const pub = nwbPublicAppOrigin();
  if (pub) return pub;
  const req = (requestOrigin ?? "").trim().replace(/\/$/, "");
  if (!req) return "";
  try {
    const u = new URL(req);
    if (!isBrokenAudioHost(u.hostname)) return req;
  } catch {
    /* ignore */
  }
  return "";
}

function toApiDay4AudioUrl(origin: string, taskId: string, filename: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/day4-audio/${taskId}/${filename}`;
}

function buildApiDay4Url(taskId: string, filename: string, requestOrigin?: string): string {
  const origin = pickServingOrigin(requestOrigin);
  if (origin) return toApiDay4AudioUrl(origin, taskId, filename);
  return `/api/day4-audio/${taskId}/${filename}`;
}

/**
 * 提出メタから安定した `/api/day4-audio/...` を組み立てる（audio_path 優先）。
 * 期限切れ GCS 署名 URL や `/output/audio/...` より信頼できる。
 */
export function resolveDay4AudioPlayUrlFromSubmission(
  submission: Pick<Submission, "taskId" | "submissionId" | "studentId" | "submittedByUid" | "day4">,
  requestOrigin?: string,
): string {
  const taskId = String(submission.taskId ?? "").trim();
  if (!taskId) return "";

  const audioPath = String(submission.day4?.audio_path ?? "").trim();
  const fromPath = audioPath ? parseDay4AudioPathSegments(audioPath) : null;
  if (fromPath?.taskId && fromPath.filename) {
    return buildApiDay4Url(fromPath.taskId, fromPath.filename, requestOrigin);
  }

  const audioUrl = String(submission.day4?.audio_url ?? "").trim();
  const fromGcs = audioUrl ? parseGcsPublicAudioUrl(audioUrl) : null;
  if (fromGcs?.taskId && fromGcs.filename) {
    return buildApiDay4Url(fromGcs.taskId, fromGcs.filename, requestOrigin);
  }

  const apiInUrl = audioUrl.match(/\/api\/day4-audio\/([^/]+)\/([^/?]+\.mp3)/i);
  if (apiInUrl) {
    return buildApiDay4Url(apiInUrl[1]!, apiInUrl[2]!, requestOrigin);
  }

  const fn = day4AudioMp3Filename(submission);
  return buildApiDay4Url(taskId, fn, requestOrigin);
}

/**
 * Firestore の `day4.audio_url` をブラウザ再生・QR 用に正規化する。
 * 期限切れ GCS 署名 URL / `/output/audio/...` / 壊れたドメインを `/api/day4-audio/...` に寄せる。
 */
export function resolveDay4AudioPlayUrl(audioUrl: string, requestOrigin?: string): string {
  const raw = audioUrl.trim();
  if (!raw) return "";

  const gcs = parseGcsPublicAudioUrl(raw);
  if (gcs) {
    return buildApiDay4Url(gcs.taskId, gcs.filename, requestOrigin);
  }

  const outputRel = raw.match(/^\/?output\/audio\/([^/]+)\/([^/]+\.mp3)$/i);
  if (outputRel) {
    return buildApiDay4Url(outputRel[1]!, outputRel[2]!, requestOrigin);
  }

  const apiInPath = raw.match(/\/api\/day4-audio\/([^/]+)\/([^/]+\.mp3)/i);
  if (apiInPath) {
    const [, taskId, filename] = apiInPath;
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        const u = new URL(raw);
        if (isBrokenAudioHost(u.hostname)) {
          return buildApiDay4Url(taskId!, filename!, requestOrigin);
        }
        return raw;
      } catch {
        return raw;
      }
    }
    return buildApiDay4Url(taskId!, filename!, requestOrigin);
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      if (isBrokenAudioHost(u.hostname)) {
        const fromOutput = u.pathname.match(/\/output\/audio\/([^/]+)\/([^/]+\.mp3)$/i);
        if (fromOutput) {
          return buildApiDay4Url(fromOutput[1]!, fromOutput[2]!, requestOrigin);
        }
        const fromApi = u.pathname.match(/\/api\/day4-audio\/([^/]+)\/([^/]+\.mp3)$/i);
        if (fromApi) {
          return buildApiDay4Url(fromApi[1]!, fromApi[2]!, requestOrigin);
        }
      }
    } catch {
      /* ignore */
    }
    return hrefForAudioUrl(raw);
  }

  return hrefForAudioUrl(raw);
}

/** 提出から再生 URL を解決（audio_path / 安定 API を優先）。 */
export function resolveDay4AudioPlayUrlForSubmission(
  submission: Pick<Submission, "taskId" | "submissionId" | "studentId" | "submittedByUid" | "day4">,
  requestOrigin?: string,
): string {
  const fromMeta = resolveDay4AudioPlayUrlFromSubmission(submission, requestOrigin);
  if (fromMeta) return fromMeta;
  const audioUrl = String(submission.day4?.audio_url ?? "").trim();
  return audioUrl ? resolveDay4AudioPlayUrl(audioUrl, requestOrigin) : "";
}

/** QR に埋める絶対 URL。 */
export function resolveDay4AudioQrUrl(audioUrl: string, requestOrigin?: string): string {
  const play = resolveDay4AudioPlayUrl(audioUrl, requestOrigin);
  if (!play) return "";
  if (play.startsWith("http://") || play.startsWith("https://")) return play;
  const origin = pickServingOrigin(requestOrigin);
  if (!origin) return "";
  const path = play.startsWith("/") ? play : `/${play.replace(/^\/+/, "")}`;
  return `${origin}${path}`;
}

export function resolveDay4AudioQrUrlForSubmission(
  submission: Pick<Submission, "taskId" | "submissionId" | "studentId" | "submittedByUid" | "day4">,
  requestOrigin?: string,
): string {
  const play = resolveDay4AudioPlayUrlForSubmission(submission, requestOrigin);
  if (!play) return "";
  if (play.startsWith("http://") || play.startsWith("https://")) return play;
  const origin = pickServingOrigin(requestOrigin);
  if (!origin) return "";
  const path = play.startsWith("/") ? play : `/${play.replace(/^\/+/, "")}`;
  return `${origin}${path}`;
}

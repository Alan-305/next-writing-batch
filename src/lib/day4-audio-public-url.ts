import { hrefForAudioUrl } from "@/lib/audio-url-href";

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
 * Firestore の `day4.audio_url` をブラウザ再生・QR 用に正規化する。
 * 壊れた独自ドメインや `/output/audio/...` を動作する `/api/day4-audio/...` に寄せる。
 */
export function resolveDay4AudioPlayUrl(audioUrl: string, requestOrigin?: string): string {
  const raw = audioUrl.trim();
  if (!raw) return "";

  if (raw.includes("storage.googleapis.com")) {
    return hrefForAudioUrl(raw);
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

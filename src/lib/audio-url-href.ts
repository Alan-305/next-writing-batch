/** 提出データの `audio_url` をブラウザの `href` / QR 用に正規化する（サーバー・クライアント共通）。 */
export function hrefForAudioUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/")) return u;
  return `/${u.replace(/^\/+/, "")}`;
}

/** QR に埋める音声 URL。既に絶対 URL ならそのまま。相対なら requestOrigin を付与。 */
export function absoluteUrlForAudioQr(audioSrc: string, requestOrigin: string): string {
  const u = audioSrc.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const origin = requestOrigin.replace(/\/$/, "").trim();
  if (!origin) return "";
  const path = u.startsWith("/") ? u : `/${u.replace(/^\/+/, "")}`;
  return `${origin}${path}`;
}

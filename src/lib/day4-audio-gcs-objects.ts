import { day4AudioBasename, day4AudioMp3Filename } from "@/lib/day4-audio-basename";
import type { Submission } from "@/lib/submissions-store";

function addObject(out: string[], raw: string | null | undefined): void {
  const obj = String(raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!obj || obj.includes("..") || out.includes(obj)) return;
  out.push(obj);
}

function audioGcsObjectFromRel(audioRel: string): string | null {
  const rel = audioRel.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel) return null;
  if (rel.startsWith("output/audio/")) return rel.slice("output/".length);
  if (rel.startsWith("audio/")) return rel;
  return null;
}

export function parseDay4AudioPathSegments(
  audioPath: string,
): { taskId: string; filename: string } | null {
  const rel = audioPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const m = rel.match(/^(?:output\/)?audio\/([^/]+)\/([^/]+\.mp3)$/i);
  if (!m) return null;
  return { taskId: m[1]!, filename: m[2]! };
}

/** storage.googleapis.com/BUCKET/audio/TASK/FILE.mp3 から task / file を抽出 */
export function parseGcsPublicAudioUrl(
  rawUrl: string,
): { taskId: string; filename: string; gcsObject: string } | null {
  const raw = rawUrl.trim();
  if (!raw.includes("storage.googleapis.com")) return null;
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    const audioIdx = parts.indexOf("audio");
    if (audioIdx >= 0 && parts.length >= audioIdx + 3) {
      const taskId = parts[audioIdx + 1]!;
      const filename = parts[audioIdx + 2]!;
      if (!filename.toLowerCase().endsWith(".mp3")) return null;
      return { taskId, filename, gcsObject: `audio/${taskId}/${filename}` };
    }
  } catch {
    return null;
  }
  return null;
}

/** GCS 上の mp3 オブジェクト名候補（URL・audio_path・提出メタから） */
export function day4AudioGcsObjectCandidates(
  taskId: string,
  mp3Filename: string,
  submission?: Submission | null,
): string[] {
  const out: string[] = [];
  const tid = taskId.trim();
  const fn = mp3Filename.trim();
  if (tid && fn) addObject(out, `audio/${tid}/${fn}`);

  if (submission) {
    const d4 = submission.day4;
    if (d4 && typeof d4 === "object") {
      addObject(out, audioGcsObjectFromRel(String(d4.audio_path ?? "")));
      const fromUrl = parseGcsPublicAudioUrl(String(d4.audio_url ?? ""));
      if (fromUrl) addObject(out, fromUrl.gcsObject);

      const apiInUrl = String(d4.audio_url ?? "").match(/\/api\/day4-audio\/([^/]+)\/([^/?]+\.mp3)/i);
      if (apiInUrl) addObject(out, `audio/${apiInUrl[1]}/${apiInUrl[2]}`);

      const fromPath = parseDay4AudioPathSegments(String(d4.audio_path ?? ""));
      if (fromPath) addObject(out, `audio/${fromPath.taskId}/${fromPath.filename}`);
    }

    if (tid) {
      addObject(out, `audio/${tid}/${day4AudioMp3Filename(submission)}`);
      const altBasename = day4AudioBasename(submission);
      if (fn !== `${altBasename}.mp3`) {
        addObject(out, `audio/${tid}/${altBasename}.mp3`);
      }
    }
  }

  return out;
}

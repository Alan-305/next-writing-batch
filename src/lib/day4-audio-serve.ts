import { getStorage } from "firebase-admin/storage";
import { NextResponse } from "next/server";

import {
  day4AudioExpiredMessage,
  isDay4AudioPlaybackAllowed,
} from "@/lib/day4-audio-retention";
import { getFirebaseAdminApp } from "@/lib/firebase/admin-app";
import { findSubmissionAcrossOrganizations } from "@/lib/submissions-store";
import { getOutputFileResponse } from "@/lib/serve-output-file";

function segmentOk(seg: string): boolean {
  if (!seg || seg.length > 500) return false;
  if (seg.includes("..") || seg.includes("/") || seg.includes("\\")) return false;
  return true;
}

/**
 * Day4 音声 mp3 を配信する（ローカル output → 無ければ GCS_BUCKET_NAME）。
 * QR / 生徒向け結果で使う安定 URL 用（署名付き URL は使わない）。
 */
export async function getDay4AudioResponse(taskId: string, filename: string): Promise<NextResponse> {
  try {
    return await getDay4AudioResponseInner(taskId, filename);
  } catch (e) {
    console.error("[day4-audio] unhandled error", { taskId, filename, e });
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}

async function getDay4AudioResponseInner(taskId: string, filename: string): Promise<NextResponse> {
  const tid = taskId.trim();
  const fn = filename.trim();
  if (!segmentOk(tid) || !segmentOk(fn) || !fn.toLowerCase().endsWith(".mp3")) {
    return NextResponse.json({ message: "Bad request" }, { status: 400 });
  }

  const submissionId = fn.replace(/\.mp3$/i, "");
  // 再生は「致命的に止めない」が最優先（QR の配布体験が重要）。
  // 期限判定に必要な Firestore 取得が失敗する/まだ未反映の場合でも、
  // ファイルが存在すればそのまま配信する（UI 側の Server Error を防ぐ）。
  let shouldCheckRetentionForHit: boolean | null = null;
  let hitSubmission: Parameters<typeof isDay4AudioPlaybackAllowed>[0] | null = null;
  try {
    const hit = await findSubmissionAcrossOrganizations(submissionId);
    if (hit && (hit.submission.taskId ?? "").trim() === tid) {
      shouldCheckRetentionForHit = true;
      hitSubmission = hit.submission;
    } else {
      shouldCheckRetentionForHit = false;
    }
  } catch (e) {
    console.error("[day4-audio] findSubmissionAcrossOrganizations failed", { submissionId, tid, e });
    shouldCheckRetentionForHit = false;
  }

  const local = await getOutputFileResponse(["audio", tid, fn]);
  if (local.status === 200) {
    if (shouldCheckRetentionForHit && hitSubmission && !isDay4AudioPlaybackAllowed(hitSubmission)) {
      return new NextResponse(day4AudioExpiredMessage(), {
        status: 410,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return local;
  }

  const bucketName = (process.env.GCS_BUCKET_NAME ?? "").trim();
  if (!bucketName) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    const bucket = getStorage(getFirebaseAdminApp()).bucket(bucketName);
    const objectName = `audio/${tid}/${fn}`;
    const file = bucket.file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    if (shouldCheckRetentionForHit && hitSubmission && !isDay4AudioPlaybackAllowed(hitSubmission)) {
      return new NextResponse(day4AudioExpiredMessage(), {
        status: 410,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    const [buf] = await file.download();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("[day4-audio] GCS download failed", { taskId: tid, filename: fn, e });
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
}

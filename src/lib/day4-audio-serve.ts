import { NextResponse } from "next/server";

import {
  day4AudioExpiredMessage,
  isDay4AudioPlaybackAllowed,
} from "@/lib/day4-audio-retention";
import { fetchDay4AudioFromGcs } from "@/lib/day4-audio-gcs-fetch";
import { findSubmissionForDay4Audio } from "@/lib/day4-audio-submission-lookup";
import { getOutputFileResponse } from "@/lib/serve-output-file";

function segmentOk(seg: string): boolean {
  if (!seg || seg.length > 500) return false;
  if (seg.includes("..") || seg.includes("/") || seg.includes("\\")) return false;
  return true;
}

const AUDIO_HEADERS: Record<string, string> = {
  "Content-Type": "audio/mpeg",
  "Cache-Control": "public, max-age=86400",
};

/**
 * Day4 音声 mp3 を配信する（ローカル output → GCS 複数候補）。
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

  let hitSubmission: Awaited<ReturnType<typeof findSubmissionForDay4Audio>> = null;
  try {
    hitSubmission = await findSubmissionForDay4Audio(tid, fn);
  } catch (e) {
    console.error("[day4-audio] findSubmissionForDay4Audio failed", { taskId: tid, filename: fn, e });
  }

  const local = await getOutputFileResponse(["audio", tid, fn]);
  if (local.status === 200) {
    if (hitSubmission && !isDay4AudioPlaybackAllowed(hitSubmission.submission)) {
      return new NextResponse(day4AudioExpiredMessage(), {
        status: 410,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return local;
  }

  const gcsHit = await fetchDay4AudioFromGcs({
    taskId: tid,
    mp3Filename: fn,
    submission: hitSubmission?.submission ?? null,
  });

  if (gcsHit) {
    if (hitSubmission && !isDay4AudioPlaybackAllowed(hitSubmission.submission)) {
      return new NextResponse(day4AudioExpiredMessage(), {
        status: 410,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new NextResponse(new Uint8Array(gcsHit.buffer), {
      status: 200,
      headers: AUDIO_HEADERS,
    });
  }

  console.error("[day4-audio] not found", {
    taskId: tid,
    filename: fn,
    submissionId: hitSubmission?.submission.submissionId,
  });
  return NextResponse.json({ message: "Not found" }, { status: 404 });
}

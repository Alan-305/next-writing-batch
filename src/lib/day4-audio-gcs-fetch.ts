import { getStorage } from "firebase-admin/storage";

import { day4AudioGcsObjectCandidates } from "@/lib/day4-audio-gcs-objects";
import { getFirebaseAdminApp } from "@/lib/firebase/admin-app";
import { gcsBucketCandidates } from "@/lib/gcs-bucket-candidates";
import type { Submission } from "@/lib/submissions-store";

export type FetchedGcsAudio = {
  buffer: Buffer;
  bucketName: string;
  gcsObject: string;
};

export async function fetchDay4AudioFromGcs(args: {
  taskId: string;
  mp3Filename: string;
  submission?: Submission | null;
}): Promise<FetchedGcsAudio | null> {
  const objects = day4AudioGcsObjectCandidates(args.taskId, args.mp3Filename, args.submission);
  const buckets = gcsBucketCandidates();
  if (objects.length === 0 || buckets.length === 0) return null;

  const storage = getStorage(getFirebaseAdminApp());
  let lastError: unknown = null;

  for (const bucketName of buckets) {
    const bucket = storage.bucket(bucketName);
    for (const gcsObject of objects) {
      try {
        const file = bucket.file(gcsObject);
        const [exists] = await file.exists();
        if (!exists) continue;
        const [buf] = await file.download();
        if (!buf?.length) continue;
        return { buffer: buf, bucketName, gcsObject };
      } catch (e) {
        lastError = e;
        console.warn("[day4-audio-gcs-fetch] miss", { bucketName, gcsObject, e });
      }
    }
  }

  if (lastError) {
    console.error("[day4-audio-gcs-fetch] all candidates failed", {
      taskId: args.taskId,
      mp3Filename: args.mp3Filename,
      submissionId: args.submission?.submissionId,
      buckets,
      objects,
      lastError,
    });
  }
  return null;
}

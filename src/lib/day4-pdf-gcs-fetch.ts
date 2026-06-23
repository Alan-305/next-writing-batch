import { getStorage } from "firebase-admin/storage";

import { pdfGcsObjectCandidates } from "@/lib/day4-pdf-filename";
import { getFirebaseAdminApp } from "@/lib/firebase/admin-app";
import { gcsBucketCandidates } from "@/lib/gcs-bucket-candidates";
import type { Submission } from "@/lib/submissions-store";

export type FetchedGcsPdf = {
  buffer: Buffer;
  bucketName: string;
  gcsObject: string;
};

/**
 * 提出の PDF を GCS から取得する。バケット×オブジェクト候補を順に試す。
 */
export async function fetchSubmissionPdfFromGcs(submission: Submission): Promise<FetchedGcsPdf | null> {
  const objects = pdfGcsObjectCandidates(submission);
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
        console.warn("[day4-pdf-gcs-fetch] miss", { bucketName, gcsObject, e });
      }
    }
  }

  if (lastError) {
    console.error("[day4-pdf-gcs-fetch] all candidates failed", {
      submissionId: submission.submissionId,
      buckets,
      objects,
      lastError,
    });
  }
  return null;
}

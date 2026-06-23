import { createHash } from "node:crypto";

import type { DocumentSnapshot } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import { normalizeRedeemLookupToken } from "@/lib/anonymous-redeem";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

export type SupportMessageRole = "student" | "teacher";

export type StudentSupportMessage = {
  id: string;
  role: SupportMessageRole;
  content: string;
  createdAt: string;
  taskId?: string;
};

export type StudentSupportThreadSummary = {
  threadId: string;
  displayNick: string;
  redeemId: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string;
  lastMessageRole: SupportMessageRole;
  /** 教師が一度でも返信したか（生徒の再問い合わせ後も true のまま） */
  hasTeacherReply: boolean;
  /** 直近のメッセージが生徒から（教師の返信待ち） */
  needsReply: boolean;
};

function threadsRef(organizationId: string) {
  return getAdminFirestore().collection("organizations").doc(organizationId).collection("studentSupportThreads");
}

export function studentSupportThreadId(displayNick: string, redeemId: string): string {
  const nick = normalizeRedeemLookupToken(displayNick);
  const redeem = normalizeRedeemLookupToken(redeemId);
  return createHash("sha256").update(`${nick}::${redeem}`, "utf8").digest("hex").slice(0, 32);
}

function isoNow(): string {
  return new Date().toISOString();
}

function mapThreadDoc(doc: DocumentSnapshot): StudentSupportThreadSummary {
  const data = doc.data() ?? {};
  const lastMessageRole: SupportMessageRole = data.lastMessageRole === "teacher" ? "teacher" : "student";
  const storedHasTeacherReply = data.hasTeacherReply;
  const hasTeacherReply =
    storedHasTeacherReply === true ? true : storedHasTeacherReply === false ? false : lastMessageRole === "teacher";
  return {
    threadId: doc.id,
    displayNick: String(data.displayNick ?? ""),
    redeemId: String(data.redeemId ?? ""),
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
    lastMessagePreview: String(data.lastMessagePreview ?? ""),
    lastMessageRole,
    hasTeacherReply,
    needsReply: lastMessageRole === "student",
  };
}

async function resolveHasTeacherReply(organizationId: string, threadId: string): Promise<boolean> {
  const snap = await threadsRef(organizationId)
    .doc(threadId)
    .collection("messages")
    .where("role", "==", "teacher")
    .limit(1)
    .get();
  return !snap.empty;
}

async function enrichThreadSummary(
  organizationId: string,
  summary: StudentSupportThreadSummary,
): Promise<StudentSupportThreadSummary> {
  const ref = threadsRef(organizationId).doc(summary.threadId);
  const snap = await ref.get();
  if (!snap.exists) return summary;

  const stored = snap.get("hasTeacherReply");
  if (stored === true) {
    return { ...summary, hasTeacherReply: true };
  }
  if (stored === false) {
    return { ...summary, hasTeacherReply: false };
  }

  const hasTeacherReply = await resolveHasTeacherReply(organizationId, summary.threadId);
  void ref.update({ hasTeacherReply }).catch(() => {
    /* 一覧表示を遅らせない */
  });
  return { ...summary, hasTeacherReply };
}

export async function getStudentSupportThreadById(
  organizationId: string,
  threadId: string,
): Promise<StudentSupportThreadSummary | null> {
  const snap = await threadsRef(organizationId).doc(threadId.trim()).get();
  if (!snap.exists) return null;
  const base = mapThreadDoc(snap);
  return enrichThreadSummary(organizationId, base);
}

export async function listStudentSupportMessages(
  organizationId: string,
  displayNick: string,
  redeemId: string,
): Promise<StudentSupportMessage[]> {
  const threadId = studentSupportThreadId(displayNick, redeemId);
  const snap = await threadsRef(organizationId)
    .doc(threadId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      role: data.role === "teacher" ? "teacher" : "student",
      content: String(data.content ?? ""),
      createdAt: String(data.createdAt ?? ""),
      ...(data.taskId ? { taskId: String(data.taskId) } : {}),
    };
  });
}

export async function appendStudentSupportMessage(args: {
  organizationId: string;
  displayNick: string;
  redeemId: string;
  role: SupportMessageRole;
  content: string;
  taskId?: string;
}): Promise<{ threadId: string; messageId: string }> {
  const org = args.organizationId.trim();
  const displayNick = normalizeRedeemLookupToken(args.displayNick);
  const redeemId = normalizeRedeemLookupToken(args.redeemId);
  const content = args.content.trim();
  const threadId = studentSupportThreadId(displayNick, redeemId);
  const now = isoNow();
  const threadRef = threadsRef(org).doc(threadId);
  const messageRef = threadRef.collection("messages").doc();

  await getAdminFirestore().runTransaction(async (tx) => {
    const threadSnap = await tx.get(threadRef);
    if (!threadSnap.exists) {
      tx.set(threadRef, {
        displayNick,
        redeemId,
        createdAt: now,
        updatedAt: now,
        lastMessagePreview: content.slice(0, 120),
        lastMessageRole: args.role,
        hasTeacherReply: args.role === "teacher",
      });
    } else {
      tx.update(threadRef, {
        updatedAt: now,
        lastMessagePreview: content.slice(0, 120),
        lastMessageRole: args.role,
        ...(args.role === "teacher" ? { hasTeacherReply: true } : {}),
      });
    }

    tx.set(messageRef, {
      role: args.role,
      content,
      createdAt: now,
      ...(args.taskId?.trim() ? { taskId: args.taskId.trim() } : {}),
      ...(args.role === "teacher" ? { teacherRepliedAt: FieldValue.serverTimestamp() } : {}),
    });
  });

  return { threadId, messageId: messageRef.id };
}

export async function listStudentSupportThreadsForOrg(organizationId: string): Promise<StudentSupportThreadSummary[]> {
  const snap = await threadsRef(organizationId).orderBy("updatedAt", "desc").limit(200).get();
  const base = snap.docs.map((doc) => mapThreadDoc(doc));
  const needsResolve = base.filter((t) => {
    const raw = snap.docs.find((d) => d.id === t.threadId)?.get("hasTeacherReply");
    return raw !== true && raw !== false;
  });
  if (needsResolve.length === 0) return base;

  const resolved = await Promise.all(needsResolve.map((t) => enrichThreadSummary(organizationId, t)));
  const byId = new Map(resolved.map((t) => [t.threadId, t]));
  return base.map((t) => byId.get(t.threadId) ?? t);
}

/** 教員が不要と判断したスレッドを削除（メッセージ一式を含む）。 */
export async function deleteStudentSupportThread(organizationId: string, threadId: string): Promise<boolean> {
  const id = threadId.trim();
  if (!id) return false;

  const ref = threadsRef(organizationId).doc(id);
  const threadSnap = await ref.get();
  if (!threadSnap.exists) return false;

  const messagesSnap = await ref.collection("messages").get();
  const db = getAdminFirestore();
  const chunkSize = 400;
  for (let i = 0; i < messagesSnap.docs.length; i += chunkSize) {
    const batch = db.batch();
    for (const doc of messagesSnap.docs.slice(i, i + chunkSize)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  await ref.delete();
  return true;
}

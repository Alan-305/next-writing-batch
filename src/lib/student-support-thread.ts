import { createHash } from "node:crypto";

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
      });
    } else {
      tx.update(threadRef, {
        updatedAt: now,
        lastMessagePreview: content.slice(0, 120),
        lastMessageRole: args.role,
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
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      threadId: doc.id,
      displayNick: String(data.displayNick ?? ""),
      redeemId: String(data.redeemId ?? ""),
      createdAt: String(data.createdAt ?? ""),
      updatedAt: String(data.updatedAt ?? ""),
      lastMessagePreview: String(data.lastMessagePreview ?? ""),
      lastMessageRole: data.lastMessageRole === "teacher" ? "teacher" : "student",
    };
  });
}

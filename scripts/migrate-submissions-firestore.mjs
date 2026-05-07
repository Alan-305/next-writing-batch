#!/usr/bin/env node
import admin from "firebase-admin";

function parseArgs(argv) {
  const out = {
    fromOrg: "default",
    toOrg: "",
    studentId: "",
    submittedByUid: "",
    submissionIds: "",
    apply: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") {
      out.apply = true;
      continue;
    }
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1] ?? "";
    i += 1;
    if (key === "from-org") out.fromOrg = val.trim();
    else if (key === "to-org") out.toOrg = val.trim();
    else if (key === "student-id") out.studentId = val.trim();
    else if (key === "submitted-by-uid") out.submittedByUid = val.trim();
    else if (key === "submission-ids") out.submissionIds = val.trim();
  }
  return out;
}

function buildFilter(args) {
  const ids = new Set(
    String(args.submissionIds || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
  const sid = (args.studentId || "").trim();
  const suid = (args.submittedByUid || "").trim();
  if (!args.toOrg) throw new Error("--to-org is required");
  if (!sid && !suid && ids.size === 0) {
    throw new Error("Specify one filter: --student-id or --submitted-by-uid or --submission-ids");
  }
  return { ids, sid, suid };
}

function matches(row, filter) {
  const submissionId = String(row.submissionId || "").trim();
  if (filter.ids.size > 0) return filter.ids.has(submissionId);
  if (filter.sid && String(row.studentId || "").trim() === filter.sid) return true;
  if (filter.suid && String(row.submittedByUid || "").trim() === filter.suid) return true;
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  const filter = buildFilter(args);

  if (!admin.apps.length) {
    if ((process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim()) {
      const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    } else {
      admin.initializeApp();
    }
  }
  const db = admin.firestore();
  const srcCol = db.collection("organizations").doc(args.fromOrg).collection("submissions");
  const dstCol = db.collection("organizations").doc(args.toOrg).collection("submissions");

  const srcSnap = await srcCol.get();
  const moveDocs = [];
  for (const doc of srcSnap.docs) {
    const row = doc.data() || {};
    if (!matches(row, filter)) continue;
    moveDocs.push({ id: doc.id, row });
  }

  console.log(
    `[migrate-submissions] from=${args.fromOrg} to=${args.toOrg} source_total=${srcSnap.size} matched=${moveDocs.length}`,
  );
  if (moveDocs.length === 0) {
    console.log("[migrate-submissions] no matched submissions.");
    return;
  }
  console.log(
    "[migrate-submissions] matched submissionIds:",
    moveDocs.slice(0, 20).map((x) => x.id).join(","),
  );

  if (!args.apply) {
    console.log("[migrate-submissions] dry-run only. add --apply to execute.");
    return;
  }

  let moved = 0;
  for (const { id, row } of moveDocs) {
    const next = { ...row, organizationId: args.toOrg };
    await dstCol.doc(id).set(next, { merge: true });
    await srcCol.doc(id).delete();
    moved += 1;
  }
  console.log(`[migrate-submissions] applied moved=${moved}`);
}

main().catch((e) => {
  console.error("[migrate-submissions] failed:", e?.message || e);
  process.exit(1);
});

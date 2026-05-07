#!/usr/bin/env node
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

function parseArgs(argv) {
  const out = {
    project: "nexus0101-35b17",
    org: "default",
    out: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = (argv[i + 1] ?? "").trim();
    i += 1;
    if (key === "project") out.project = val || out.project;
    else if (key === "org") out.org = val || out.org;
    else if (key === "out") out.out = val;
  }
  return out;
}

function csvCell(v) {
  const s = String(v ?? "");
  if (!/[",\n\r]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function valOf(fields, key) {
  const f = fields?.[key];
  if (!f) return "";
  if (typeof f.stringValue === "string") return f.stringValue;
  if (typeof f.integerValue === "string") return f.integerValue;
  if (typeof f.doubleValue === "number") return String(f.doubleValue);
  if (typeof f.booleanValue === "boolean") return String(f.booleanValue);
  if (typeof f.nullValue === "string") return "";
  if (f.timestampValue) return f.timestampValue;
  return JSON.stringify(f);
}

async function getJson(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${txt}`);
  }
  return txt ? JSON.parse(txt) : {};
}

async function listDocs(project, org, token) {
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  let url = `${base}/organizations/${encodeURIComponent(org)}/submissions?pageSize=200`;
  const docs = [];
  while (url) {
    const j = await getJson(url, token);
    docs.push(...(j.documents ?? []));
    const next = j.nextPageToken;
    url = next
      ? `${base}/organizations/${encodeURIComponent(org)}/submissions?pageSize=200&pageToken=${encodeURIComponent(next)}`
      : "";
  }
  return docs;
}

async function main() {
  const args = parseArgs(process.argv);
  const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
  if (!token) throw new Error("gcloud のアクセストークンを取得できませんでした。");

  const docs = await listDocs(args.project, args.org, token);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath =
    args.out ||
    path.join(process.cwd(), "output", "backups", `submissions_${args.org}_${timestamp}.csv`);

  const cols = [
    "organizationId",
    "submissionId",
    "submittedAt",
    "status",
    "taskId",
    "studentId",
    "studentName",
    "submittedByUid",
    "problemId",
    "day4GeneratedAt",
    "day4Error",
  ];
  const lines = [cols.join(",")];
  for (const d of docs) {
    const f = d.fields ?? {};
    const day4Fields = f.day4?.mapValue?.fields ?? {};
    const row = {
      organizationId: valOf(f, "organizationId"),
      submissionId: valOf(f, "submissionId") || d.name?.split("/").pop() || "",
      submittedAt: valOf(f, "submittedAt"),
      status: valOf(f, "status"),
      taskId: valOf(f, "taskId"),
      studentId: valOf(f, "studentId"),
      studentName: valOf(f, "studentName"),
      submittedByUid: valOf(f, "submittedByUid"),
      problemId: valOf(f, "problemId"),
      day4GeneratedAt: valOf(day4Fields, "generatedAt"),
      day4Error: valOf(day4Fields, "error"),
    };
    lines.push(cols.map((c) => csvCell(row[c])).join(","));
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`[export-submissions-csv] org=${args.org} rows=${docs.length}`);
  console.log(`[export-submissions-csv] wrote ${outPath}`);
}

main().catch((e) => {
  console.error("[export-submissions-csv] failed:", e?.message ?? e);
  process.exit(1);
});

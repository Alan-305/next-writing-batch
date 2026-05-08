import { promises as fs } from "fs";
import path from "path";

import { defaultOrganizationId, sanitizeOrganizationIdForPath } from "@/lib/organization-id";

function orgDataBaseDir(): string {
  const fromEnv = (process.env.NWB_DATA_ROOT ?? "").trim();
  if (!fromEnv) return path.join(process.cwd(), "data", "orgs");
  return path.join(fromEnv, "orgs");
}

/** 1 テナントのデータルート: `data/orgs/{orgId}/` */
export function organizationDataRoot(organizationId: string): string {
  const safe = sanitizeOrganizationIdForPath(organizationId) || defaultOrganizationId();
  return path.join(orgDataBaseDir(), safe);
}

export function organizationSubmissionsFilePath(organizationId: string): string {
  return path.join(organizationDataRoot(organizationId), "submissions.json");
}

export function organizationTaskProblemsDir(organizationId: string): string {
  return path.join(organizationDataRoot(organizationId), "task-problems");
}

export function organizationTeacherSetupDir(organizationId: string): string {
  return path.join(organizationDataRoot(organizationId), "teacher-proofreading-setup");
}

export function organizationTaskRubricDefaultsPath(organizationId: string): string {
  return path.join(organizationDataRoot(organizationId), "task-rubric-default-scores.json");
}

const LEGACY_SUBMISSIONS = path.join(process.cwd(), "data", "submissions.json");
const LEGACY_TASK_PROBLEMS = path.join(process.cwd(), "data", "task-problems");
const LEGACY_TEACHER_SETUP = path.join(process.cwd(), "data", "teacher-proofreading-setup");
const LEGACY_RUBRIC = path.join(process.cwd(), "data", "task-rubric-default-scores.json");

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  let entries: string[] = [];
  try {
    entries = await fs.readdir(src);
  } catch {
    return;
  }
  for (const name of entries) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = await fs.stat(from);
    if (st.isDirectory()) {
      await copyDirRecursive(from, to);
    } else if (st.isFile()) {
      await fs.copyFile(from, to);
    }
  }
}

let migrationDone = false;

/**
 * 初回のみ: ルート直下の `data/submissions.json` 等を `data/orgs/{default}/` に複製する。
 * テナント側に `submissions.json` が既にある場合はコピーをスキップする。
 */
export async function migrateLegacyOrgLayoutOnce(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  const def = defaultOrganizationId();
  const root = organizationDataRoot(def);
  const destSubs = organizationSubmissionsFilePath(def);

  if (await pathExists(destSubs)) {
    await fs.mkdir(organizationTaskProblemsDir(def), { recursive: true });
    await fs.mkdir(organizationTeacherSetupDir(def), { recursive: true });
    return;
  }

  await fs.mkdir(root, { recursive: true });

  if (await pathExists(LEGACY_SUBMISSIONS)) {
    await fs.copyFile(LEGACY_SUBMISSIONS, destSubs);
  } else {
    await fs.writeFile(destSubs, "[]", "utf8");
  }

  if (await pathExists(LEGACY_TASK_PROBLEMS)) {
    await copyDirRecursive(LEGACY_TASK_PROBLEMS, organizationTaskProblemsDir(def));
  } else {
    await fs.mkdir(organizationTaskProblemsDir(def), { recursive: true });
  }

  if (await pathExists(LEGACY_TEACHER_SETUP)) {
    await copyDirRecursive(LEGACY_TEACHER_SETUP, organizationTeacherSetupDir(def));
  } else {
    await fs.mkdir(organizationTeacherSetupDir(def), { recursive: true });
  }

  if (await pathExists(LEGACY_RUBRIC)) {
    const destR = organizationTaskRubricDefaultsPath(def);
    if (!(await pathExists(destR))) {
      await fs.copyFile(LEGACY_RUBRIC, destR);
    }
  }
}

/** ディスク上の `data/orgs/*` ディレクトリ一覧（提出検索用） */
export async function listOrganizationIdsOnDisk(): Promise<string[]> {
  const base = orgDataBaseDir();
  let names: string[] = [];
  try {
    names = await fs.readdir(base);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const full = path.join(base, name);
    try {
      if ((await fs.stat(full)).isDirectory()) out.push(name);
    } catch {
      /* skip */
    }
  }
  return out;
}

import { joinEssayMultipartBlocks } from "@/lib/essay-multipart";

export type SubmissionInput = {
  taskId: string;
  studentId: string;
  studentName: string;
  essayText: string;
  /** 教員・バッチ用の長い課題文（シード/API など。生徒フォームでは送らない） */
  question?: string;
  /** 生徒が任意で残す短い識別メモ（運用表示用。添削プロンプトの question には使わない） */
  problemMemo?: string;
  /** マスタ `data/task-problems/{taskId}.json` の problemId。未指定時は従来どおり submission.question またはフォールバック */
  problemId?: string;
  /** true のとき essayText は【(1)】…形式。essayParts は保存・表示用 */
  essayMultipart?: boolean;
  essayParts?: string[];
};

export type ValidationErrors = Partial<Record<keyof SubmissionInput, string>>;

/** 提出フォーム「問題メモ」の最大文字数（目安20字程度） */
const PROBLEM_MEMO_MAX = 30;
const PROBLEM_ID_MAX = 120;
const QUESTION_MAX = 20000;
const SINGLE_MIN = 50;
const SINGLE_MAX = 2000;
const PART_MIN = 15;
const PART_MAX = 2500;
const MULTI_TOTAL_MIN = 50;
const MULTI_TOTAL_MAX = 8000;

export function normalizeSubmissionFromBody(body: unknown): SubmissionInput {
  const o = body as Record<string, unknown>;
  const essayMultipart = o?.essayMultipart === true;
  const rawParts = o?.essayParts;

  if (essayMultipart) {
    const raw = Array.isArray(rawParts) ? rawParts : [];
    const trimmed = raw.map((p) => String(p ?? "").trim());
    return {
      taskId: String(o?.taskId ?? ""),
      studentId: String(o?.studentId ?? ""),
      studentName: String(o?.studentName ?? ""),
      essayText: joinEssayMultipartBlocks(trimmed),
      question: o?.question != null ? String(o.question) : undefined,
      problemMemo: o?.problemMemo != null ? String(o.problemMemo) : undefined,
      problemId: o?.problemId != null ? String(o.problemId) : undefined,
      essayMultipart: true,
      essayParts: trimmed,
    };
  }

  return {
    taskId: String(o?.taskId ?? ""),
    studentId: String(o?.studentId ?? ""),
    studentName: String(o?.studentName ?? ""),
    essayText: String(o?.essayText ?? ""),
    question: o?.question != null ? String(o.question) : undefined,
    problemMemo: o?.problemMemo != null ? String(o.problemMemo) : undefined,
    problemId: o?.problemId != null ? String(o.problemId) : undefined,
    essayMultipart: false,
  };
}

export function validateSubmissionInput(input: SubmissionInput): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.taskId.trim()) {
    errors.taskId = "taskId is required";
  }
  if (!input.studentId.trim()) {
    errors.studentId = "studentId is required";
  }
  if (!input.studentName.trim()) {
    errors.studentName = "studentName is required";
  }

  if (input.essayMultipart) {
    const parts = input.essayParts ?? [];
    if (parts.length < 2) {
      errors.essayText = "複数設問では、設問ごとの英文欄を2つ以上用意してください（「設問を追加」）";
    } else {
      let total = 0;
      for (let i = 0; i < parts.length; i += 1) {
        const t = parts[i]!.trim();
        if (!t) {
          errors.essayText = `Question ${i + 1} の英文を入力してください`;
          break;
        }
        if (t.length < PART_MIN) {
          errors.essayText = `Question ${i + 1} は少なくとも ${PART_MIN} 文字以上にしてください`;
          break;
        }
        if (t.length > PART_MAX) {
          errors.essayText = `Question ${i + 1} は ${PART_MAX} 文字以内にしてください`;
          break;
        }
        total += t.length;
      }
      const joined = input.essayText.trim();
      if (!errors.essayText) {
        if (total < MULTI_TOTAL_MIN) {
          errors.essayText = `全体で少なくとも ${MULTI_TOTAL_MIN} 文字以上にしてください`;
        } else if (joined.length > MULTI_TOTAL_MAX) {
          errors.essayText = `全体で ${MULTI_TOTAL_MAX} 文字以内にしてください`;
        }
      }
    }
  } else {
    const essay = input.essayText.trim();
    if (!essay) {
      errors.essayText = "essayText is required";
    } else if (essay.length < SINGLE_MIN || essay.length > SINGLE_MAX) {
      errors.essayText = `essayText must be between ${SINGLE_MIN} and ${SINGLE_MAX} characters`;
    }
  }

  const question = (input.question ?? "").trim();
  if (question.length > QUESTION_MAX) {
    errors.question = `question must be at most ${QUESTION_MAX} characters`;
  }

  const memo = (input.problemMemo ?? "").trim();
  if (memo.length > PROBLEM_MEMO_MAX) {
    errors.problemMemo = `問題メモは ${PROBLEM_MEMO_MAX} 文字以内にしてください`;
  }

  const pid = (input.problemId ?? "").trim();
  if (pid.length > PROBLEM_ID_MAX) {
    errors.problemId = `problemId は ${PROBLEM_ID_MAX} 文字以内にしてください`;
  }

  return errors;
}

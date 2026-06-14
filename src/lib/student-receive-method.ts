/** 生徒が添削完成後に選ぶ結果の受け取り方 */
export type StudentReceiveMethod = "web" | "teacher_meeting";

export const STUDENT_RECEIVE_METHOD_VALUES: readonly StudentReceiveMethod[] = ["web", "teacher_meeting"] as const;

export function isStudentReceiveMethod(v: unknown): v is StudentReceiveMethod {
  return v === "web" || v === "teacher_meeting";
}

export function studentReceiveMethodLabel(method: StudentReceiveMethod | undefined | null): string {
  if (method === "web") return "Web確認";
  if (method === "teacher_meeting") return "講師面談";
  return "—";
}

export function studentReceiveMethodShortLabel(method: StudentReceiveMethod | undefined | null): string {
  return studentReceiveMethodLabel(method);
}

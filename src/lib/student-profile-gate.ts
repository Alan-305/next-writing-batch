import { isTeacherByRoles, needsStudentSubjectProfile } from "@/lib/auth/user-roles";
import type { FirestoreUserProfile } from "@/lib/firebase/types";

/** 提出・オンボーディング用: 生徒は組織紐付け済みかつ学籍・ニックネーム必須 */
export function isStudentProfileComplete(
  roles: string[],
  profile: FirestoreUserProfile | null,
): boolean {
  if (isTeacherByRoles(roles)) return true;
  if (!needsStudentSubjectProfile(roles)) return true;
  if (!profile?.organizationId?.trim()) return false;
  return Boolean(profile.studentNumber?.trim() && profile.nickname?.trim());
}

export function shouldRedirectStudentToOnboarding(
  roles: string[],
  profile: FirestoreUserProfile | null,
  profileLoading: boolean,
): boolean {
  if (profileLoading) return false;
  if (isTeacherByRoles(roles)) return false;
  if (!needsStudentSubjectProfile(roles)) return false;
  return !isStudentProfileComplete(roles, profile);
}

"use client";

import type { ReactNode } from "react";

import { StudentAppShellLayout } from "@/components/student/StudentAppShellLayout";

/** 添削結果ページ（ログイン不要・公開済みのみサーバー側で表示） */
export function StudentPublicShellLayout({ children }: { children: ReactNode }) {
  return (
    <StudentAppShellLayout allowAnonymous>
      {children}
    </StudentAppShellLayout>
  );
}

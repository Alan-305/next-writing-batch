import type { Metadata } from "next";
import type { ReactNode } from "react";

import { StudentAppShellLayout } from "@/components/student/StudentAppShellLayout";

export const metadata: Metadata = {
  title: "提出・受け取り・質問",
  description: "英作文の提出、添削結果の確認、サポート・問い合わせ",
};

export default function SubmitLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <StudentAppShellLayout>{children}</StudentAppShellLayout>;
}

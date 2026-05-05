import type { ReactNode } from "react";

import { StudentAppShellLayout } from "@/components/student/StudentAppShellLayout";

export default function ResultLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <StudentAppShellLayout>{children}</StudentAppShellLayout>;
}

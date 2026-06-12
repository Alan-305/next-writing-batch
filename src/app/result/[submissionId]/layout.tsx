import type { ReactNode } from "react";

import { StudentPublicShellLayout } from "@/components/student/StudentPublicShellLayout";

export default function ResultLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <StudentPublicShellLayout>{children}</StudentPublicShellLayout>;
}

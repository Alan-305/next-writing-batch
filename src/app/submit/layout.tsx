import type { ReactNode } from "react";

import { StudentAppShellLayout } from "@/components/student/StudentAppShellLayout";

export default function SubmitLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <StudentAppShellLayout>{children}</StudentAppShellLayout>;
}

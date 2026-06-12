import type { ReactNode } from "react";

import { ResultLayoutClient } from "@/components/student/ResultLayoutClient";

export default function ResultLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ResultLayoutClient>{children}</ResultLayoutClient>;
}

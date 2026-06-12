"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { StudentAppShellLayout } from "@/components/student/StudentAppShellLayout";

function SubmitLayoutInner({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const org = (params.get("org") ?? "").trim();
  return (
    <StudentAppShellLayout publicOrganizationId={org || undefined} allowAnonymous={Boolean(org)}>
      {children}
    </StudentAppShellLayout>
  );
}

export function SubmitLayoutClient({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<StudentAppShellLayout>{children}</StudentAppShellLayout>}>
      <SubmitLayoutInner>{children}</SubmitLayoutInner>
    </Suspense>
  );
}

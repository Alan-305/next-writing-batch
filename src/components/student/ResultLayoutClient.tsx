"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { StudentAppShellLayout } from "@/components/student/StudentAppShellLayout";

function ResultLayoutInner({ children }: { children: ReactNode }) {
  const params = useParams();
  const raw = typeof params?.submissionId === "string" ? params.submissionId : "";
  const submissionId = decodeURIComponent(raw || "").trim();
  const [organizationId, setOrganizationId] = useState("");

  useEffect(() => {
    if (!submissionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/submissions/${encodeURIComponent(submissionId)}/organization`,
        );
        const j = (await res.json()) as { ok?: boolean; organizationId?: string };
        if (!cancelled && j.ok && j.organizationId) {
          setOrganizationId(j.organizationId);
        }
      } catch {
        /* 既定ブランディングのまま */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  return (
    <StudentAppShellLayout allowAnonymous publicOrganizationId={organizationId || undefined}>
      {children}
    </StudentAppShellLayout>
  );
}

export function ResultLayoutClient({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <StudentAppShellLayout allowAnonymous>{children}</StudentAppShellLayout>
      }
    >
      <ResultLayoutInner>{children}</ResultLayoutInner>
    </Suspense>
  );
}

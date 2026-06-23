"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthToolbar } from "@/components/auth/AuthToolbar";
import { RequireOpsAccess } from "@/components/auth/RequireOpsAccess";
import { DailyMoodCelebration } from "@/components/celebrations/DailyMoodCelebration";
import { StudentBrandingThemeDecor } from "@/components/branding/StudentBrandingThemeDecor";
import { TeacherTicketStatusBanner } from "@/components/ops/TeacherTicketStatusBanner";
import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { OPS_DASHBOARD_LABEL } from "@/lib/ops/ops-dashboard-label";
import {
  DEFAULT_STUDENT_BRANDING,
  mergeStudentBranding,
  type StudentBranding,
} from "@/lib/student-branding";
import { resolveActivePresetId } from "@/lib/student-branding-presets";
import { studentBrandingShellProps } from "@/lib/student-branding-shell";

type Props = { children: ReactNode };

export function OpsAppShellLayout({ children }: Props) {
  const pathname = usePathname() || "";
  const { user, authLoading } = useFirebaseAuthContext();
  const [branding, setBranding] = useState<StudentBranding>(DEFAULT_STUDENT_BRANDING);

  useEffect(() => {
    if (!user || authLoading) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/branding", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (!cancelled) setBranding(mergeStudentBranding(data));
      } catch {
        /* 既定のまま */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, pathname]);

  const shellProps = useMemo(() => studentBrandingShellProps(branding), [branding]);
  const presetId = useMemo(() => resolveActivePresetId(branding), [branding]);
  const school = branding.schoolDisplayName.trim();
  const dashboardActive = pathname === "/ops" || pathname === "/ops/";

  return (
    <div className="app-shell app-shell--teacher app-shell--ops-branded" {...shellProps}>
      <StudentBrandingThemeDecor presetId={presetId} />
      <header className="app-shell-header app-shell-header--student no-print">
        <div className="app-shell-header-inner">
          <Link href="/tensaku-kakumei" className="app-shell-brand-cluster" style={{ textDecoration: "none" }}>
            <span className="app-shell-brand-student">{branding.productTitle}</span>
            {school ? <span className="app-shell-school-student muted">{school}</span> : null}
          </Link>
          <span className="app-shell-badge-student">{branding.teacherBadgeLabel}</span>
          <nav className="app-shell-nav app-shell-nav--ops" aria-label="主要ナビ">
            <Link href="/ops" aria-current={dashboardActive ? "page" : undefined}>
              {OPS_DASHBOARD_LABEL}
            </Link>
            <Link href="/submit">教員トライアル提出</Link>
            <Link href="/tensaku-kakumei">案内サイト</Link>
          </nav>
          <div className="app-shell-header-actions">
            <AuthToolbar variant="teacher" />
          </div>
        </div>
      </header>
      <RequireOpsAccess>
        {user?.uid ? <DailyMoodCelebration audience="teacher" identity={user.uid} /> : null}
        <div className="ops-shell-main-wrap" style={{ padding: "0 12px" }}>
          <TeacherTicketStatusBanner />
          {children}
        </div>
      </RequireOpsAccess>
    </div>
  );
}

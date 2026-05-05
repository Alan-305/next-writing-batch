"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthToolbar } from "@/components/auth/AuthToolbar";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import {
  DEFAULT_STUDENT_BRANDING,
  mergeStudentBranding,
  studentBrandingStyle,
  type StudentBranding,
} from "@/lib/student-branding";

type Props = { children: ReactNode };

function SettingsGearLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/settings"
      className={`app-shell-settings-link${active ? " app-shell-settings-link--active" : ""}`}
      aria-label="設定"
      aria-current={active ? "page" : undefined}
    >
      <svg
        className="app-shell-settings-icon"
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.31.22.65.22 1v.09c0 .35-.08.69-.22 1a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

export function StudentAppShellLayout({ children }: Props) {
  const pathname = usePathname() || "";
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");
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

  const shellStyle = useMemo(() => studentBrandingStyle(branding), [branding]);
  const school = branding.schoolDisplayName.trim();

  return (
    <div className="app-shell app-shell--student" style={shellStyle}>
      <header className="app-shell-header app-shell-header--student no-print">
        <div className="app-shell-header-inner">
          <div className="app-shell-brand-cluster">
            <span className="app-shell-brand-student">{branding.productTitle}</span>
            {school ? <span className="app-shell-school-student muted">{school}</span> : null}
          </div>
          <span className="app-shell-badge-student">{branding.badgeLabel}</span>
          <div className="app-shell-header-actions">
            <SettingsGearLink active={settingsActive} />
            <AuthToolbar variant="student" />
          </div>
        </div>
      </header>
      <RequireAuth>{children}</RequireAuth>
    </div>
  );
}

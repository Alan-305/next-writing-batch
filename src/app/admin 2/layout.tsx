import Link from "next/link";

import { AdminTenantRoster } from "@/components/admin/AdminTenantRoster";
import { AdminTenantTickets } from "@/components/admin/AdminTenantTickets";
import { AdminTenantSwitcher } from "@/components/admin/AdminTenantSwitcher";
import { AuthToolbar } from "@/components/auth/AuthToolbar";
import { RequireAdmin } from "@/components/auth/RequireAdmin";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireAdmin>
      <div className="app-shell app-shell--teacher">
        <header className="app-shell-header app-shell-header--teacher">
          <div className="app-shell-header-inner">
            <Link href="/hub" className="app-shell-brand">
              Next Writing Batch
            </Link>
            <span className="app-shell-badge">管理</span>
            <nav className="app-shell-nav" aria-label="管理ナビ">
              <Link href="/admin">管理トップ</Link>
              <Link href="/admin/billing">チケット調整</Link>
            </nav>
            <AdminTenantSwitcher />
            <AuthToolbar variant="teacher" />
          </div>
        </header>
        <AdminTenantRoster />
        <AdminTenantTickets />
        {children}
      </div>
    </RequireAdmin>
  );
}

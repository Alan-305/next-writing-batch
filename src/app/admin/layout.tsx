import Link from "next/link";

import { AuthToolbar } from "@/components/auth/AuthToolbar";
import { RequireAdmin } from "@/components/auth/RequireAdmin";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireAdmin>
      <div className="app-shell app-shell--teacher">
        <header className="app-shell-header app-shell-header--teacher">
          <div className="app-shell-header-inner">
            <Link href="/tensaku-kakumei" className="app-shell-brand">
              Next Writing Batch
            </Link>
            <span className="app-shell-badge">管理</span>
            <nav className="app-shell-nav" aria-label="管理ナビ">
              <Link href="/admin">ダッシュボード</Link>
              <Link href="/admin/tenant-maintenance">メンテナンス</Link>
              <Link href="/ops">運用 /ops</Link>
            </nav>
            <AuthToolbar variant="teacher" />
          </div>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </RequireAdmin>
  );
}

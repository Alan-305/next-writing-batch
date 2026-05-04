import Link from "next/link";

import { AuthToolbar } from "@/components/auth/AuthToolbar";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function OpsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell app-shell--teacher">
      <header className="app-shell-header app-shell-header--teacher">
        <div className="app-shell-header-inner">
          <Link href="/tensaku-kakumei" className="app-shell-brand">
            添削革命
          </Link>
          <span className="app-shell-badge">教員・運用</span>
          <nav className="app-shell-nav" aria-label="主要ナビ">
            <Link href="/ops">運用トップ</Link>
            <Link href="/submit">生徒提出</Link>
            <Link href="/tensaku-kakumei">案内サイト</Link>
          </nav>
          <AuthToolbar variant="teacher" />
        </div>
      </header>
      <RequireAuth>{children}</RequireAuth>
    </div>
  );
}

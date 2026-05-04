import { AuthToolbar } from "@/components/auth/AuthToolbar";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function SubmitLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell app-shell--student">
      <header className="app-shell-header app-shell-header--student">
        <div className="app-shell-header-inner">
          <span className="app-shell-brand-student">添削革命</span>
          <span className="app-shell-badge-student">生徒用</span>
          <AuthToolbar variant="student" />
        </div>
      </header>
      <RequireAuth>{children}</RequireAuth>
    </div>
  );
}

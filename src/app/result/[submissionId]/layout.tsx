export default function ResultLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell app-shell--student">
      <header className="app-shell-header app-shell-header--student">
        <div className="app-shell-header-inner">
          <span className="app-shell-brand-student">添削革命</span>
          <span className="app-shell-badge-student">生徒用</span>
        </div>
      </header>
      {children}
    </div>
  );
}

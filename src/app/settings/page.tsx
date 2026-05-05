"use client";

import Link from "next/link";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

export default function SettingsPage() {
  const { user, signOutUser } = useFirebaseAuthContext();

  return (
    <main>
      <h1>設定</h1>
      <div className="card student-settings-card">
        <nav className="student-settings-nav" aria-label="よく使う画面">
          <Link href="/submit">提出画面へ</Link>
        </nav>
        <p className="muted student-settings-hint">
          添削結果を PDF にしたいときは、結果ページで Mac は ⌘P、Windows は Ctrl+P から「PDF に保存」を選びます。
        </p>
        <div className="student-settings-account">
          <span className="muted student-settings-account-label">ログイン中</span>
          <p className="student-settings-email">{user?.email ?? user?.uid ?? "—"}</p>
          <button type="button" onClick={() => void signOutUser()}>
            ログアウト
          </button>
        </div>
      </div>
    </main>
  );
}

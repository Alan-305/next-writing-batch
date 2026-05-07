"use client";

import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <main style={{ padding: "24px 18px", maxWidth: 640, margin: "0 auto" }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>管理画面でエラーが発生しました</h1>
        <p className="muted" style={{ wordBreak: "break-word" }}>
          {error.message}
        </p>
        <p style={{ marginBottom: 0 }}>
          <button type="button" onClick={() => reset()}>
            もう一度試す
          </button>{" "}
          <Link href="/hub">ハブへ</Link> ・ <Link href="/sign-in?next=%2Fadmin">ログインへ</Link>
        </p>
      </div>
    </main>
  );
}

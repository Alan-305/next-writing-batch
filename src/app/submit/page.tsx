import { Suspense } from "react";

import SubmitPageClient from "./SubmitPageClient";

export default function SubmitPage() {
  return (
    <Suspense
      fallback={
        <main>
          <h1>提出・受け取り</h1>
          <p className="muted">読み込み中…</p>
        </main>
      }
    >
      <SubmitPageClient />
    </Suspense>
  );
}

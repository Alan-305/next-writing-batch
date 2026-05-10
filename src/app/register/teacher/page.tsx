import { Suspense } from "react";

import { RegisterTeacherClient } from "./RegisterTeacherClient";

export default function RegisterTeacherPage() {
  return (
    <Suspense fallback={<main><p className="muted">読み込み中…</p></main>}>
      <RegisterTeacherClient />
    </Suspense>
  );
}

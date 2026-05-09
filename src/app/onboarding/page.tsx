import { Suspense } from "react";

import { OnboardingClient } from "./OnboardingClient";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main><p className="muted">読み込み中…</p></main>}>
      <OnboardingClient />
    </Suspense>
  );
}

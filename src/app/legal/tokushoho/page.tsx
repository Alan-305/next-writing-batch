import type { Metadata } from "next";

import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { TokushohoView } from "@/components/legal/TokushohoView";
import { readLegalBusinessInfo } from "@/lib/legal/business-info";
import { LEGAL_DOCUMENT_LABELS } from "@/lib/legal/paths";

export const metadata: Metadata = {
  title: `${LEGAL_DOCUMENT_LABELS.tokushoho} | 添削革命`,
};

export default function LegalTokushohoPage() {
  const info = readLegalBusinessInfo();
  return (
    <LegalDocumentShell title={LEGAL_DOCUMENT_LABELS.tokushoho} current="tokushoho">
      <TokushohoView info={info} />
    </LegalDocumentShell>
  );
}

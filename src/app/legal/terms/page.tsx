import type { Metadata } from "next";

import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { TicketTermsView } from "@/components/legal/TicketTermsView";
import { LEGAL_DOCUMENT_LABELS } from "@/lib/legal/paths";

export const metadata: Metadata = {
  title: `${LEGAL_DOCUMENT_LABELS.terms} | 添削革命`,
};

export default function LegalTermsPage() {
  return (
    <LegalDocumentShell title={LEGAL_DOCUMENT_LABELS.terms} current="terms">
      <TicketTermsView />
    </LegalDocumentShell>
  );
}

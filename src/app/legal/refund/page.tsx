import type { Metadata } from "next";

import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell";
import { RefundPolicyView } from "@/components/legal/RefundPolicyView";
import { readLegalBusinessInfo } from "@/lib/legal/business-info";
import { LEGAL_DOCUMENT_LABELS } from "@/lib/legal/paths";

export const metadata: Metadata = {
  title: `${LEGAL_DOCUMENT_LABELS.refund} | 添削革命`,
};

export default function LegalRefundPage() {
  const info = readLegalBusinessInfo();
  return (
    <LegalDocumentShell title={LEGAL_DOCUMENT_LABELS.refund} current="refund">
      <RefundPolicyView info={info} />
    </LegalDocumentShell>
  );
}

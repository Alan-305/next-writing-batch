import Link from "next/link";

import { LEGAL_DOCUMENT_LABELS, LEGAL_PATHS } from "@/lib/legal/paths";

export function LegalPurchaseLinks() {
  return (
    <span className="legal-purchase-links">
      <Link href={LEGAL_PATHS.terms} target="_blank" rel="noopener noreferrer">
        {LEGAL_DOCUMENT_LABELS.terms}
      </Link>
      {" · "}
      <Link href={LEGAL_PATHS.tokushoho} target="_blank" rel="noopener noreferrer">
        {LEGAL_DOCUMENT_LABELS.tokushoho}
      </Link>
      {" · "}
      <Link href={LEGAL_PATHS.refund} target="_blank" rel="noopener noreferrer">
        {LEGAL_DOCUMENT_LABELS.refund}
      </Link>
    </span>
  );
}

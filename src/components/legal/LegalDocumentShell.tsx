import Link from "next/link";
import type { ReactNode } from "react";

import { LEGAL_DOCUMENT_LABELS, LEGAL_PATHS, type LegalDocumentId } from "@/lib/legal/paths";

type Props = {
  title: string;
  current?: LegalDocumentId;
  children: ReactNode;
};

export function LegalDocumentShell({ title, current, children }: Props) {
  const navItems = (Object.keys(LEGAL_DOCUMENT_LABELS) as LegalDocumentId[]).map((id) => ({
    id,
    href: LEGAL_PATHS[id],
    label: LEGAL_DOCUMENT_LABELS[id],
  }));

  return (
    <main className="legal-document">
      <p className="muted legal-document-back">
        <Link href="/tensaku-kakumei">← 添削革命 案内サイト</Link>
        {" · "}
        <Link href="/ops/tickets">チケット購入</Link>
      </p>

      <header className="legal-document-header">
        <p className="legal-document-brand muted">Nexus Learning / 添削革命</p>
        <h1>{title}</h1>
        <p className="muted legal-document-updated">最終更新: 2026年6月（試験運用中）</p>
      </header>

      <nav className="legal-document-nav card" aria-label="法的書面">
        <ul className="legal-document-nav-list">
          {navItems.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={current === item.id ? "page" : undefined}
                className={current === item.id ? "legal-document-nav-link--active" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <article className="card legal-document-body">{children}</article>
    </main>
  );
}

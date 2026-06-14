import Link from "next/link";

import { LEGAL_DOCUMENT_LABELS, LEGAL_PATHS } from "@/lib/legal/paths";

export default function LegalIndexPage() {
  const items = [
    { href: LEGAL_PATHS.terms, label: LEGAL_DOCUMENT_LABELS.terms, desc: "有料チケットの購入・消費・有効期限に関する条項" },
    {
      href: LEGAL_PATHS.tokushoho,
      label: LEGAL_DOCUMENT_LABELS.tokushoho,
      desc: "販売者情報、価格、支払方法など（特定商取引法の義務表示）",
    },
    { href: LEGAL_PATHS.refund, label: LEGAL_DOCUMENT_LABELS.refund, desc: "返品・返金の原則と、システム不具合時の対応" },
  ];

  return (
    <main className="legal-document">
      <p className="muted legal-document-back">
        <Link href="/tensaku-kakumei">← 添削革命 案内サイト</Link>
      </p>
      <header className="legal-document-header">
        <p className="legal-document-brand muted">Nexus Learning / 添削革命</p>
        <h1>法的書面</h1>
        <p className="muted legal-document-updated">
          チケット購入にあたり、以下の書面をご確認ください。試験運用中のため、内容は調整する場合があります。
        </p>
      </header>
      <ul className="legal-index-list">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="card legal-index-card">
              <span className="legal-index-card-title">{item.label}</span>
              <span className="muted legal-index-card-desc">{item.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "法的書面 | 添削革命",
  description: "利用規約、特定商取引法に基づく表記、返金ポリシー",
};

export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="page-surface page-surface--neutral legal-layout">{children}</div>;
}

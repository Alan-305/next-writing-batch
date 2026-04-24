import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "添削革命 | Nexus Learning",
  description:
    "英語教師のための添削代行アプリ。赤ペンを置いて、生徒と向き合う時間を取り戻す。",
};

export default function TensakuKakumeiLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}

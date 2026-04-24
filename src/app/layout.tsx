import "@/lib/fix-node-localstorage";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next Writing Batch",
  description: "Submission MVP for Day2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

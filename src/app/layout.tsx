import "@/lib/fix-node-localstorage";
import { DevChunkLoadRecovery } from "@/components/DevChunkLoadRecovery";
import { FirebaseAuthProvider } from "@/components/auth/FirebaseAuthProvider";
import { readFirebaseWebConfig } from "@/lib/firebase/config";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next Writing Batch",
  description: "Submission MVP for Day2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const firebaseWebConfig = readFirebaseWebConfig();
  return (
    <html lang="ja" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <DevChunkLoadRecovery />
        <FirebaseAuthProvider webConfig={firebaseWebConfig}>{children}</FirebaseAuthProvider>
      </body>
    </html>
  );
}

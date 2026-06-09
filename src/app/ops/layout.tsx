import { OpsAppShellLayout } from "@/components/ops/OpsAppShellLayout";

export default function OpsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <OpsAppShellLayout>{children}</OpsAppShellLayout>;
}

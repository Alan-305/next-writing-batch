import { StudentAppShellLayout } from "@/components/student/StudentAppShellLayout";

export default function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <StudentAppShellLayout>{children}</StudentAppShellLayout>;
}

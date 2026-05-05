import { OpsSubmissionsPageClient } from "./OpsSubmissionsPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function OpsSubmissionsPage() {
  return <OpsSubmissionsPageClient />;
}

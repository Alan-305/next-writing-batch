import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** ドメインに応じてトップ遷移を分岐する */
export default async function Home() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();

  // 生徒向けドメインは提出画面へ
  if (host.startsWith("tensaku-kakumei-for-students.")) {
    redirect("/submit");
  }

  // 教師・管理者向けドメインは運用ホームへ
  if (host.startsWith("tensaku-kakumei-for-teachers.")) {
    redirect("/ops");
  }

  // それ以外（総合サイト）は添削革命LPへ
  redirect("/tensaku-kakumei");
}

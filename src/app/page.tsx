import { redirect } from "next/navigation";

/** 本番ドメインのトップは「添削革命」サイトへ。運用導線は /hub */
export default function Home() {
  redirect("/tensaku-kakumei");
}

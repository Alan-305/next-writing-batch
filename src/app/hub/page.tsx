import { redirect } from "next/navigation";

/** 旧開発用ハブは廃止。ブックマーク等からの流入は公開 LP へ。 */
export default function HubPage() {
  redirect("/tensaku-kakumei");
}

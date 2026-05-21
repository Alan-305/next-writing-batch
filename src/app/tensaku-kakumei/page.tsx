import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TensakuMarketingBody } from "./TensakuMarketingBody";

export default async function TensakuKakumeiPage() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();

  if (host.startsWith("tensaku-kakumei-for-students.")) {
    redirect("/submit");
  }

  if (host.startsWith("tensaku-kakumei-for-teachers.")) {
    redirect("/ops");
  }

  return (
    <div className="tensaku-kakumei-site">
      <div className="tensaku-trial-banner" role="status">
        ただいま<strong>試験運用中</strong>です。不具合やご要望は、ページ下部の「サポート・ご相談」よりお知らせください。
      </div>

      <header className="tensaku-hero tensaku-hero--pro">
        <div className="tensaku-hero-panel">
          <p className="tensaku-hero-tag tensaku-en">Nexus Learning</p>
          <h1 className="tensaku-hero-title">
            英語教師のための添削代行アプリ<span className="tensaku-brand">「添削革命」</span>
          </h1>
          <p className="tensaku-hero-lead tensaku-en">Put down the red pen. Face your students.</p>
          <p className="tensaku-hero-sub">赤ペンを置いて、生徒と向き合おう。</p>
        </div>
      </header>

      <section className="tensaku-hero-video-wrap" aria-label="紹介動画">
        <video
          className="tensaku-hero-video"
          controls
          playsInline
          preload="metadata"
          poster="/tensaku-kakumei.png"
          src="/tensaku-kakumei.mp4"
        >
          お使いのブラウザは動画の再生に対応していません。
        </video>
      </section>

      <TensakuMarketingBody />
    </div>
  );
}

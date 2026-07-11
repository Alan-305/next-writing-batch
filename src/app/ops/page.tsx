import Link from "next/link";

import { OPS_DASHBOARD_LABEL } from "@/lib/ops/ops-dashboard-label";

export default function OpsHomePage() {
  return (
    <main className="ops-home">
      <header className="ops-home-hero">
        <h1>{OPS_DASHBOARD_LABEL}</h1>
      </header>

      <section className="ops-home-grid" aria-label="主要作業">
        <Link href="/ops/proofreading-setup" className="ops-home-action ops-home-action--setup">
          <span className="ops-home-action-icon" aria-hidden>
            ⚙
          </span>
          <span className="ops-home-action-title">添削課題設定</span>
          <span className="ops-home-action-desc">課題内容や添削基準を設定・更新します。</span>
          <span className="ops-home-action-cta">設定を開く</span>
        </Link>

        <Link href="/ops/invite" className="ops-home-action ops-home-action--invite">
          <span className="ops-home-action-icon" aria-hidden>
            🔗
          </span>
          <span className="ops-home-action-title">生徒招待リンク</span>
          <span className="ops-home-action-desc">
            テナント ID の確認と、Google ログイン不要の提出用リンク・QRコードを共有します。
          </span>
          <span className="ops-home-action-cta">招待リンクを開く</span>
        </Link>

        <Link href="/ops/submissions" className="ops-home-action ops-home-action--submissions">
          <span className="ops-home-action-icon" aria-hidden>
            📝
          </span>
          <span className="ops-home-action-title">提出一覧</span>
          <span className="ops-home-action-desc">提出状況を確認し、添削・確定などの作業を進めます。</span>
          <span className="ops-home-action-cta">一覧を開く</span>
        </Link>

        <Link href="/ops/submission-counts" className="ops-home-action ops-home-action--submission-counts">
          <span className="ops-home-action-icon" aria-hidden>
            📊
          </span>
          <span className="ops-home-action-title">提出状況</span>
          <span className="ops-home-action-desc">
            匿名招待リンクからの提出件数を、課題ごとに確認します。
          </span>
          <span className="ops-home-action-cta">提出状況を開く</span>
        </Link>

        <Link href="/ops/reports" className="ops-home-action ops-home-action--reports">
          <span className="ops-home-action-icon" aria-hidden>
            📈
          </span>
          <span className="ops-home-action-title">集計レポート</span>
          <span className="ops-home-action-desc">
            内容点・文法点の分布と頻出の伸びしろを集計し、授業・個別指導用の資料を作ります。
          </span>
          <span className="ops-home-action-cta">レポートを開く</span>
        </Link>

        <Link href="/ops/student-support" className="ops-home-action ops-home-action--inquiry">
          <span className="ops-home-action-icon" aria-hidden>
            💬
          </span>
          <span className="ops-home-action-title">生徒サポート</span>
          <span className="ops-home-action-desc">匿名生徒からの質問に返信します（返信は生徒のメッセージボックスへ）。</span>
          <span className="ops-home-action-cta">受信箱を開く</span>
        </Link>

        <Link href="/ops/student-appearance" className="ops-home-action ops-home-action--appearance">
          <span className="ops-home-action-icon" aria-hidden>
            🎨
          </span>
          <span className="ops-home-action-title">画面設定</span>
          <span className="ops-home-action-desc">
            色や学校名など、教員画面と生徒画面の見た目を組織単位でそろえます。
          </span>
          <span className="ops-home-action-cta">設定を開く</span>
        </Link>

        <Link href="/ops/tickets" className="ops-home-action ops-home-action--tickets">
          <span className="ops-home-action-icon" aria-hidden>
            🎟
          </span>
          <span className="ops-home-action-title">チケット購入</span>
          <span className="ops-home-action-desc">
            添削用チケットの購入と、教員アカウントの残枚数を確認します。
          </span>
          <span className="ops-home-action-cta">購入・残数を開く</span>
        </Link>

        <Link href="/ops/deliverables" className="ops-home-action ops-home-action--deliverables">
          <span className="ops-home-action-icon" aria-hidden>
            📦
          </span>
          <span className="ops-home-action-title">納品ZIP</span>
          <span className="ops-home-action-desc">作成済みの納品ZIPを確認し、ダウンロードします。</span>
          <span className="ops-home-action-cta">納品ZIPを開く</span>
        </Link>

        <Link href="/tensaku-kakumei#support" className="ops-home-action ops-home-action--inquiry">
          <span className="ops-home-action-icon" aria-hidden>
            ✉
          </span>
          <span className="ops-home-action-title">問い合わせ</span>
          <span className="ops-home-action-desc">運用・導入・不具合の相談を送信します。</span>
          <span className="ops-home-action-cta">フォームを開く</span>
        </Link>
      </section>
    </main>
  );
}

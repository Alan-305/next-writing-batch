import Link from "next/link";

export default function OpsHomePage() {
  return (
    <main className="ops-home">
      <header className="ops-home-hero card">
        <h1>教員・運用ホーム</h1>
        <p className="muted">
          ここは、日々の運用作業を始めるためのページです。必要な操作だけを大きなボタンにまとめています。
        </p>
      </header>

      <section className="ops-home-grid" aria-label="主要作業">
        <Link href="/ops/tenant" className="ops-home-action ops-home-action--tenant">
          <span className="ops-home-action-icon" aria-hidden>
            🧩
          </span>
          <span className="ops-home-action-title">テナント（検証）</span>
          <span className="ops-home-action-desc">今どの組織 ID で動いているか確認し、開発時だけ別テナントに切り替えられます。</span>
          <span className="ops-home-action-cta">テナントを開く</span>
        </Link>

        <Link href="/ops/student-appearance" className="ops-home-action ops-home-action--appearance">
          <span className="ops-home-action-icon" aria-hidden>
            🎨
          </span>
          <span className="ops-home-action-title">生徒画面の見た目</span>
          <span className="ops-home-action-desc">色や学校名など、生徒が見る画面のトーンを組織単位で変えます。</span>
          <span className="ops-home-action-cta">見た目を開く</span>
        </Link>

        <Link href="/ops/proofreading-setup" className="ops-home-action ops-home-action--setup">
          <span className="ops-home-action-icon" aria-hidden>
            ⚙
          </span>
          <span className="ops-home-action-title">課題・添削設定</span>
          <span className="ops-home-action-desc">課題内容や添削基準を設定・更新します。</span>
          <span className="ops-home-action-cta">設定を開く</span>
        </Link>

        <Link href="/ops/submissions" className="ops-home-action ops-home-action--submissions">
          <span className="ops-home-action-icon" aria-hidden>
            📝
          </span>
          <span className="ops-home-action-title">提出一覧</span>
          <span className="ops-home-action-desc">提出状況を確認し、添削・確定などの作業を進めます。</span>
          <span className="ops-home-action-cta">一覧を開く</span>
        </Link>

        <Link href="/ops/deliverables" className="ops-home-action ops-home-action--deliverables">
          <span className="ops-home-action-icon" aria-hidden>
            📦
          </span>
          <span className="ops-home-action-title">納品 ZIP</span>
          <span className="ops-home-action-desc">作成済みの納品 ZIP を確認し、ダウンロードします。</span>
          <span className="ops-home-action-cta">納品 ZIP を開く</span>
        </Link>

        <Link href="/ops/tickets" className="ops-home-action ops-home-action--tenant">
          <span className="ops-home-action-icon" aria-hidden>
            🎟
          </span>
          <span className="ops-home-action-title">チケット状況</span>
          <span className="ops-home-action-desc">自分のテナントの生徒・教員の残チケットと直近消費を確認します。</span>
          <span className="ops-home-action-cta">チケット状況を開く</span>
        </Link>

        <Link href="/tensaku-kakumei#support" className="ops-home-action ops-home-action--inquiry">
          <span className="ops-home-action-icon" aria-hidden>
            ✉
          </span>
          <span className="ops-home-action-title">お問い合わせ（教師）</span>
          <span className="ops-home-action-desc">運用・導入・不具合の相談を送信します。</span>
          <span className="ops-home-action-cta">フォームを開く</span>
        </Link>
      </section>
    </main>
  );
}

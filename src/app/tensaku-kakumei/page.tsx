import Link from "next/link";

import { TensakuKakumeiSupportForm } from "./TensakuKakumeiSupportForm";

export default function TensakuKakumeiPage() {
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

      <main className="tensaku-main">
        <nav className="tensaku-quick" aria-label="運用サイトへの導線">
          <p className="tensaku-quick-intro">日常の運用は次のページからお進みください。</p>
          <div className="tensaku-quick-actions">
            <Link href="/submit" className="tensaku-quick-card tensaku-quick-card--student">
              <span className="tensaku-quick-card-label">生徒用</span>
              <span className="tensaku-quick-card-title">答案の提出・テキスト確認</span>
              <span className="tensaku-quick-card-hint">明るくわかりやすい画面で提出します。</span>
            </Link>
            <Link href="/ops" className="tensaku-quick-card tensaku-quick-card--teacher">
              <span className="tensaku-quick-card-label">教員・運用</span>
              <span className="tensaku-quick-card-title">運用ハブ・提出一覧・設定</span>
              <span className="tensaku-quick-card-hint">本番では教員管理 URL に割り当てる想定です。</span>
            </Link>
          </div>
        </nav>

        <section className="tensaku-section card" id="vision">
          <h2>はじめに：開発の想い</h2>
          <h3>40年の教員生活で見えてきた、ひとつの限界</h3>
          <p>
            「先生、英作文の添削をお願いします！」生徒の意欲的な言葉は嬉しい反面、膨大な添削業務は教師の時間を容赦なく奪っていきます。私、松尾直樹は、40年間英語教育に携わる中で、自由英作文の需要が高まるほどに、教師が「一人の人間」として生徒と向き合う時間が削られていく矛盾に悩んできました。そして今も大手予備校の教壇に立ちながら、この経験を生かせる術はないかと考え続けています。
          </p>
          <p>
            「自分の業務を助け、生徒に最良のフィードバックを届けてくれる助っ人はいないか？」その切実な願いから、この<strong>「添削革命」</strong>の開発は始まりました。
          </p>
        </section>

        <section className="tensaku-section card" id="ai">
          <h2>AIは「敵」ではなく、最高の「助手」である</h2>
          <p>
            私はプログラミングの専門家ではありません。しかし、AIという新たな力を借りることで、長年培ってきた指導の知見を形にすることができました。「AIは間違った答えを出すのではないか？」その不安は、私自身も強く感じていたことです。だからこそ、このアプリは<strong>「AI任せ」にはしません。</strong>
          </p>
          <ul className="tensaku-list">
            <li>
              <strong>教師が基準を決める：</strong>最初に配点や条件を厳密に設定します。
            </li>
            <li>
              <strong>生徒が確認する：</strong>OCR（文字認識）のミスは生徒自身が修正します。
            </li>
            <li>
              <strong>教師が仕上げる：</strong>AIの結果を先生が最後に確認し、必要なら一筆加えます。
            </li>
          </ul>
          <p className="tensaku-pullquote">
            <strong>「最初と最後は、必ず人が介在する」。</strong>これが、私のたどり着いた信頼の形です。
          </p>
        </section>

        <section className="tensaku-section card" id="values">
          <h2>添削革命：3つのコア・バリュー</h2>

          <article className="tensaku-value">
            <h3>1. 教師の知見をシステム化する「精密な採点設定」</h3>
            <p>
              内容点、文法点、語法……先生が重視したいポイントを事前に数値化。AIはその「先生の分身」として、多くの答案も一貫した基準で、あっという間に採点の下準備をします。
            </p>
          </article>

          <article className="tensaku-value">
            <h3>2. 「口から覚える」を形にするQRコード音声</h3>
            <p>
              言葉は手ではなく、口で喋ってマスターするもの。添削結果には自動でQRコードが付与されます。生徒は自分の書いた英文がブラッシュアップされた完全版を、ネイティブ音声で即座に聞くことができます。
            </p>
          </article>

          <article className="tensaku-value">
            <h3>3. 授業の質を変える「答案分析データ」</h3>
            <p>
              答案を個別に見て終わりではありません。クラス全体の傾向を分析し、「今回の課題では、この表現のミスが多かった」といった<strong>授業のネタ</strong>を先生にお届けします。ポイントを外さない解説授業の助けになります。
            </p>
          </article>
        </section>

        <section className="tensaku-section card" id="flow">
          <h2>ご利用の流れ</h2>
          <ol className="tensaku-flow">
            <li>
              <strong>設定：</strong>先生が問題と配点を決める。
            </li>
            <li>
              <strong>提出：</strong>生徒がスマホで答案を撮り、テキストを確認して送信。
            </li>
            <li>
              <strong>添削：</strong>先生が一覧から操作するだけで、AIが下書きを作成。
            </li>
            <li>
              <strong>確定：</strong>先生が内容を確認・修正し、確定。
            </li>
            <li>
              <strong>返却：</strong>デジタル配布、または印刷して配布。
            </li>
          </ol>
        </section>

        <section className="tensaku-section card tensaku-closing" id="message">
          <h2>英語教師の皆様へ</h2>
          <p className="tensaku-closing-title tensaku-en">Put down the red pen.</p>
          <p>
            採点という作業に追われる時間は、もう終わりにしましょう。その時間を、生徒一人ひとりと対話し、英語力がどうすれば伸びるのかを語る時間に変えてください。このアプリは、先生が本来すべき指導に集中するための、現場のパートナーです。
          </p>
          <p>
            長年の知見と最新のAI技術を組み合わせたこの仕組みを、ぜひ貴校の教室でも体感してください。
          </p>
        </section>

        <section className="tensaku-section card" id="support">
          <h2>サポート・ご相談</h2>
          <p className="muted">
            以下のフォームから送信いただくと、運営の受信箱（Nexus Learning /{" "}
            <span className="tensaku-en">nexus-learning.com</span>）へメールが届きます。返信はご入力のメールアドレス宛に行います（Resend）。
          </p>
          <p className="muted" style={{ fontSize: "0.88rem" }}>
            デプロイ時は <code>RESEND_API_KEY</code>、<code>RESEND_FROM_EMAIL</code>、<code>SUPPORT_NOTIFY_EMAIL</code> を Cloud Run
            に設定してください（<code>nexus_project/docs/support-email-setup.md</code> と同じ）。
          </p>
          <TensakuKakumeiSupportForm />
        </section>

        <p className="tensaku-footer-note muted">
          ポータルサイト：{" "}
          <a href="https://www.nexus-learning.com" target="_blank" rel="noopener noreferrer">
            www.nexus-learning.com
          </a>
        </p>
      </main>
    </div>
  );
}

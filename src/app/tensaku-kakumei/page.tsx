import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TensakuKakumeiSupportForm } from "./TensakuKakumeiSupportForm";

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

      <main className="tensaku-main">
        <nav className="tensaku-quick" aria-label="教員・運用サイトへの導線">
          <p className="tensaku-quick-intro">
            教員・運用の入口です。生徒の方は、担当の先生からお送りした URL からお進みください。
          </p>
          <div className="tensaku-quick-actions tensaku-quick-actions--solo">
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

        <section className="tensaku-section card" id="sanpou-yoshi">
          <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
            このアプリは単なるツールではなく、<strong>教育現場全体を幸せにする仕組み</strong>であることを大切にしています。
          </p>
          <h2>ツールが優れているだけでは、現場は変わらない。目指すのは「教育版・三方よし」</h2>
          <p style={{ marginTop: 0 }}>
            機能だけを積み上げても、教室の空気は動きません。教師・生徒・社会（開発の知見を託す側）の三方が得をする関係を、ひとつの設計として組み込みます。
          </p>

          <article className="tensaku-value">
            <h3>教師よし</h3>
            <p>
              添削を「苦行」から「楽しさ」へ。時間と体力を取り戻し、指導に集中できる余白をつくります。運用では
              <strong>教員がチケットを購入・管理</strong>
              し、生徒の答案ごとの公開・確定のたびに 1 枚ずつ消費されます（生徒による購入はありません）。
            </p>
          </article>

          <article className="tensaku-value">
            <h3>生徒よし</h3>
            <p>24時間、自分専用の「プロの添削」を。一貫した基準とフィードバックで、学びの手応えを届けます。</p>
          </article>

          <article className="tensaku-value">
            <h3>開発者（社会）よし</h3>
            <p>40年の指導法がAIの翼を得て広がる。現場の知見が形になり、多くの教室に届くことを目指します。</p>
          </article>
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

        <section className="tensaku-section card" id="privacy" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">個人情報の取り扱いと安心について</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            教員・生徒・保護者の皆さまに、<strong>同じ土俵で</strong>お伝えするための内容です。英作文の提出から添削まで、デジタル上に何が残るかを分かりやすくまとめました。
          </p>

          <h3>まず知っていただきたいこと（3点）</h3>
          <ol className="tensaku-list">
            <li>
              <strong>蓄積の中心は「英作文のテキスト（文字データ）」と、そこに基づく添削の結果です。</strong>
            </li>
            <li>
              <strong>手書きの答案を撮影する場合も、システムが長期の提出物として保持し続けるのは、読み取った内容に近い「テキスト」が中心です。</strong>
              筆跡がそのまま残る画像を、提出履歴として溜め続ける設計にはしていません（撮影直後の文字認識のため、一時的に画像が扱われることはあり得ます）。
            </li>
            <li>
              <strong>ログインは Google 等の認証を利用し、アプリ側でパスワードをお預かりする形にはしていません。</strong>
            </li>
          </ol>

          <article className="tensaku-value">
            <h3>生徒の方へ</h3>
            <p>
              学校の案内に沿って初回登録を済ませると、毎回、長い個人情報を打ち込む負担を減らし、学習に集中しやすくなります。あなたの答案は<strong>学習のための英作文</strong>として扱われ、表示や添削の手がかりに使われます。他の人の答案や、教員専用の管理画面に、不適切に触れられる作りにはしていません。
            </p>
          </article>

          <article className="tensaku-value">
            <h3>保護者の方へ</h3>
            <p>
              「手書きの紙の原本が、画像のままネット上に溜まり続けるのでは」という心配に対し、<strong>蓄積の中心は文字化された英作文であり、筆跡そのものの保管を目的とした設計ではない</strong>とお考えください。お子さまの学籍・表示名などの識別は、答案の本文とは分けて管理する考え方です。住所・電話番号など、学習に直接必要ない情報を取りにいく設計にはしていません。お支払いがある場合は専門の決済サービス（例：Stripe）を利用し、クレジット番号がこのアプリのサーバーを通る形にはしていません。
            </p>
          </article>

          <article className="tensaku-value">
            <h3>教員・学校の方へ</h3>
            <p>
              認証は Google 等の基盤に任せ、パスワード管理の負担をアプリ側に増やさない方針です。生徒向けと教員・運用の操作範囲を分け、生徒が誤って管理機能に入ることを想定に止めています。提出物はテキスト中心で説明しやすく、説明責任の範囲を明確にしやすくしています。
            </p>
            <p style={{ marginBottom: 0 }}>
              いずれのシステムにも「リスクゼロ」はありません。アカウントの運用（卒業後の整理、端末の管理など）は、学校のルールとあわせて安全性を高めていくことが大切です。
            </p>
          </article>

          <p className="tensaku-pullquote" style={{ marginTop: 20 }}>
            <strong>一言でまとめると：</strong>
            本アプリが学習の中心として扱うのは、主に英作文のテキストと添削結果です。手書きの画像を提出物として長期保管し続けることは意図していません。身元の情報はプロフィールとして分け、ログインは信頼できる認証に任せることで、学習と管理の役割をはっきり分けています。
          </p>
        </section>

        <section className="tensaku-section card" id="support">
          <h2>サポート・ご相談</h2>
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

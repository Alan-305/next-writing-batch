"use client";

import Link from "next/link";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { TensakuKakumeiSupportForm } from "./TensakuKakumeiSupportForm";

/** 案内サイト本文（スクロール演出のみ Client。文言・構造は page と同一） */
export function TensakuMarketingBody() {
  return (
    <main className="tensaku-main">
      <ScrollReveal className="tensaku-quick" as="nav" aria-label="教員・運用サイトへの導線">
        <p className="tensaku-quick-intro">
          教員・運用の入口です。生徒の方は、担当の先生からお送りした URL からお進みください。
        </p>
        <div className="tensaku-quick-actions tensaku-quick-actions--solo">
          <Link href="/register/teacher?next=%2Fops" className="tensaku-quick-card tensaku-quick-card--teacher">
            <span className="tensaku-quick-card-label">教員・運用</span>
            <span className="tensaku-quick-card-title">運用ハブ・提出一覧・設定</span>
          </Link>
        </div>
      </ScrollReveal>

      <ScrollReveal className="tensaku-section tensaku-section--elevated card" id="vision" as="section"
      >
        <h2>はじめに：開発の想い</h2>
        <h3>40年の教員生活で見えてきた、ひとつの限界</h3>
        <p>
          「先生、英作文の添削をお願いします！」生徒の意欲的な言葉は嬉しい反面、膨大な添削業務は教師の時間を容赦なく奪っていきます。私、松尾直樹は、40年間英語教育に携わる中で、自由英作文の需要が高まるほどに、教師が「一人の人間」として生徒と向き合う時間が削られていく矛盾に悩んできました。そして今も大手予備校の教壇に立ちながら、この経験を生かせる術はないかと考え続けています。
        </p>
        <p>
          「自分の業務を助け、生徒に最良のフィードバックを届けてくれる助っ人はいないか？」その切実な願いから、この<strong>「添削革命」</strong>の開発は始まりました。
        </p>
      </ScrollReveal>

      <ScrollReveal className="tensaku-section tensaku-section--band card" id="sanpou-yoshi" as="section"
      >
        <p className="muted tensaku-section-kicker">
          このアプリは単なるツールではなく、<strong>教育現場全体を幸せにする仕組み</strong>であることを大切にしています。
        </p>
        <h2>ツールが優れているだけでは、現場は変わらない。目指すのは「教育版・三方よし」</h2>
        <p className="tensaku-section-lead">
          機能だけを積み上げても、教室の空気は動きません。教師・生徒・開発者の三方が得をする関係を、ひとつの設計として組み込みます。
        </p>
        <article className="tensaku-value">
          <h3>教師よし</h3>
          <p>
            添削を「苦行」から「楽しさ」へ。時間と体力を取り戻し、指導に集中できる余白をつくります。運用では
            <strong>教員がチケットを購入・管理</strong>
            添削一回につき1枚ずつ消費されます。生徒によるチケットの直接購入はありません。運用方法についてはサポートからご相談ください。
          </p>
        </article>
        <article className="tensaku-value">
          <h3>生徒よし</h3>
          <p>24時間、自分専用の「プロの添削」を。一貫した基準とフィードバックで、学びの手応えを届けます。</p>
        </article>
        <article className="tensaku-value">
          <h3>開発者よし</h3>
          <p>40年の指導法がAIの翼を得て広がる。現場の知見が形になり、多くの教室に届くことを目指します。</p>
        </article>
      </ScrollReveal>

      <ScrollReveal className="tensaku-section tensaku-section--elevated card" id="ai" as="section"
      >
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
      </ScrollReveal>

      <ScrollReveal className="tensaku-section tensaku-section--band card" id="values" as="section"
      >
        <h2>添削革命：3つのコア・バリュー</h2>
        <article className="tensaku-value">
          <h3>1. 教師の知見をシステム化する「精密な採点設定」</h3>
          <p>
            内容、文法・語法の評価基準を学習したAIが「先生の分身」として、ブレずにあっという間に多くの答案の採点下準備をします。
          </p>
        </article>
        <article className="tensaku-value">
          <h3>2. 「口から覚える」を形にするQRコード音声</h3>
          <p>
            言葉は手より耳と口が先！　添削結果には自動でQRコードが付与されます。生徒は自分の書いた英文がブラッシュアップされた完全版を、ネイティブ音声で即座に聞いて真似することができます。
          </p>
        </article>
        <article className="tensaku-value">
          <h3>3. 授業の質を変える「答案分析データ」</h3>
          <p>
            答案を個別に見て終わりではありません。クラス全体の傾向を分析し、「今回の課題では、この表現のミスが多かった」といった<strong>授業のネタ</strong>を先生にお届けします。ポイントを外さない解説授業の助けになります。
          </p>
        </article>
      </ScrollReveal>

      <ScrollReveal className="tensaku-section tensaku-section--elevated card" id="flow" as="section"
      >
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
      </ScrollReveal>

      <ScrollReveal className="tensaku-section tensaku-section--closing card tensaku-closing" id="message" as="section"
      >
        <h2>英語教師の皆様へ</h2>
        <p className="tensaku-closing-title tensaku-en">Put down the red pen.</p>
        <p>
          採点という作業に追われる時間は、もう終わりにしましょう。その時間を、生徒一人ひとりと対話し、英語力がどうすれば伸びるのかを語る時間に変えてください。このアプリは、先生が本来すべき指導に集中するための、現場のパートナーです。
        </p>
        <p>
          長年の知見と最新のAI技術を組み合わせたこの仕組みを、ぜひ貴校の教室でも体感してください。
        </p>
      </ScrollReveal>

      <ScrollReveal
        className="tensaku-section tensaku-section--elevated card"
        id="privacy"
        aria-labelledby="privacy-heading"
        as="section"
      >
        <h2 id="privacy-heading">個人情報の取り扱いと安心について</h2>
        <p className="muted tensaku-section-kicker">
          2026年6月より、生徒の英文提出は<strong>Google ログイン不要の匿名方式</strong>に切り替えました。教員・生徒・保護者の皆さまに、同じ内容を分かりやすくお伝えします。
        </p>
        <h3>まず知っていただきたいこと（3点）</h3>
        <ol className="tensaku-list">
          <li>
            <strong>生徒は Google アカウント登録・学籍番号・氏名・メールアドレスの入力は不要です。</strong>
            担当の先生から共有されたリンクを開き、ニックネーム（任意）と英文を提出するだけで利用できます。
          </li>
          <li>
            <strong>結果の確認は「ニックネーム＋引換ID」だけで行います。</strong>
            引換IDは提出直後に画面に表示されます。本人が大切に保管すれば、あとから添削結果を安全に照会できます。メールアドレスをシステムに登録する必要はありません。
          </li>
          <li>
            <strong>システムに残る中心は、英作文のテキストと添削結果です。</strong>
            手書き答案を撮影する場合も、長期保管の目的は読み取った文字データです。筆跡そのものを提出履歴として溜め続ける設計にはしていません。
          </li>
        </ol>
        <article className="tensaku-value">
          <h3>生徒さんへ</h3>
          <p>
            先生から送られた<strong>招待リンク</strong>を開けば、すぐに英文を提出できます。ログイン画面は出ません。提出後に表示される<strong>ニックネーム</strong>と<strong>引換ID</strong>は、忘れないうちにメモしてください。これが、あなたの添削結果を見るための「合言葉」になります。
          </p>
          <p>
            あなたの答案は<strong>学習のための英作文</strong>として扱われ、担当の先生だけが添削・確認します。他の生徒の答案を見る画面や、教員専用の管理画面に、生徒が入ってしまう作りにはしていません。質問があるときも、メールではなく<strong>提出画面のメッセージボックス</strong>から送れます。返信も同じボックスで確認できます。
          </p>
          <p style={{ marginBottom: 0 }}>
            英文の本文に<strong>学籍番号・氏名・電話番号などの個人情報は書かないでください</strong>。学習内容だけを書くことで、より安心して使えます。
          </p>
        </article>
        <article className="tensaku-value">
          <h3>保護者の皆様へ</h3>
          <p>
            本サービスでは、お子さまの<strong>Google アカウントやメールアドレス、学籍番号を登録しません</strong>。英文の提出と結果確認は、学校から配布されたリンクと、提出時に表示される個別の引換IDで行います。連絡先のリストをシステム側に蓄積しないため、メール一括流出のようなリスクを構造的に抑えています。
          </p>
          <p>
            イメージとしては、「仮名で英文を提出し、本人だけが持つ引換券で後から結果を読む」方式に近いものです。担当教員は指導のため提出内容を確認しますが、これは通常の英作文添削と同じ範囲の学校業務です。お子さまには、引換IDを<strong>他人に見せない・SNSに載せない</strong>よう、ご家庭でもお声がけいただけると安心です。
          </p>
          <p style={{ marginBottom: 0 }}>
            手書きの紙の答案が、画像のままネット上に長期保存され続ける設計ではありません。蓄積の中心は文字化された英作文と添削結果です。
          </p>
        </article>
        <article className="tensaku-value">
          <h3>教員・学校の方へ</h3>
          <p>
            教員・運用担当のみ Google ログインを利用します。生徒向けの招待リンクは<strong>クラス（テナント）ごと</strong>に発行され、リンクを知る生徒だけが提出できます。公開掲示板のように不特定多数が閲覧・投稿できる場所ではありません。
          </p>
          <p>
            生徒の識別はニックネームと引換IDに限定し、アカウント情報と英文を同一 ID で結び付けない設計にしています。サポートの質問・返信もアプリ内メッセージで完結し、生徒のメールアドレスを取得しません。添削の最終確認は従来どおり<strong>教員が行う（Teacher-in-the-loop）</strong>運用です。
          </p>
          <p style={{ marginBottom: 0 }}>
            利用料のお支払いは Stripe を利用し、クレジット番号がこのアプリのサーバーを通る形にはしていません。いずれのシステムにも「リスクゼロ」はありませんが、提出前に「英文に個人情報を書かない」旨を周知いただくことで、さらに安全性を高められます。
          </p>
        </article>
        <p className="tensaku-pullquote tensaku-pullquote--closing">
          <strong>一言でまとめると：</strong>
          生徒はログインせず英文を提出し、本人だけが持つ引換IDで結果を確認します。メール・学籍・本名は取らず、学習に必要な英文と添削結果だけを、担当教員のもとで大切に扱います。
        </p>
      </ScrollReveal>

      <ScrollReveal className="tensaku-section tensaku-section--band card" id="support" as="section">
        <h2>サポート・ご相談</h2>
        <TensakuKakumeiSupportForm />
      </ScrollReveal>

      <p className="tensaku-footer-note muted">
        ポータルサイト：{" "}
        <a href="https://www.nexus-learning.com" target="_blank" rel="noopener noreferrer">
          www.nexus-learning.com
        </a>
      </p>
    </main>
  );
}

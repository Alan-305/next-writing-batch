import type { LegalBusinessInfo } from "@/lib/legal/business-info";
import { legalCell } from "@/lib/legal/business-info";
import { LEGAL_PATHS } from "@/lib/legal/paths";

type Props = {
  info: LegalBusinessInfo;
};

export function RefundPolicyView({ info }: Props) {
  const email = legalCell(info.email);

  return (
    <div className="legal-prose">
      <p className="legal-prose-lead">
        デジタルコンテンツおよびサービスの性質上、原則として返金を受け付けない旨を明記しつつ、システム不具合時の救済措置を定めます。
      </p>

      <section aria-labelledby="legal-refund-1">
        <h2 id="legal-refund-1">1. 原則としての返品・返金不可</h2>
        <p>
          提供する商品の性質上（デジタルサービスおよび都度消費型チケット）、購入手続き完了後におけるユーザー都合によるキャンセル、返品、返金、および他プランへの変更には応じられません。画面表示のパック内容、価格、および動作環境をよくご確認の上、ご購入ください。
        </p>
      </section>

      <section aria-labelledby="legal-refund-2">
        <h2 id="legal-refund-2">2. 試験運用期間中の調整に関する同意</h2>
        <p>
          本サービスは現在試験運用中（β版）であり、事前の予告なく仕様、機能、またはチケット消費のルールが調整・変更される場合があります。これに伴う返金や補償には応じかねますので、あらかじめご了承の上ご利用ください。
        </p>
      </section>

      <section aria-labelledby="legal-refund-3">
        <h2 id="legal-refund-3">3. システム不具合時の対応</h2>
        <p>
          万が一、決済が完了したにもかかわらずチケットが付与されない場合、またはシステムの致命的な不具合によりチケットが正常に消費されず消失した場合は、事実関係を調査の上、以下の通り対応いたします。
        </p>
        <ul className="legal-prose-bullets">
          <li>
            不具合が当方のシステム起因であると確認された場合、不具合のあった回数分のチケットをアカウントへ再付与（補填）いたします。
          </li>
          <li>
            システムエラー等によりサービス自体が継続不可能となった場合に限り、未消費分のチケットに相当する額を合理的な方法で返金いたします。この場合の返金手数料は当方が負担します。
          </li>
        </ul>
      </section>

      <section aria-labelledby="legal-refund-4">
        <h2 id="legal-refund-4">4. お問い合わせ窓口</h2>
        <p>
          チケットの不具合、付与漏れに関するご連絡は、アプリ内の「お問い合わせフォーム」
          {email ? (
            <>
              {" "}
              または <a href={`mailto:${email}`}>{email}</a>
            </>
          ) : null}
          までご連絡ください。5営業日以内に確認・対応いたします。
        </p>
        <p className="muted legal-prose-note">
          特定商取引法に基づく表記は{" "}
          <a href={LEGAL_PATHS.tokushoho}>こちら</a>{" "}
          をご覧ください。
        </p>
      </section>
    </div>
  );
}

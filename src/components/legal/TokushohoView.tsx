import Link from "next/link";
import type { ReactNode } from "react";

import type { LegalBusinessInfo } from "@/lib/legal/business-info";
import { legalCell } from "@/lib/legal/business-info";
import { LEGAL_PATHS } from "@/lib/legal/paths";
import { TICKET_BILLING_PLANS, validityLabel } from "@/lib/legal/ticket-billing-plans";

type Props = {
  info: LegalBusinessInfo;
};

function emptyCell(value: string): ReactNode {
  const text = legalCell(value);
  return text || null;
}

export function TokushohoView({ info }: Props) {
  const email = legalCell(info.email);

  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: "販売業者 / 運営者", value: emptyCell(info.sellerName) },
    {
      label: "所在地",
      value: info.addressDisclosureNote ? (
        <>
          {emptyCell(info.address)}
          {info.addressDisclosureNote ? (
            <>
              <br />
              <span className="muted legal-prose-note">{info.addressDisclosureNote}</span>
            </>
          ) : null}
        </>
      ) : (
        emptyCell(info.address)
      ),
    },
    { label: "電話番号", value: emptyCell(info.phone) },
    {
      label: "メールアドレス",
      value: email ? <a href={`mailto:${email}`}>{email}</a> : null,
    },
    { label: "運営責任者", value: emptyCell(info.representative) },
    {
      label: "商品の販売価格",
      value: (
        <>
          <p style={{ marginTop: 0 }}>画面に表示された価格（消費税込み）に基づきます。</p>
          <p className="legal-prose-subheading">【プラン一覧】</p>
          <ul className="legal-prose-bullets">
            {TICKET_BILLING_PLANS.map((plan) => (
              <li key={plan.plan}>
                {plan.label}（{plan.tickets}回分）：{plan.priceLabel}（税込）／有効期限 {validityLabel(plan.validityDays)}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      label: "商品代金以外の必要料金",
      value: "アプリ利用時、および本サイト閲覧時に発生するインターネット接続料金、通信料金はユーザーのご負担となります。",
    },
    {
      label: "代金の支払時期・支払方法",
      value: (
        <>
          <p className="legal-prose-subheading" style={{ marginTop: 0 }}>
            【支払方法】
          </p>
          <p>クレジットカード決済（Stripe を利用）</p>
          <p className="legal-prose-subheading">【支払時期】</p>
          <p style={{ marginBottom: 0 }}>
            購入ボタンを押し、決済手続きが完了した時点で即時決済となります。
          </p>
        </>
      ),
    },
    {
      label: "商品の引き渡し時期",
      value:
        "購入手続き完了後、システムによる決済確認が取れ次第、アカウントに即時付与され、利用可能となります。",
    },
  ];

  return (
    <div className="legal-prose">
      <p className="legal-prose-lead">
        消費者に有料でデジタルコンテンツ（サービス）を提供する場合、法律上公開が義務付けられている項目です。販売者情報、価格、支払時期などを明記します。
      </p>

      <div className="legal-table-wrap">
        <table className="legal-table legal-table--tokushoho">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted legal-prose-note">
        返品・返金については{" "}
        <Link href={LEGAL_PATHS.refund}>返金ポリシー</Link>{" "}
        をご確認ください。
      </p>
    </div>
  );
}

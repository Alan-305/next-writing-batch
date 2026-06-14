import Link from "next/link";

import { LEGAL_DOCUMENT_LABELS, LEGAL_PATHS } from "@/lib/legal/paths";
import { TICKET_BILLING_PLANS, validityLabel } from "@/lib/legal/ticket-billing-plans";

export function TicketTermsView() {
  return (
    <div className="legal-prose">
      <p className="legal-prose-lead">
        本ページは、教員向け英作文等添削支援サービス「添削革命」における
        <strong>有料チケット購入</strong>に関する利用規約の抜粋です。アプリ全体の利用規約がある場合は、料金・決済の章に以下を組み込みます。
      </p>

      <section aria-labelledby="legal-terms-art1">
        <h2 id="legal-terms-art1">第1条（チケットの購入および付与）</h2>
        <ol className="legal-prose-list">
          <li>
            登録教員（以下「ユーザー」といいます）は、本サービス内で提示される料金プランに従い、添削チケット（以下「チケット」といいます）を購入することができます。
          </li>
          <li>
            チケットは、購入手続きが完了し、当方が決済を確認した時点で、ログイン中の教員アカウントに対して付与されます。
          </li>
          <li>
            初回教員登録時に付与される5枚の無料チケットは、本サービスの体験用であり、有料で購入されたチケットに先立って消費されます。
          </li>
        </ol>
      </section>

      <section aria-labelledby="legal-terms-art2">
        <h2 id="legal-terms-art2">第2条（チケットの消費）</h2>
        <ol className="legal-prose-list">
          <li>
            チケットは、ユーザーが作成した生徒の添削結果を「公開」または「確定」する操作を行うたびに、ユーザーの保有残高から1枚ずつ消費されます。
          </li>
          <li>
            一度消費されたチケットは、添削内容の成否にかかわらず、次条に定める場合を除き、原則として返還されません。
          </li>
        </ol>
      </section>

      <section aria-labelledby="legal-terms-art3">
        <h2 id="legal-terms-art3">第3条（チケットの有効期限）</h2>
        <ol className="legal-prose-list">
          <li>
            購入されたチケットの有効期限は、購入日（付与日）から起算し、購入プランに応じて次のとおりとします。
          </li>
        </ol>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">プラン</th>
                <th scope="col">枚数</th>
                <th scope="col">有効期限</th>
              </tr>
            </thead>
            <tbody>
              {TICKET_BILLING_PLANS.map((plan) => (
                <tr key={plan.plan}>
                  <td>{plan.label}</td>
                  <td>{plan.tickets}枚</td>
                  <td>{validityLabel(plan.validityDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          有効期限を経過したチケットは自動的に消滅し、払い戻しや補償は行われません。初回登録特典の無料チケット（5枚）の有効期限は、10枚パックと同じ{validityLabel(TICKET_BILLING_PLANS[0].validityDays)}とします。
        </p>
      </section>

      <section aria-labelledby="legal-terms-art4">
        <h2 id="legal-terms-art4">第4条（禁止事項および利用制限）</h2>
        <ol className="legal-prose-list">
          <li>
            ユーザーは、保有するチケットを第三者に転売、譲渡、貸与、または他のアカウントに移転させることはできません。不適切な利用が発覚した場合、当方は事前の通知なくアカウントの停止およびチケットの失効手続きを行うことができるものとします。
          </li>
        </ol>
      </section>

      <section aria-labelledby="legal-terms-plans">
        <h2 id="legal-terms-plans">料金プラン（参考）</h2>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>
                <th scope="col">プラン</th>
                <th scope="col">内容</th>
                <th scope="col">価格（税込）</th>
                <th scope="col">有効期限</th>
              </tr>
            </thead>
            <tbody>
              {TICKET_BILLING_PLANS.map((plan) => (
                <tr key={plan.plan}>
                  <td>{plan.label}</td>
                  <td>{plan.tickets}回分</td>
                  <td>{plan.priceLabel}</td>
                  <td>{validityLabel(plan.validityDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted legal-prose-note">
          詳細は{" "}
          <Link href={LEGAL_PATHS.tokushoho}>{LEGAL_DOCUMENT_LABELS.tokushoho}</Link>{" "}
          および{" "}
          <Link href={LEGAL_PATHS.refund}>{LEGAL_DOCUMENT_LABELS.refund}</Link>{" "}
          もあわせてご確認ください。
        </p>
      </section>
    </div>
  );
}

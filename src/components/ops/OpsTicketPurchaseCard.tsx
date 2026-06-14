"use client";

import { useMemo, useState } from "react";

import { LegalPurchaseLinks } from "@/components/legal/LegalPurchaseLinks";
import { createStripeCheckoutSession, type BillingPlan } from "@/lib/billing/create-checkout-session";
import { TICKET_BILLING_PLANS, validityLabel } from "@/lib/legal/ticket-billing-plans";

export function OpsTicketPurchaseCard() {
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>("t10");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [legalConsent, setLegalConsent] = useState(false);

  const selectedPlanInfo = useMemo(
    () => TICKET_BILLING_PLANS.find((item) => item.plan === selectedPlan) ?? TICKET_BILLING_PLANS[0],
    [selectedPlan],
  );

  const canCheckout = legalConsent && !checkoutBusy;

  const handleCheckout = async () => {
    if (!legalConsent) return;
    setCheckoutError("");
    setCheckoutBusy(true);
    try {
      const origin = window.location.origin;
      const result = await createStripeCheckoutSession({
        plan: selectedPlan,
        successUrl: `${origin}/ops/tickets?checkout=success`,
        cancelUrl: `${origin}/ops/tickets?checkout=cancel`,
      });
      if (!result.url) throw new Error("Checkout URL が取得できませんでした。");
      window.location.assign(result.url);
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "決済画面の起動に失敗しました。");
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <div className="card admin-tenant-roster-card" style={{ marginBottom: 16 }}>
      <p className="muted admin-tenant-roster-lead">
        <strong>初回の教員登録時に 5 枚無料</strong>が付与されます。ここで購入したチケットは
        <strong>ログイン中の教員アカウント</strong>
        に付与されます。生徒の添削を公開・確定するたびに、この残数から 1 枚ずつ消費されます。
      </p>
      <div className="student-settings-plan-grid" role="radiogroup" aria-label="購入プラン">
        {TICKET_BILLING_PLANS.map((option) => (
          <label key={option.plan} className="student-settings-plan-option">
            <input
              type="radio"
              name="ops-billing-plan"
              value={option.plan}
              checked={selectedPlan === option.plan}
              onChange={() => setSelectedPlan(option.plan)}
              disabled={checkoutBusy}
            />
            <span>{option.label}</span>
            <span>
              {option.tickets}回 / {option.priceLabel}
            </span>
            <span className="muted student-settings-plan-validity">有効期限 {validityLabel(option.validityDays)}</span>
          </label>
        ))}
      </div>

      <div className="legal-purchase-consent">
        <p className="muted legal-purchase-consent-intro" style={{ marginTop: 0 }}>
          購入に進む前に、<LegalPurchaseLinks /> をご確認ください（試験運用中のため、内容は調整する場合があります）。
        </p>
        <label className="legal-purchase-consent-label">
          <input
            type="checkbox"
            checked={legalConsent}
            onChange={(e) => setLegalConsent(e.target.checked)}
            disabled={checkoutBusy}
          />
          <span>
            上記内容および利用規約・特定商取引法に基づく表記・返金ポリシーに同意して購入する
          </span>
        </label>
      </div>

      <p style={{ marginBottom: 0 }}>
        <button type="button" disabled={!canCheckout} onClick={() => void handleCheckout()}>
          {checkoutBusy
            ? "決済画面を準備中..."
            : `${selectedPlanInfo.label}プランで購入（${selectedPlanInfo.priceLabel}）`}
        </button>
      </p>
      {checkoutError ? <p className="admin-tenant-roster-error">{checkoutError}</p> : null}
    </div>
  );
}

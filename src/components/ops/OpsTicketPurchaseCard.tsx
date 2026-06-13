"use client";

import { useMemo, useState } from "react";

import { createStripeCheckoutSession, type BillingPlan } from "@/lib/billing/create-checkout-session";

const PLAN_OPTIONS: Array<{ plan: BillingPlan; label: string; priceLabel: string; tickets: number }> = [
  { plan: "t10", label: "10枚パック", priceLabel: "4,000円", tickets: 10 },
  { plan: "t30", label: "30枚パック", priceLabel: "10,000円", tickets: 30 },
  { plan: "t60", label: "60枚パック", priceLabel: "18,000円", tickets: 60 },
  { plan: "t120", label: "120枚パック", priceLabel: "30,000円", tickets: 120 },
];

export function OpsTicketPurchaseCard() {
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>("t10");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const selectedPlanInfo = useMemo(
    () => PLAN_OPTIONS.find((item) => item.plan === selectedPlan) ?? PLAN_OPTIONS[0],
    [selectedPlan],
  );

  const handleCheckout = async () => {
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
        {PLAN_OPTIONS.map((option) => (
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
          </label>
        ))}
      </div>
      <p style={{ marginBottom: 0 }}>
        <button type="button" disabled={checkoutBusy} onClick={() => void handleCheckout()}>
          {checkoutBusy
            ? "決済画面を準備中..."
            : `${selectedPlanInfo.label}プランで購入（${selectedPlanInfo.priceLabel}）`}
        </button>
      </p>
      <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: "0.92rem" }}>
        購入に進む前に、利用規約・特定商取引法に基づく表記・返金ポリシーをご確認ください（試験運用中のため、内容は調整する場合があります）。
      </p>
      {checkoutError ? <p className="admin-tenant-roster-error">{checkoutError}</p> : null}
    </div>
  );
}

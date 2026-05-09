"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FirebaseError } from "firebase/app";
import { useSearchParams } from "next/navigation";
import { onSnapshot } from "firebase/firestore";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { createStripeCheckoutSession, type BillingPlan } from "@/lib/billing/create-checkout-session";
import type { BillingInfo } from "@/lib/firebase/types";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import { userProfileRef } from "@/lib/firebase/firestore-paths";

const PLAN_OPTIONS: Array<{ plan: BillingPlan; label: string; priceLabel: string; tickets: number }> = [
  { plan: "1m", label: "1ヶ月", priceLabel: "2,000円", tickets: 5 },
  { plan: "3m", label: "3ヶ月", priceLabel: "5,700円", tickets: 15 },
  { plan: "6m", label: "6ヶ月", priceLabel: "10,000円", tickets: 30 },
  { plan: "12m", label: "1年", priceLabel: "18,000円", tickets: 60 },
];

export default function SettingsPage() {
  const { user, signOutUser } = useFirebaseAuthContext();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>("1m");
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const checkoutResult = searchParams.get("checkout");
  const [billing, setBilling] = useState<BillingInfo | null>(null);

  const selectedPlanInfo = useMemo(
    () => PLAN_OPTIONS.find((item) => item.plan === selectedPlan) ?? PLAN_OPTIONS[0],
    [selectedPlan],
  );

  useEffect(() => {
    if (!user) {
      setBilling(null);
      return;
    }
    const db = getFirebaseFirestore();
    if (!db) return;
    const ref = userProfileRef(db, user.uid);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setBilling(null);
          return;
        }
        const data = (snap.data() ?? {}) as { billing?: BillingInfo };
        setBilling((data.billing ?? null) as BillingInfo | null);
      },
      () => setBilling(null),
    );
  }, [user]);

  const handleStartCheckout = async () => {
    if (!user) {
      setCheckoutError("購入するにはログインしてください。");
      return;
    }
    setIsLoadingCheckout(true);
    setCheckoutError(null);
    try {
      const origin = window.location.origin;
      const result = await createStripeCheckoutSession({
        plan: selectedPlan,
        successUrl: `${origin}/settings?checkout=success`,
        cancelUrl: `${origin}/settings?checkout=cancel`,
      });
      if (!result.url) {
        throw new Error("Checkout URL が取得できませんでした。");
      }
      window.location.assign(result.url);
    } catch (error) {
      console.error("[billing] createStripeCheckoutSession failed", error);
      const message = mapCheckoutErrorMessage(error);
      setCheckoutError(message);
    } finally {
      setIsLoadingCheckout(false);
    }
  };

  return (
    <main>
      <h1>設定</h1>
      <div className="card student-settings-card">
        <nav className="student-settings-nav" aria-label="よく使う画面">
          <Link href="/submit">提出画面へ</Link>
          {" · "}
          <Link href="/settings/profile">プロフィール編集</Link>
        </nav>
        <p className="muted student-settings-hint">
          添削結果を PDF にしたいときは、結果ページで Mac は ⌘P、Windows は Ctrl+P から「PDF に保存」を選びます。
        </p>
        {checkoutResult === "success" ? (
          <p className="student-settings-billing-result student-settings-billing-result--success" role="status">
            決済が完了しました。チケットを反映中です。反映されない場合は数秒後に再読み込みしてください。
          </p>
        ) : null}
        {checkoutResult === "cancel" ? (
          <p className="student-settings-billing-result student-settings-billing-result--cancel" role="status">
            決済はキャンセルされました。プランを選び直して再度お試しください。
          </p>
        ) : null}
        <section className="student-settings-billing" aria-label="チケット残高">
          <h2>チケット残高</h2>
          <p className="muted student-settings-billing-lead" style={{ marginBottom: 8 }}>
            添削を実行するとチケットが減ります。残りは自動で更新されます。
          </p>
          <p style={{ marginTop: 0 }}>
            残り: <strong>{typeof billing?.tickets === "number" ? billing.tickets : "—"}</strong>
          </p>
          <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>
            直近の消費:{" "}
            {typeof billing?.lastProofreadTicketConsume === "number" ? billing.lastProofreadTicketConsume : "—"} /{" "}
            {billing?.lastProofreadTicketAt ? "記録あり" : "—"}
          </p>
        </section>
        <section className="student-settings-billing" aria-label="チケット購入">
          <h2>チケット購入（テスト）</h2>
          <p className="muted student-settings-billing-lead">
            プランを選ぶと Stripe Checkout（テスト）へ移動します。
          </p>
          <div className="student-settings-plan-grid" role="radiogroup" aria-label="購入プラン">
            {PLAN_OPTIONS.map((option) => (
              <label key={option.plan} className="student-settings-plan-option">
                <input
                  type="radio"
                  name="billing-plan"
                  value={option.plan}
                  checked={selectedPlan === option.plan}
                  onChange={() => setSelectedPlan(option.plan)}
                  disabled={isLoadingCheckout}
                />
                <span>{option.label}</span>
                <span>{option.tickets}回 / {option.priceLabel}</span>
              </label>
            ))}
          </div>
          <button type="button" disabled={isLoadingCheckout} onClick={() => void handleStartCheckout()}>
            {isLoadingCheckout
              ? "決済画面を準備中..."
              : `${selectedPlanInfo.label}プランで購入（${selectedPlanInfo.priceLabel}）`}
          </button>
          <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: "0.92rem" }}>
            購入に進む前に、利用規約・特定商取引法に基づく表記・返金ポリシーをご確認ください（試験運用中のため、内容は調整する場合があります）。
          </p>
          {checkoutError ? <p className="student-settings-billing-error">{checkoutError}</p> : null}
        </section>
        <div className="student-settings-account">
          <span className="muted student-settings-account-label">ログイン中</span>
          <p className="student-settings-email">{user?.email ?? user?.uid ?? "—"}</p>
          <button type="button" onClick={() => void signOutUser()}>
            ログアウト
          </button>
        </div>
      </div>
    </main>
  );
}

function mapCheckoutErrorMessage(error: unknown): string {
  const code = (error as FirebaseError | undefined)?.code ?? "";
  const rawMessage = (error as Error | undefined)?.message ?? "";

  if (code === "functions/failed-precondition") {
    return "決済設定が未完了です。STRIPE_PRICE_1M/3M/6M/12M と STRIPE_SECRET_KEY を確認してください。";
  }
  if (code === "functions/unauthenticated") {
    return "ログイン状態を確認してから再度お試しください。";
  }
  if (code === "functions/unavailable") {
    return "決済APIに接続できません。Functions Emulator 起動または Functions デプロイ状態を確認してください。";
  }
  if (code === "functions/internal") {
    return "サーバー内部エラーです。Functionsログを確認してください（Stripe鍵やPrice ID未設定の可能性があります）。";
  }
  if (rawMessage.trim().length > 0) {
    return rawMessage;
  }
  return "決済画面の起動に失敗しました。";
}

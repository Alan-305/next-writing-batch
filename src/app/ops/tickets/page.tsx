"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createStripeCheckoutSession, type BillingPlan } from "@/lib/billing/create-checkout-session";
import { getFirebaseAuth } from "@/lib/firebase/client";

type TicketRow = {
  uid: string;
  displayLabel: string;
  email: string | null;
  kind: "teacher" | "student";
  tickets: number;
  lastProofreadTicketConsume: number | null;
  lastProofreadTicketAt: string | null;
};

type Payload = {
  ok?: boolean;
  organizationId?: string;
  teachers?: TicketRow[];
  students?: TicketRow[];
  teacherCount?: number;
  studentCount?: number;
  note?: string;
  message?: string;
};

const PLAN_OPTIONS: Array<{ plan: BillingPlan; label: string; priceLabel: string; tickets: number }> = [
  { plan: "t10", label: "10枚パック", priceLabel: "4,000円", tickets: 10 },
  { plan: "t30", label: "30枚パック", priceLabel: "10,000円", tickets: 30 },
  { plan: "t60", label: "60枚パック", priceLabel: "18,000円", tickets: 60 },
  { plan: "t120", label: "120枚パック", priceLabel: "30,000円", tickets: 120 },
];

function formatIso(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

function OpsTicketsPageInner() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>("t10");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [tenantIdCopied, setTenantIdCopied] = useState(false);
  const searchParams = useSearchParams();
  const tenantCreatedWelcome = searchParams.get("tenantCreated") === "1";

  const selectedPlanInfo = useMemo(
    () => PLAN_OPTIONS.find((item) => item.plan === selectedPlan) ?? PLAN_OPTIONS[0],
    [selectedPlan],
  );
  const inviteUrl =
    typeof window !== "undefined" && data?.organizationId
      ? `${window.location.origin}/sign-in?next=${encodeURIComponent("/submit")}&org=${encodeURIComponent(
          data.organizationId,
        )}`
      : "";
  const inviteMailTo = inviteUrl
    ? `mailto:?subject=${encodeURIComponent("添削革命 招待リンク")}&body=${encodeURIComponent(
        `以下のリンクからログインしてください。\n\n${inviteUrl}\n\n※Googleアカウントでログインしてください。`,
      )}`
    : "";
  const inviteQrUrl = inviteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(inviteUrl)}`
    : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const user = getFirebaseAuth()?.currentUser;
      if (!user) {
        setError("ログイン情報を取得できませんでした。再読み込みしてください。");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/tenant-ticket-roster", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json()) as Payload;
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "チケット一覧の取得に失敗しました。");
        return;
      }
      setData(j);
    } catch {
      setError("通信エラーでチケット一覧を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setInviteCopied(false);
    }
  };

  const copyTenantId = async () => {
    const id = (data?.organizationId ?? "").trim();
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setTenantIdCopied(true);
      window.setTimeout(() => setTenantIdCopied(false), 1800);
    } catch {
      setTenantIdCopied(false);
    }
  };

  const renderList = (items: TicketRow[], role: "teacher" | "student") => {
    if (items.length === 0) return <p className="muted">該当ユーザーがいません。</p>;
    return (
      <ul className="admin-roster-list">
        {items.map((m) => (
          <li key={m.uid}>
            <span>
              {m.displayLabel}{" "}
              <span className="muted admin-roster-meta">
                <code>{m.uid.slice(0, 8)}…</code>
                {m.email ? ` · ${m.email}` : ""}
                {role === "teacher" ? (
                  <>
                    {" · "}
                    残り <strong>{m.tickets}</strong>
                    {m.lastProofreadTicketConsume != null ? ` · 直近消費 ${m.lastProofreadTicketConsume}` : ""}
                    {m.lastProofreadTicketAt ? ` · ${formatIso(m.lastProofreadTicketAt)}` : ""}
                  </>
                ) : (
                  <span> · 添削の確定ごとに教員のチケットから消費されます</span>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <main>
      <h1>テナントのチケット状況</h1>

      {tenantCreatedWelcome ? (
        <p className="success" style={{ marginBottom: 16 }}>
          テナントを作成しました。下記の「テナント ID」を控えてください（サポートや設定確認に使います）。
        </p>
      ) : null}

      <div className="card admin-tenant-roster-card" style={{ marginBottom: 16 }}>
        <h2 className="admin-roster-subheading" style={{ marginTop: 0 }}>
          あなたのテナント ID
        </h2>
        <p className="muted admin-tenant-roster-lead">
          提出・チケット・招待はこの ID（Firestore の <code>organizationId</code>）単位で分かれます。
        </p>
        <p style={{ wordBreak: "break-all", marginTop: 0 }}>
          <code>{loading ? "読み込み中..." : data?.organizationId ?? "—"}</code>
        </p>
        <p style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 0 }}>
          <button type="button" onClick={() => void copyTenantId()} disabled={loading || !data?.organizationId}>
            {tenantIdCopied ? "コピーしました" : "テナント ID をコピー"}
          </button>
        </p>
      </div>

      <div className="card admin-tenant-roster-card" style={{ marginBottom: 16 }}>
        <h2 className="admin-roster-subheading" style={{ marginTop: 0 }}>
          生徒招待リンク（テナント参加）
        </h2>
        <p className="muted admin-tenant-roster-lead">
          生徒にこのリンクを共有すると、ログイン時に現在のテナント（organizationId）へ紐づきます。
        </p>
        <p style={{ wordBreak: "break-all", marginTop: 0 }}>
          <code>{inviteUrl || "読み込み中..."}</code>
        </p>
        <p style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 0 }}>
          <button type="button" onClick={() => void copyInvite()} disabled={!inviteUrl}>
            {inviteCopied ? "コピーしました" : "リンクをコピー"}
          </button>
          <a className="button secondary" href={inviteMailTo || "#"} onClick={(e) => !inviteMailTo && e.preventDefault()}>
            メールで共有
          </a>
        </p>
        {inviteQrUrl ? (
          <div>
            <img src={inviteQrUrl} alt="生徒招待リンクのQRコード" width={220} height={220} />
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              生徒の端末でQRを読み取ってもらうと、同じ招待リンクを開けます。
            </p>
          </div>
        ) : null}
      </div>

      <div className="card admin-tenant-roster-card" style={{ marginBottom: 16 }}>
        <h2 className="admin-roster-subheading" style={{ marginTop: 0 }}>
          教師チケット購入
        </h2>
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

      <div className="card admin-tenant-roster-card">
        {loading ? <p className="muted">読み込み中…</p> : null}
        {error ? (
          <p className="admin-tenant-roster-error" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && data?.ok ? (
          <>
            <p className="muted admin-tenant-roster-lead">
              テナント <code>{data.organizationId ?? "—"}</code> の教員（チケット残高）と登録生徒です。
            </p>
            <div className="admin-roster-columns">
              <div>
                <h2 className="admin-roster-subheading">
                  教員・運用{" "}
                  <span className="admin-roster-count">{data.teacherCount ?? data.teachers?.length ?? 0} 名</span>
                </h2>
                {renderList(data.teachers ?? [], "teacher")}
              </div>
              <div>
                <h2 className="admin-roster-subheading">
                  生徒（想定）{" "}
                  <span className="admin-roster-count">{data.studentCount ?? data.students?.length ?? 0} 名</span>
                </h2>
                {renderList(data.students ?? [], "student")}
              </div>
            </div>
            {data.note ? (
              <p className="muted admin-tenant-roster-note" style={{ marginBottom: 0 }}>
                {data.note}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

export default function OpsTicketsPage() {
  return (
    <Suspense fallback={<main><p className="muted">読み込み中…</p></main>}>
      <OpsTicketsPageInner />
    </Suspense>
  );
}

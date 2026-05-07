"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type GrantHistoryRow = {
  id: string;
  targetUid: string;
  targetDisplayLabel?: string;
  targetEmail?: string | null;
  amount: number;
  note: string | null;
  organizationId: string | null;
  createdAt: string | null;
  targetKind: string;
};

const PLAN_OPTIONS: Array<{ plan: BillingPlan; label: string; priceLabel: string; tickets: number }> = [
  { plan: "1m", label: "1ヶ月", priceLabel: "2,000円", tickets: 5 },
  { plan: "3m", label: "3ヶ月", priceLabel: "5,700円", tickets: 15 },
  { plan: "6m", label: "6ヶ月", priceLabel: "10,000円", tickets: 30 },
  { plan: "12m", label: "1年", priceLabel: "18,000円", tickets: 60 },
];

function formatIso(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

export default function OpsTicketsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>("1m");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [targetUid, setTargetUid] = useState("");
  const [grantAmount, setGrantAmount] = useState("1");
  const [grantNote, setGrantNote] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [grantResult, setGrantResult] = useState("");
  const [history, setHistory] = useState<GrantHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);

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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const user = getFirebaseAuth()?.currentUser;
      if (!user) {
        setHistoryError("配布履歴の取得に失敗しました（未ログイン）。");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/ticket-grants?limit=30", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; history?: GrantHistoryRow[] };
      if (!res.ok || !j?.ok) {
        setHistoryError(j?.message ?? "配布履歴の取得に失敗しました。");
        return;
      }
      setHistory(Array.isArray(j.history) ? j.history : []);
    } catch {
      setHistoryError("通信エラーで配布履歴を取得できませんでした。");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

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

  const handleGrant = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setGrantError("");
    setGrantResult("");
    const uid = targetUid.trim();
    const amount = Number.parseInt(grantAmount.trim(), 10);
    if (!uid) {
      setGrantError("配布先の生徒を選択してください。");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setGrantError("配布枚数は 1 以上の整数で入力してください。");
      return;
    }
    setGrantBusy(true);
    try {
      const user = getFirebaseAuth()?.currentUser;
      if (!user) throw new Error("ログイン情報を取得できませんでした。");
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/ticket-grants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUid: uid,
          amount,
          note: grantNote.trim() || undefined,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        message?: string;
        amount?: number;
        fromTicketsAfter?: number;
        targetTicketsAfter?: number;
      };
      if (!res.ok || !j?.ok) {
        setGrantError(j?.message ?? "配布に失敗しました。");
        return;
      }
      setGrantResult(
        `${j.amount ?? amount}枚配布しました。配布元残り: ${j.fromTicketsAfter ?? "—"} / 生徒残り: ${j.targetTicketsAfter ?? "—"}`,
      );
      setGrantAmount("1");
      setGrantNote("");
      await load();
      await loadHistory();
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : "配布に失敗しました。");
    } finally {
      setGrantBusy(false);
    }
  };

  const renderList = (items: TicketRow[]) => {
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
                {" · "}
                残り <strong>{m.tickets}</strong>
                {m.lastProofreadTicketConsume != null ? ` · 直近消費 ${m.lastProofreadTicketConsume}` : ""}
                {m.lastProofreadTicketAt ? ` · ${formatIso(m.lastProofreadTicketAt)}` : ""}
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
          ここで購入したチケットは、ログイン中の教員アカウントに付与されます。
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

      <div className="card admin-tenant-roster-card" style={{ marginBottom: 16 }}>
        <h2 className="admin-roster-subheading" style={{ marginTop: 0 }}>
          生徒へチケット配布
        </h2>
        <p className="muted admin-tenant-roster-lead">
          同一テナントの生徒にのみ配布できます。配布した分は教員の残チケットから減算されます。
        </p>
        <form onSubmit={(e) => void handleGrant(e)}>
          <div className="field">
            <span>配布先（生徒）</span>
            <select value={targetUid} onChange={(e) => setTargetUid(e.target.value)} disabled={grantBusy}>
              <option value="">選択してください</option>
              {(data?.students ?? []).map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.displayLabel}（残り {s.tickets}）
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span>配布枚数</span>
            <input
              type="number"
              min={1}
              step={1}
              value={grantAmount}
              onChange={(e) => setGrantAmount(e.target.value)}
              disabled={grantBusy}
            />
          </div>
          <div className="field">
            <span>メモ（任意）</span>
            <input value={grantNote} onChange={(e) => setGrantNote(e.target.value)} disabled={grantBusy} />
          </div>
          <p style={{ marginBottom: 0 }}>
            <button type="submit" disabled={grantBusy}>
              {grantBusy ? "配布中..." : "チケットを配布する"}
            </button>
          </p>
          {grantError ? <p className="admin-tenant-roster-error">{grantError}</p> : null}
          {grantResult ? <p className="success">{grantResult}</p> : null}
        </form>
      </div>

      <div className="card admin-tenant-roster-card" style={{ marginBottom: 16 }}>
        <h2 className="admin-roster-subheading" style={{ marginTop: 0 }}>
          配布履歴（最新30件）
        </h2>
        {historyLoading ? <p className="muted">履歴を読み込み中…</p> : null}
        {historyError ? <p className="admin-tenant-roster-error">{historyError}</p> : null}
        {!historyLoading && !historyError ? (
          history.length === 0 ? (
            <p className="muted">履歴はまだありません。</p>
          ) : (
            <ul className="admin-roster-list">
              {history.map((h) => (
                <li key={h.id}>
                  <span>
                    {formatIso(h.createdAt)} · <strong>{h.amount}</strong> 枚 →{" "}
                    <strong>{h.targetDisplayLabel ?? h.targetUid}</strong>{" "}
                    <span className="muted admin-roster-meta">
                      <code>{h.targetUid.slice(0, 8)}…</code>
                      {h.targetEmail ? ` · ${h.targetEmail}` : ""}
                    </span>
                    {h.targetKind !== "unknown" ? ` (${h.targetKind})` : ""}
                    {h.note ? ` · ${h.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : null}
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
              テナント <code>{data.organizationId ?? "—"}</code> の教員・生徒の残チケットと直近消費です。
            </p>
            <div className="admin-roster-columns">
              <div>
                <h2 className="admin-roster-subheading">
                  教員・運用{" "}
                  <span className="admin-roster-count">{data.teacherCount ?? data.teachers?.length ?? 0} 名</span>
                </h2>
                {renderList(data.teachers ?? [])}
              </div>
              <div>
                <h2 className="admin-roster-subheading">
                  生徒（想定）{" "}
                  <span className="admin-roster-count">{data.studentCount ?? data.students?.length ?? 0} 名</span>
                </h2>
                {renderList(data.students ?? [])}
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


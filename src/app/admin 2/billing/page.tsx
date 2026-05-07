"use client";

import Link from "next/link";
import { useState } from "react";

import { adminAdjustBillingTickets } from "@/lib/billing/admin-adjust-billing-tickets";
import { adminCreateStripeRefund } from "@/lib/billing/admin-create-stripe-refund";

export default function AdminBillingPage() {
  const [targetUserId, setTargetUserId] = useState("");
  const [deltaTickets, setDeltaTickets] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const [refundExpectedUid, setRefundExpectedUid] = useState("");
  const [refundPi, setRefundPi] = useState("");
  const [refundCharge, setRefundCharge] = useState("");
  const [refundAmountYen, setRefundAmountYen] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refundIdem, setRefundIdem] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundResult, setRefundResult] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const uid = targetUserId.trim();
    const delta = Number.parseInt(deltaTickets, 10);
    if (!uid) {
      setError("対象ユーザーの UID を入力してください。");
      return;
    }
    if (!Number.isFinite(delta)) {
      setError("チケット増減は整数で入力してください。");
      return;
    }
    setBusy(true);
    try {
      const data = await adminAdjustBillingTickets({
        targetUserId: uid,
        deltaTickets: delta,
        reason: reason.trim() || undefined,
        idempotencyKey: idempotencyKey.trim() || undefined,
      });
      setResult(
        `反映しました。対象 UID: ${data.targetUserId} / 変更: ${data.deltaTickets >= 0 ? "+" : ""}${data.deltaTickets} / 現在のチケット数: ${data.tickets}`,
      );
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      const message = err instanceof Error ? err.message : "実行に失敗しました。";
      if (code === "functions/permission-denied") {
        setError("管理者権限がありません。allowlist と Functions の ADMIN_UIDS を確認してください。");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefundError(null);
    setRefundResult(null);
    const uid = refundExpectedUid.trim();
    const pi = refundPi.trim();
    const ch = refundCharge.trim();
    if (!uid) {
      setRefundError("購入者 UID（expectedUid）を入力してください。");
      return;
    }
    if ((pi && ch) || (!pi && !ch)) {
      setRefundError(
        "上の欄（pi_ / cs_）と Charge（ch_）はどちらか一方だけ入力してください。",
      );
      return;
    }
    setRefundBusy(true);
    try {
      const amountRaw = refundAmountYen.trim();
      let amount: number | undefined;
      if (amountRaw) {
        const n = Number.parseInt(amountRaw, 10);
        if (!Number.isFinite(n) || n <= 0) {
          setRefundError("返金額は正の整数（円）で入力するか、全額なら空欄にしてください。");
          setRefundBusy(false);
          return;
        }
        amount = n;
      }
      const data = await adminCreateStripeRefund({
        expectedUid: uid,
        ...(pi.startsWith("cs_")
          ? { checkoutSessionId: pi }
          : pi
            ? { paymentIntentId: pi }
            : {}),
        ...(ch ? { chargeId: ch } : {}),
        ...(amount != null ? { amount } : {}),
        note: refundNote.trim() || undefined,
        idempotencyKey: refundIdem.trim() || undefined,
      });
      setRefundResult(
        `Stripe 返金を作成しました。refund: ${data.refundId}（${data.status ?? "—"}）/ 返金額: ${data.amount ?? "—"} ${data.currency ?? ""} / PI: ${data.paymentIntentId}。数秒後に Webhook 経由でチケットが減算されます。`,
      );
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      const message = err instanceof Error ? err.message : "実行に失敗しました。";
      if (code === "functions/permission-denied") {
        setRefundError("管理者権限がありません。allowlist と Functions の ADMIN_UIDS を確認してください。");
      } else {
        setRefundError(message);
      }
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <main>
      <h1>課金・チケット（管理者）</h1>

      <h2 style={{ marginTop: 24, marginBottom: 8 }}>Stripe 返金（推奨）</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Stripe に返金を作成します。上段には <strong>pi_</strong>・<strong>cs_</strong>（Checkout Session）・いずれかを1つ。Firestore の{" "}
        <code>billing.lastCheckoutSessionId</code> は <strong>cs_</strong> なのでそのまま貼れます。成功後、<strong>charge.refunded</strong>{" "}
        Webhook でチケットが按分減算されます。
        <strong> 同じ決済に対して下の「手動チケット調整」で負数を入れないでください</strong>
        （二重に減ります）。
      </p>
      <div className="card">
        <form onSubmit={(ev) => void onRefundSubmit(ev)}>
          <div className="field">
            <span>購入者 UID（Firebase Auth・Checkout 時の uid と一致必須）</span>
            <input
              type="text"
              value={refundExpectedUid}
              onChange={(ev) => setRefundExpectedUid(ev.target.value)}
              autoComplete="off"
              disabled={refundBusy}
              placeholder="例: abc123..."
            />
          </div>
          <div className="field">
            <span>Payment Intent ID（pi_…）または Charge ID（ch_…）のどちらか</span>
            <input
              type="text"
              value={refundPi}
              onChange={(ev) => {
                setRefundPi(ev.target.value);
                if (ev.target.value.trim()) setRefundCharge("");
              }}
              autoComplete="off"
              disabled={refundBusy}
              placeholder="pi_… または cs_…（lastCheckoutSessionId）"
            />
            <input
              type="text"
              value={refundCharge}
              onChange={(ev) => {
                setRefundCharge(ev.target.value);
                if (ev.target.value.trim()) setRefundPi("");
              }}
              autoComplete="off"
              disabled={refundBusy}
              placeholder="ch_...（上と併用しない）"
              style={{ marginTop: 8 }}
            />
          </div>
          <div className="field">
            <span>返金額（任意・JPY なら円の整数。空欄で全額）</span>
            <input
              type="text"
              inputMode="numeric"
              value={refundAmountYen}
              onChange={(ev) => setRefundAmountYen(ev.target.value)}
              disabled={refundBusy}
              placeholder="例: 1000（部分返金）"
            />
          </div>
          <div className="field">
            <span>メモ（任意・Stripe Refund metadata）</span>
            <textarea
              value={refundNote}
              onChange={(ev) => setRefundNote(ev.target.value)}
              disabled={refundBusy}
              rows={2}
            />
          </div>
          <div className="field">
            <span>Stripe 冪等キー（任意・同じキーで二重返金を防止）</span>
            <input
              type="text"
              value={refundIdem}
              onChange={(ev) => setRefundIdem(ev.target.value)}
              autoComplete="off"
              disabled={refundBusy}
              placeholder="例: admin-refund-2026-05-06-pi-xxx"
            />
          </div>
          {refundError ? <p className="error">{refundError}</p> : null}
          {refundResult ? <p className="success">{refundResult}</p> : null}
          <p style={{ marginBottom: 0 }}>
            <button type="submit" disabled={refundBusy}>
              {refundBusy ? "返金処理中…" : "Stripe で返金する"}
            </button>
          </p>
        </form>
      </div>

      <h2 style={{ marginTop: 32, marginBottom: 8 }}>チケット手動調整のみ</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Stripe を経由しない例外対応。減算は <strong>負の整数</strong>。上の「Stripe 返金」と同じ購入に対しては併用しないでください。
      </p>
      <div className="card">
        <form onSubmit={(ev) => void onSubmit(ev)}>
          <div className="field">
            <span>対象 UID（Firebase Auth）</span>
            <input
              type="text"
              value={targetUserId}
              onChange={(ev) => setTargetUserId(ev.target.value)}
              autoComplete="off"
              disabled={busy}
              placeholder="例: abc123..."
            />
          </div>
          <div className="field">
            <span>チケット増減（整数・減らすときは負数）</span>
            <input
              type="text"
              inputMode="numeric"
              value={deltaTickets}
              onChange={(ev) => setDeltaTickets(ev.target.value)}
              disabled={busy}
              placeholder="例: -15"
            />
          </div>
          <div className="field">
            <span>理由（任意）</span>
            <textarea
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              disabled={busy}
              rows={3}
              placeholder="社内メモ・チケット番号など"
            />
          </div>
          <div className="field">
            <span>冪等キー（任意・同じキーは1回だけ反映）</span>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(ev) => setIdempotencyKey(ev.target.value)}
              autoComplete="off"
              disabled={busy}
              placeholder="例: refund-2026-05-06-user-xxx"
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          {result ? <p className="success">{result}</p> : null}
          <p style={{ marginBottom: 0 }}>
            <button type="submit" disabled={busy}>
              {busy ? "実行中…" : "反映する"}
            </button>
          </p>
        </form>
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        <Link href="/admin">管理トップへ</Link>
      </p>
    </main>
  );
}

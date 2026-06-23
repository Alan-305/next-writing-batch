"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ADMIN_TENANT_CHANGED_EVENT } from "@/lib/admin/admin-tenant-events";
import { adminAdjustBillingTickets } from "@/lib/billing/admin-adjust-billing-tickets";
import { adminAdjustTicketExpiry } from "@/lib/billing/admin-adjust-ticket-expiry";
import { formatTicketExpiryJa } from "@/lib/billing/ticket-lots";
import { adminCreateStripeRefund } from "@/lib/billing/admin-create-stripe-refund";
import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { AdminTenantPublishedPdfs } from "@/components/admin/AdminTenantPublishedPdfs";
import { TwoStepDeleteConfirm, type TwoStepDeletePhase } from "@/components/TwoStepDeleteConfirm";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { formatDateTimeIso } from "@/lib/format-date";

type TenantContextPayload = {
  ok?: boolean;
  orgsOnDisk?: string[];
  actingOrganizationId?: string | null;
  effectiveOrganizationId?: string;
  message?: string;
};

type MemberRow = {
  uid: string;
  displayLabel: string;
  email: string | null;
  nickname: string | null;
  studentNumber: string | null;
  roles: string[];
  kind: "teacher" | "student";
  statusLabel: string;
  registeredAt: string | null;
  tickets: number;
  ticketExpiresAt: string | null;
  cumulativeProofreadTickets?: number;
  lastCheckoutSessionId: string | null;
  lastPaymentIntentId: string | null;
};

type RosterPayload = {
  ok?: boolean;
  organizationId?: string;
  teachers?: MemberRow[];
  students?: MemberRow[];
  teacherCount?: number;
  studentCount?: number;
  orgCumulativeProofreadTickets?: number;
  unattributedProofreadTickets?: number;
  usageNote?: string | null;
  message?: string;
};

type ActionKind = "delete" | "tickets" | "expiry" | "refund" | null;

function memberName(row: MemberRow): string {
  if (row.kind === "student") {
    const nick = row.nickname?.trim();
    if (nick) return nick;
    const num = row.studentNumber?.trim();
    if (num) return num;
  }
  return row.displayLabel;
}

function formatRegisteredAt(iso: string | null): string {
  if (!iso) return "—";
  return formatDateTimeIso(iso);
}

function preventEnterSubmit(ev: React.KeyboardEvent<HTMLFormElement>) {
  if (ev.key === "Enter" && (ev.target as HTMLElement).tagName !== "TEXTAREA") {
    ev.preventDefault();
  }
}

export function AdminTenantDashboard() {
  const router = useRouter();
  const { user } = useFirebaseAuthContext();
  const uid = user?.uid ?? null;

  const [tenantCtx, setTenantCtx] = useState<TenantContextPayload | null>(null);
  const [roster, setRoster] = useState<RosterPayload | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [ctxError, setCtxError] = useState("");
  const [rosterError, setRosterError] = useState("");
  const [tenantSaving, setTenantSaving] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeAction, setActiveAction] = useState<ActionKind>(null);
  const [deletePhase, setDeletePhase] = useState<TwoStepDeletePhase>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const [deltaTickets, setDeltaTickets] = useState("");
  const [ticketReason, setTicketReason] = useState("");
  const [extendDays, setExtendDays] = useState("");
  const [expiryReason, setExpiryReason] = useState("");
  const [refundPi, setRefundPi] = useState("");
  const [refundAmountYen, setRefundAmountYen] = useState("");
  const [refundNote, setRefundNote] = useState("");

  const authHeaders = useCallback(async () => {
    const u = getFirebaseAuth()?.currentUser;
    if (!u) throw new Error("ログイン情報を取得できませんでした。");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadTenantContext = useCallback(async () => {
    setCtxLoading(true);
    setCtxError("");
    try {
      const ah = await authHeaders();
      const res = await fetch("/api/admin/tenant-context", { headers: ah });
      const j = (await res.json()) as TenantContextPayload;
      if (!res.ok || !j?.ok) {
        setCtxError(j?.message ?? "テナント一覧の取得に失敗しました。");
        setTenantCtx(null);
        return;
      }
      setTenantCtx(j);
    } catch {
      setCtxError("通信エラーでテナント一覧を取得できませんでした。");
      setTenantCtx(null);
    } finally {
      setCtxLoading(false);
    }
  }, [authHeaders]);

  const loadRoster = useCallback(async () => {
    setRosterLoading(true);
    setRosterError("");
    try {
      const ah = await authHeaders();
      const res = await fetch("/api/admin/tenant-ticket-roster", { headers: ah });
      const j = (await res.json()) as RosterPayload;
      if (!res.ok || !j?.ok) {
        setRosterError(j?.message ?? "メンバー一覧の取得に失敗しました。");
        setRoster(null);
        return;
      }
      setRoster(j);
      setSelected(new Set());
    } catch {
      setRosterError("通信エラーでメンバー一覧を取得できませんでした。");
      setRoster(null);
    } finally {
      setRosterLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadTenantContext();
  }, [loadTenantContext, uid]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster, uid]);

  useEffect(() => {
    const onChange = () => {
      void loadTenantContext();
      void loadRoster();
    };
    window.addEventListener(ADMIN_TENANT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ADMIN_TENANT_CHANGED_EVENT, onChange);
  }, [loadTenantContext, loadRoster]);

  const onTenantChange = async (ev: React.ChangeEvent<HTMLSelectElement>) => {
    const value = ev.target.value;
    setTenantSaving(true);
    setCtxError("");
    try {
      const ah = await authHeaders();
      const res = await fetch("/api/admin/tenant-context", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ah },
        body: JSON.stringify({ organizationId: value === "" ? null : value }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !j?.ok) {
        setCtxError(j?.message ?? "テナントの切り替えに失敗しました。");
        return;
      }
      await loadTenantContext();
      await loadRoster();
      window.dispatchEvent(new Event(ADMIN_TENANT_CHANGED_EVENT));
      router.refresh();
    } catch {
      setCtxError("通信エラー");
    } finally {
      setTenantSaving(false);
    }
  };

  const teachers = roster?.teachers ?? [];
  const students = roster?.students ?? [];
  const allMembers = useMemo(() => [...teachers, ...students], [teachers, students]);

  const selectedMembers = useMemo(
    () => allMembers.filter((m) => selected.has(m.uid)),
    [allMembers, selected],
  );

  const totalTickets = useMemo(
    () => allMembers.reduce((sum, m) => sum + m.tickets, 0),
    [allMembers],
  );

  const toggleOne = (memberUid: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(memberUid);
      else next.delete(memberUid);
      return next;
    });
  };

  const toggleAllStudents = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of students) {
        if (checked) next.add(s.uid);
        else next.delete(s.uid);
      }
      return next;
    });
  };

  const openAction = (kind: ActionKind) => {
    setActionError(null);
    setActionResult(null);
    if (kind === "delete") {
      setDeletePhase("warning");
      return;
    }
    if (kind === "refund" && selectedMembers.length === 1) {
      const m = selectedMembers[0]!;
      setRefundPi(m.lastCheckoutSessionId ?? m.lastPaymentIntentId ?? "");
    }
    setActiveAction(kind);
  };

  const closeAction = () => {
    if (actionBusy) return;
    setActiveAction(null);
    setDeletePhase(null);
    setActionError(null);
    setActionResult(null);
    setDeltaTickets("");
    setTicketReason("");
    setExtendDays("");
    setExpiryReason("");
    setRefundPi("");
    setRefundAmountYen("");
    setRefundNote("");
  };

  const runDelete = async () => {
    setActionBusy(true);
    setActionError(null);
    setActionResult(null);
    try {
      const ah = await authHeaders();
      const lines: string[] = [];
      for (const m of selectedMembers) {
        const res = await fetch("/api/admin/user-account-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ah },
          body: JSON.stringify({ targetUid: m.uid, confirmTargetUid: m.uid }),
        });
        const j = (await res.json()) as { ok?: boolean; message?: string; targetUid?: string };
        if (!res.ok || j.ok !== true) {
          lines.push(`${memberName(m)}: ${j.message ?? "失敗"}`);
        } else {
          lines.push(`${memberName(m)}: 削除完了`);
        }
      }
      setActionResult(lines.join("\n"));
      setDeletePhase(null);
      setActiveAction(null);
      setSelected(new Set());
      await loadRoster();
      await loadTenantContext();
      window.dispatchEvent(new Event(ADMIN_TENANT_CHANGED_EVENT));
    } catch {
      setActionError("通信エラーで退会処理を完了できませんでした。");
    } finally {
      setActionBusy(false);
    }
  };

  const runTicketAdjust = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setActionError(null);
    setActionResult(null);
    const delta = Number.parseInt(deltaTickets, 10);
    if (!Number.isFinite(delta)) {
      setActionError("チケット増減は整数で入力してください。");
      return;
    }
    setActionBusy(true);
    try {
      const lines: string[] = [];
      for (const m of selectedMembers) {
        const data = await adminAdjustBillingTickets({
          targetUserId: m.uid,
          deltaTickets: delta,
          reason: ticketReason.trim() || undefined,
        });
        lines.push(`${memberName(m)}: ${data.deltaTickets >= 0 ? "+" : ""}${data.deltaTickets} → 残 ${data.tickets}`);
      }
      setActionResult(lines.join("\n"));
      await loadRoster();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "チケット調整に失敗しました。");
    } finally {
      setActionBusy(false);
    }
  };

  const runExpiryAdjust = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setActionError(null);
    setActionResult(null);
    const days = Number.parseInt(extendDays, 10);
    if (!Number.isFinite(days) || days === 0) {
      setActionError("有効期限の変更日数は 0 以外の整数で入力してください（延長は正、短縮は負）。");
      return;
    }
    const teachersOnly = selectedMembers.filter((m) => m.kind === "teacher");
    if (teachersOnly.length === 0) {
      setActionError("有効期限の調整は教員のみ対象です。教員を選択してください。");
      return;
    }
    setActionBusy(true);
    try {
      const lines: string[] = [];
      for (const m of teachersOnly) {
        const data = await adminAdjustTicketExpiry({
          targetUserId: m.uid,
          extendDays: days,
          reason: expiryReason.trim() || undefined,
        });
        const expiryLabel = data.ticketExpiresAt ? formatTicketExpiryJa(data.ticketExpiresAt) : "—";
        lines.push(
          `${memberName(m)}: ${days >= 0 ? "+" : ""}${days}日 → 残 ${data.tickets} 枚 / 直近期限 ${expiryLabel}`,
        );
      }
      setActionResult(lines.join("\n"));
      await loadRoster();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "有効期限の調整に失敗しました。");
    } finally {
      setActionBusy(false);
    }
  };

  const runRefund = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (selectedMembers.length !== 1) {
      setActionError("返金は1名ずつ実行してください。");
      return;
    }
    const m = selectedMembers[0]!;
    const pi = refundPi.trim();
    if (!pi) {
      setActionError("Payment Intent（pi_）または Checkout Session（cs_）を入力してください。");
      return;
    }
    setActionBusy(true);
    setActionError(null);
    setActionResult(null);
    try {
      const amountRaw = refundAmountYen.trim();
      let amount: number | undefined;
      if (amountRaw) {
        const n = Number.parseInt(amountRaw, 10);
        if (!Number.isFinite(n) || n <= 0) {
          setActionError("返金額は正の整数（円）で入力するか、全額なら空欄にしてください。");
          setActionBusy(false);
          return;
        }
        amount = n;
      }
      const data = await adminCreateStripeRefund({
        expectedUid: m.uid,
        ...(pi.startsWith("cs_") ? { checkoutSessionId: pi } : { paymentIntentId: pi }),
        ...(amount != null ? { amount } : {}),
        note: refundNote.trim() || undefined,
      });
      setActionResult(
        `${memberName(m)}: 返金 ${data.refundId}（${data.status ?? "—"}）/ ${data.amount ?? "—"} ${data.currency ?? ""}`,
      );
      await loadRoster();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "返金に失敗しました。");
    } finally {
      setActionBusy(false);
    }
  };

  const tenantOptions = [...(tenantCtx?.orgsOnDisk ?? [])].sort((a, b) => a.localeCompare(b, "ja"));
  const actingOrg = tenantCtx?.actingOrganizationId ?? null;
  const effectiveOrg = roster?.organizationId ?? tenantCtx?.effectiveOrganizationId ?? "—";
  const loading = ctxLoading || rosterLoading;
  const refundDisabled = selectedMembers.length !== 1;

  const renderMemberTable = (
    rows: MemberRow[],
    sectionId: string,
    heading: string,
    options?: { showSelectAll?: boolean; showCumulativeProofreads?: boolean },
  ) => {
    const showSelectAll = options?.showSelectAll ?? false;
    const showCumulativeProofreads = options?.showCumulativeProofreads ?? false;
    const allStudentsSelected =
      rows.length > 0 && rows.every((r) => selected.has(r.uid));
    return (
      <section className="admin-section" aria-labelledby={sectionId}>
        <div className="admin-section__head">
          <h2 id={sectionId} className="admin-section__title">
            {heading}
            <span className="admin-section__count">{rows.length} 名</span>
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="admin-empty">該当ユーザーがいません。</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col" className="admin-table__check">
                    {showSelectAll ? (
                      <input
                        type="checkbox"
                        aria-label="生徒をすべて選択"
                        checked={allStudentsSelected}
                        onChange={(ev) => toggleAllStudents(ev.target.checked)}
                      />
                    ) : (
                      <span className="visually-hidden">選択</span>
                    )}
                  </th>
                  <th scope="col">名前</th>
                  <th scope="col">UID</th>
                  <th scope="col">メール</th>
                  <th scope="col">登録日</th>
                  <th scope="col">チケット</th>
                  {showCumulativeProofreads ? <th scope="col">累計添削</th> : null}
                  <th scope="col">有効期限</th>
                  <th scope="col">状態</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.uid} className={selected.has(m.uid) ? "admin-table__row--selected" : undefined}>
                    <td className="admin-table__check">
                      <input
                        type="checkbox"
                        aria-label={`${memberName(m)} を選択`}
                        checked={selected.has(m.uid)}
                        onChange={(ev) => toggleOne(m.uid, ev.target.checked)}
                      />
                    </td>
                    <td className="admin-table__name">{memberName(m)}</td>
                    <td>
                      <code className="admin-table__uid">{m.uid}</code>
                    </td>
                    <td>{m.email ?? "—"}</td>
                    <td className="admin-table__date">{formatRegisteredAt(m.registeredAt)}</td>
                    <td className="admin-table__tickets">
                      <strong>{m.tickets}</strong>
                    </td>
                    {showCumulativeProofreads ? (
                      <td className="admin-table__tickets">
                        <strong>{m.cumulativeProofreadTickets ?? 0}</strong>
                        <span className="admin-table__unit">枚</span>
                      </td>
                    ) : null}
                    <td className="admin-table__date">
                      {m.kind === "teacher" && m.ticketExpiresAt
                        ? formatTicketExpiryJa(m.ticketExpiresAt)
                        : "—"}
                    </td>
                    <td>
                      <span className={`admin-status admin-status--${m.kind}`}>{m.statusLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="admin-dashboard">
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-header__title">テナント管理</h1>
          <p className="admin-page-header__lead">
            テナントを選び、教員・生徒の情報確認と退会・返金・チケット調整を行います。
          </p>
        </div>
        <nav className="admin-page-nav" aria-label="管理サブメニュー">
          <Link href="/admin/tenant-maintenance">テナントメンテナンス</Link>
          <Link href="/ops">運用 /ops</Link>
        </nav>
      </header>

      <div className="admin-toolbar card">
        <div className="field admin-toolbar__tenant">
          <label htmlFor="admin-dashboard-tenant">テナント</label>
          <select
            id="admin-dashboard-tenant"
            className="admin-toolbar__select"
            value={actingOrg ?? ""}
            disabled={tenantSaving || ctxLoading}
            onChange={(e) => void onTenantChange(e)}
          >
            <option value="">（自分の Firestore 組織）</option>
            {tenantOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
        {ctxError ? (
          <p className="admin-alert admin-alert--error" role="alert">
            {ctxError}
          </p>
        ) : null}
      </div>

      {loading && !roster ? (
        <p className="admin-loading" aria-live="polite">
          読み込み中…
        </p>
      ) : rosterError && !roster ? (
        <p className="admin-alert admin-alert--error" role="alert">
          {rosterError}
        </p>
      ) : (
        <>
          <div className="admin-summary">
            <div className="admin-summary__hero">
              <p className="admin-summary__hero-label">選択中テナント</p>
              <p className="admin-summary__hero-value">{effectiveOrg}</p>
            </div>
            <div className="admin-summary__grid">
              <div className="admin-stat-card">
                <p className="admin-stat-card__label">教員</p>
                <p className="admin-stat-card__value">{roster?.teacherCount ?? teachers.length}</p>
              </div>
              <div className="admin-stat-card">
                <p className="admin-stat-card__label">生徒</p>
                <p className="admin-stat-card__value">{roster?.studentCount ?? students.length}</p>
              </div>
              <div className="admin-stat-card admin-stat-card--tickets">
                <p className="admin-stat-card__label">合計チケット</p>
                <p className="admin-stat-card__value">{totalTickets}</p>
              </div>
              <div className="admin-stat-card admin-stat-card--usage">
                <p className="admin-stat-card__label">累計添削（テナント）</p>
                <p className="admin-stat-card__value">{roster?.orgCumulativeProofreadTickets ?? 0}</p>
              </div>
            </div>
          </div>

          {roster?.usageNote ? (
            <p className="admin-usage-note muted" role="note">
              {roster.usageNote}
            </p>
          ) : null}
          <p className="admin-usage-note muted">
            <strong>累計添削</strong>は確定＆公開（Day4）でチケットを消費した件数です。チケット残数との整合確認にご利用ください。
          </p>

          {renderMemberTable(teachers, "admin-teachers-heading", "テナント本人（教員）", {
            showCumulativeProofreads: true,
          })}
          {renderMemberTable(students, "admin-students-heading", "生徒一覧", { showSelectAll: true })}

          <AdminTenantPublishedPdfs organizationId={effectiveOrg} />
        </>
      )}

      {selected.size > 0 ? (
        <div className="admin-action-bar" role="region" aria-label="選択中の操作">
          <p className="admin-action-bar__label">
            <strong>{selected.size}</strong> 件選択中
          </p>
          <div className="admin-action-bar__buttons">
            <button type="button" className="ops-btn ops-btn--danger" onClick={() => openAction("delete")}>
              退会
            </button>
            <button type="button" className="ops-btn ops-btn--queue" onClick={() => openAction("tickets")}>
              チケット調整
            </button>
            <button type="button" className="ops-btn ops-btn--queue" onClick={() => openAction("expiry")}>
              有効期限調整
            </button>
            <button
              type="button"
              className="ops-btn ops-btn--warn"
              disabled={refundDisabled}
              title={refundDisabled ? "返金は1名ずつ選択してください" : undefined}
              onClick={() => openAction("refund")}
            >
              返金
            </button>
            <button type="button" className="ops-btn ops-btn--ghost" onClick={() => setSelected(new Set())}>
              選択解除
            </button>
          </div>
        </div>
      ) : null}

      <TwoStepDeleteConfirm
        phase={deletePhase}
        onDismiss={closeAction}
        onContinueFromWarning={() => setDeletePhase("confirm")}
        warningTitle="退会処理の確認"
        warningBody={
          <>
            <p style={{ marginTop: 0 }}>
              選択した <strong>{selected.size}</strong> 件の Auth ユーザーと Firestore データを削除します。取り消しできません。
            </p>
            <ul style={{ margin: "8px 0 0", paddingLeft: "1.2rem" }}>
              {selectedMembers.map((m) => (
                <li key={m.uid}>
                  {memberName(m)} <code style={{ fontSize: "0.82rem" }}>{m.uid}</code>
                </li>
              ))}
            </ul>
          </>
        }
        confirmTitle="本当に削除しますか？"
        confirmBody={
          <p style={{ margin: 0 }}>
            同じ UID を再入力する代わりに、一覧で選択したユーザーのみ削除します。テナント内に他ユーザーが残れば組織は維持されます。
          </p>
        }
        onConfirmYes={() => void runDelete()}
        busy={actionBusy}
      />

      {activeAction === "tickets" ? (
        <div className="admin-modal-overlay" role="presentation" onClick={closeAction}>
          <div
            className="admin-modal card"
            role="dialog"
            aria-labelledby="admin-ticket-dialog-title"
            aria-modal="true"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="admin-ticket-dialog-title" className="admin-modal__title">
              チケット調整
            </h2>
            <p className="admin-modal__lead">
              選択 {selectedMembers.length} 名に同じ増減を適用します。減らす場合は負の整数を入力してください。
            </p>
            <form onSubmit={(ev) => void runTicketAdjust(ev)} onKeyDown={preventEnterSubmit}>
              <div className="field">
                <label htmlFor="admin-delta-tickets">チケット増減（整数）</label>
                <input
                  id="admin-delta-tickets"
                  type="text"
                  inputMode="numeric"
                  value={deltaTickets}
                  onChange={(ev) => setDeltaTickets(ev.target.value)}
                  disabled={actionBusy}
                  placeholder="例: 5 または -3"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="admin-ticket-reason">理由（任意）</label>
                <textarea
                  id="admin-ticket-reason"
                  value={ticketReason}
                  onChange={(ev) => setTicketReason(ev.target.value)}
                  disabled={actionBusy}
                  rows={2}
                />
              </div>
              {actionError ? <p className="admin-alert admin-alert--error">{actionError}</p> : null}
              {actionResult ? <p className="admin-alert admin-alert--success">{actionResult}</p> : null}
              <div className="admin-modal__actions">
                <button type="button" className="ops-btn ops-btn--ghost" disabled={actionBusy} onClick={closeAction}>
                  閉じる
                </button>
                <button type="submit" className="ops-btn ops-btn--queue" disabled={actionBusy}>
                  {actionBusy ? "反映中…" : "反映する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {activeAction === "expiry" ? (
        <div className="admin-modal-overlay" role="presentation" onClick={closeAction}>
          <div
            className="admin-modal card"
            role="dialog"
            aria-labelledby="admin-expiry-dialog-title"
            aria-modal="true"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="admin-expiry-dialog-title" className="admin-modal__title">
              チケット有効期限の調整
            </h2>
            <p className="admin-modal__lead">
              選択した教員の有効チケットロットの失効日を日数分ずらします。延長は正の整数、短縮は負の整数（例: +30 / -7）。
            </p>
            <form onSubmit={(ev) => void runExpiryAdjust(ev)} onKeyDown={preventEnterSubmit}>
              <div className="field">
                <label htmlFor="admin-extend-days">変更日数（整数）</label>
                <input
                  id="admin-extend-days"
                  type="text"
                  inputMode="numeric"
                  value={extendDays}
                  onChange={(ev) => setExtendDays(ev.target.value)}
                  disabled={actionBusy}
                  placeholder="例: 30 または -7"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="admin-expiry-reason">理由（任意）</label>
                <textarea
                  id="admin-expiry-reason"
                  value={expiryReason}
                  onChange={(ev) => setExpiryReason(ev.target.value)}
                  disabled={actionBusy}
                  rows={2}
                />
              </div>
              {actionError ? <p className="admin-alert admin-alert--error">{actionError}</p> : null}
              {actionResult ? <p className="admin-alert admin-alert--success">{actionResult}</p> : null}
              <div className="admin-modal__actions">
                <button type="button" className="ops-btn ops-btn--ghost" disabled={actionBusy} onClick={closeAction}>
                  閉じる
                </button>
                <button type="submit" className="ops-btn ops-btn--queue" disabled={actionBusy}>
                  {actionBusy ? "反映中…" : "反映する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {activeAction === "refund" ? (
        <div className="admin-modal-overlay" role="presentation" onClick={closeAction}>
          <div
            className="admin-modal card"
            role="dialog"
            aria-labelledby="admin-refund-dialog-title"
            aria-modal="true"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="admin-refund-dialog-title" className="admin-modal__title">
              Stripe 返金
            </h2>
            <p className="admin-modal__lead">
              {selectedMembers[0] ? `${memberName(selectedMembers[0])} 向け` : ""} — pi_ または cs_ を入力。Webhook 経由でチケットが減算されます。
            </p>
            <form onSubmit={(ev) => void runRefund(ev)} onKeyDown={preventEnterSubmit}>
              <div className="field">
                <label htmlFor="admin-refund-pi">Payment Intent / Checkout Session</label>
                <input
                  id="admin-refund-pi"
                  type="text"
                  value={refundPi}
                  onChange={(ev) => setRefundPi(ev.target.value)}
                  disabled={actionBusy}
                  placeholder="pi_… または cs_…"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="admin-refund-amount">返金額（任意・円。空欄で全額）</label>
                <input
                  id="admin-refund-amount"
                  type="text"
                  inputMode="numeric"
                  value={refundAmountYen}
                  onChange={(ev) => setRefundAmountYen(ev.target.value)}
                  disabled={actionBusy}
                />
              </div>
              <div className="field">
                <label htmlFor="admin-refund-note">メモ（任意）</label>
                <textarea
                  id="admin-refund-note"
                  value={refundNote}
                  onChange={(ev) => setRefundNote(ev.target.value)}
                  disabled={actionBusy}
                  rows={2}
                />
              </div>
              {actionError ? <p className="admin-alert admin-alert--error">{actionError}</p> : null}
              {actionResult ? <p className="admin-alert admin-alert--success">{actionResult}</p> : null}
              <div className="admin-modal__actions">
                <button type="button" className="ops-btn ops-btn--ghost" disabled={actionBusy} onClick={closeAction}>
                  閉じる
                </button>
                <button type="submit" className="ops-btn ops-btn--warn" disabled={actionBusy}>
                  {actionBusy ? "返金処理中…" : "Stripe で返金する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {actionResult && !activeAction && deletePhase === null ? (
        <p className="admin-alert admin-alert--success admin-dashboard__result" role="status">
          {actionResult}
        </p>
      ) : null}
    </div>
  );
}

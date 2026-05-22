"use client";

import Link from "next/link";
import { useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { ADMIN_TENANT_CHANGED_EVENT } from "@/lib/admin/admin-tenant-events";
import { getFirebaseAuth } from "@/lib/firebase/client";

type CleanupJson = {
  ok?: boolean;
  deletedIds?: string[];
  scannedIds?: string[];
  skippedHasUsers?: string[];
  message?: string;
};

type OrgChangeJson = {
  ok?: boolean;
  organizationId?: string;
  previousOrganizationId?: string | null;
  removedPreviousTenant?: { removed?: boolean; organizationId?: string };
  message?: string;
};

export default function AdminTenantMaintenancePage() {
  const { user } = useFirebaseAuthContext();
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const [targetUid, setTargetUid] = useState("");
  const [newOrgId, setNewOrgId] = useState("");
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgResult, setOrgResult] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const authHeader = async (): Promise<Record<string, string> | null> => {
    const u = getFirebaseAuth()?.currentUser;
    if (!u) return null;
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const onCleanupOrphans = async () => {
    setCleanupBusy(true);
    setCleanupError(null);
    setCleanupResult(null);
    try {
      const ah = await authHeader();
      if (!ah) {
        setCleanupError("ログイン情報を取得できませんでした。");
        return;
      }
      const res = await fetch("/api/admin/cleanup-orphan-tenants", { method: "POST", headers: ah });
      const j = (await res.json()) as CleanupJson;
      if (!res.ok || !j.ok) {
        setCleanupError(j.message ?? "実行に失敗しました。");
        return;
      }
      const deleted = j.deletedIds ?? [];
      setCleanupResult(
        deleted.length
          ? `削除した孤立テナント: ${deleted.join(", ")}（スキャン: ${(j.scannedIds ?? []).length} 件）`
          : `削除対象の孤立テナントはありませんでした（スキャン: ${(j.scannedIds ?? []).length} 件）。`,
      );
      window.dispatchEvent(new Event(ADMIN_TENANT_CHANGED_EVENT));
    } catch {
      setCleanupError("通信エラーで実行できませんでした。");
    } finally {
      setCleanupBusy(false);
    }
  };

  const onChangeOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgBusy(true);
    setOrgError(null);
    setOrgResult(null);
    try {
      const ah = await authHeader();
      if (!ah) {
        setOrgError("ログイン情報を取得できませんでした。");
        return;
      }
      const res = await fetch("/api/admin/user-organization", {
        method: "POST",
        headers: ah,
        body: JSON.stringify({
          targetUid: targetUid.trim(),
          organizationId: newOrgId.trim(),
        }),
      });
      const j = (await res.json()) as OrgChangeJson;
      if (!res.ok || !j.ok) {
        setOrgError(j.message ?? "更新に失敗しました。");
        return;
      }
      const prevRemoved = j.removedPreviousTenant?.removed
        ? `旧テナント「${j.removedPreviousTenant.organizationId ?? "—"}」を削除しました。`
        : "旧テナントは他ユーザーがいるか、すでに空ではなかったため残しています。";
      setOrgResult(
        `organizationId を「${j.organizationId ?? "—"}」に更新しました（以前: ${j.previousOrganizationId ?? "未設定"}）。${prevRemoved}`,
      );
      window.dispatchEvent(new Event(ADMIN_TENANT_CHANGED_EVENT));
    } catch {
      setOrgError("通信エラーで実行できませんでした。");
    } finally {
      setOrgBusy(false);
    }
  };

  return (
    <main>
      <h1>テナントメンテナンス（管理者）</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        教員削除後に残った <code>organizations/t_…</code> や、テナント ID 変更後の古い ID を整理します。
        ヘッダーのテナントプルダウンは<strong>ユーザーが紐づいている ID のみ</strong>表示します。
      </p>
      {user ? (
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          管理者 UID: <code style={{ wordBreak: "break-all" }}>{user.uid}</code>
        </p>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>孤立テナントの一括削除</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          どのユーザーも参照していない <code>organizations/*</code> と <code>data/orgs/*</code> を削除します。
          生徒が残っているテナントは触りません。
        </p>
        {cleanupError ? <p className="error">{cleanupError}</p> : null}
        {cleanupResult ? <p className="success">{cleanupResult}</p> : null}
        <button type="button" disabled={cleanupBusy} onClick={() => void onCleanupOrphans()}>
          {cleanupBusy ? "削除中…" : "孤立テナントを削除"}
        </button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>ユーザーのテナント ID 変更</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Firestore の <code>users/{"{uid}"}.organizationId</code> を更新します。
          旧 ID に他のユーザーがいなければ、旧テナントも自動削除され、プルダウンから消えます。
        </p>
        <form onSubmit={(ev) => void onChangeOrg(ev)}>
          <div className="field">
            <span>対象 UID</span>
            <input
              type="text"
              value={targetUid}
              onChange={(ev) => setTargetUid(ev.target.value)}
              autoComplete="off"
              disabled={orgBusy}
            />
          </div>
          <div className="field">
            <span>新しい organizationId（英数字・-_ のみ）</span>
            <input
              type="text"
              value={newOrgId}
              onChange={(ev) => setNewOrgId(ev.target.value)}
              autoComplete="off"
              disabled={orgBusy}
              placeholder="例: Yuming"
            />
          </div>
          {orgError ? <p className="error">{orgError}</p> : null}
          {orgResult ? <p className="success">{orgResult}</p> : null}
          <button type="submit" disabled={orgBusy}>
            {orgBusy ? "更新中…" : "テナント ID を変更"}
          </button>
        </form>
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        <Link href="/admin">管理トップへ</Link>
        {" · "}
        <Link href="/admin/account-delete">退会・ユーザー削除</Link>
      </p>
    </main>
  );
}

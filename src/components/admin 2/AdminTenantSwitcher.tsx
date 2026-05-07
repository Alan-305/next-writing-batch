"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { ADMIN_TENANT_CHANGED_EVENT } from "@/lib/admin/admin-tenant-events";

type TenantPayload = {
  ok?: boolean;
  orgsOnDisk?: string[];
  actingOrganizationId?: string | null;
  effectiveOrganizationId?: string;
  profileOrganizationId?: string;
  profileUsedFallback?: boolean;
  message?: string;
};

export function AdminTenantSwitcher() {
  const router = useRouter();
  const { user } = useFirebaseAuthContext();
  const uid = user?.uid ?? null;
  const [payload, setPayload] = useState<TenantPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const u = getFirebaseAuth()?.currentUser;
      if (!u) {
        setError("ログイン情報を取得できませんでした。ページを再読み込みしてください。");
        setPayload(null);
        return;
      }
      const token = await u.getIdToken();
      const ah = { Authorization: `Bearer ${token}` };
      const res = await fetch("/api/admin/tenant-context", { headers: ah });
      const j = (await res.json()) as TenantPayload;
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "取得に失敗しました。");
        setPayload(null);
        return;
      }
      setPayload(j);
    } catch {
      setError("通信エラー");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSelectChange = async (ev: React.ChangeEvent<HTMLSelectElement>) => {
    const value = ev.target.value;
    setSaving(true);
    setError("");
    try {
      const u = getFirebaseAuth()?.currentUser;
      if (!u) {
        setError("ログインが切れています。再読み込みしてください。");
        return;
      }
      const token = await u.getIdToken();
      const ah = { Authorization: `Bearer ${token}` };
      const res = await fetch("/api/admin/tenant-context", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ah },
        body: JSON.stringify({ organizationId: value === "" ? null : value }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "更新に失敗しました。");
        return;
      }
      await load();
      window.dispatchEvent(new Event(ADMIN_TENANT_CHANGED_EVENT));
      router.refresh();
    } catch {
      setError("通信エラー");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-tenant-switcher muted" aria-live="polite">
        テナント…
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="admin-tenant-switcher muted" title={error}>
        テナント（取得不可）
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="admin-tenant-switcher muted" title={error || undefined}>
        テナント（データなし）
      </div>
    );
  }

  const orgs = payload.orgsOnDisk ?? [];
  const acting = payload.actingOrganizationId ?? null;
  const optionSet = new Set<string>(orgs);
  if (acting) optionSet.add(acting);
  const options = [...optionSet].sort((a, b) => a.localeCompare(b));
  const selectValue = acting ?? "";

  return (
    <div className="admin-tenant-switcher">
      <label htmlFor="admin-tenant-select" className="admin-tenant-switcher-label">
        テナント
      </label>
      <select
        id="admin-tenant-select"
        className="admin-tenant-switcher-select"
        value={selectValue}
        disabled={saving}
        onChange={(e) => void onSelectChange(e)}
        aria-describedby="admin-tenant-hint"
        title={`API 解決: ${payload.effectiveOrganizationId ?? "—"} / Firestore: ${payload.profileOrganizationId ?? "—"}`}
      >
        <option value="">（Firestore の組織に従う）</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      {error ? (
        <span className="admin-tenant-switcher-error" role="alert">
          {error}
        </span>
      ) : null}
      <span id="admin-tenant-hint" className="visually-hidden">
        選択中のテナントは運用の API（提出一覧など）の組織解決に使われます。空欄にすると自分の Firestore の organizationId に戻ります。
      </span>
    </div>
  );
}

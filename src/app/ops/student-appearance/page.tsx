"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { DEFAULT_STUDENT_BRANDING, type StudentBranding } from "@/lib/student-branding";

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

function colorPickerValue(hex: string, fallback: string): string {
  const t = hex.trim();
  return HEX6.test(t) ? t : fallback;
}

export default function OpsStudentAppearancePage() {
  const { user } = useFirebaseAuthContext();
  const [branding, setBranding] = useState<StudentBranding>(DEFAULT_STUDENT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const authHeader = useCallback(async (): Promise<Record<string, string> | null> => {
    if (!user) return null;
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const ah = await authHeader();
      const res = await fetch("/api/ops/branding", { headers: ah ? { ...ah } : {} });
      const j = (await res.json()) as { ok?: boolean; branding?: StudentBranding; message?: string };
      if (!res.ok || !j?.ok || !j.branding) {
        setError(j?.message ?? "読み込みに失敗しました。");
        return;
      }
      setBranding(j.branding);
    } catch {
      setError("通信エラーで読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (p: Partial<StudentBranding>) => {
    setBranding((prev) => ({ ...prev, ...p }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const ah = await authHeader();
      const res = await fetch("/api/ops/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(ah ?? {}) },
        body: JSON.stringify(branding),
      });
      const j = (await res.json()) as { ok?: boolean; branding?: StudentBranding; message?: string };
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "保存に失敗しました。");
        return;
      }
      if (j.branding) setBranding(j.branding);
      setMessage(
        "保存しました（Firestore に反映済み）。同じ組織の生徒は、提出・結果のページを開き直すか再読み込みすると新しい見た目になります。",
      );
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/ops">← 運用ホーム</Link>
      </p>
      <h1>生徒画面の見た目</h1>
      <p className="muted">
        ここで変えた色や表示名は、<strong>あなたと同じ組織（学校）の生徒</strong>が使う提出・結果画面にもそのまま反映されます（課題や添削の仕組みは変わりません）。組織 ID の確認・切り替えは{" "}
        <Link href="/ops/tenant">テナント（検証）</Link> から行えます。
      </p>
      <p className="muted">
        設定は <strong>Firestore</strong> に保存されます（再デプロイや別インスタンスでも維持されます）。ローカルの{" "}
        <code>branding.json</code> は補助用です。
      </p>

      {loading ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <form className="card" onSubmit={onSubmit} style={{ maxWidth: 560, padding: "20px 22px" }}>
          <div className="field">
            <span>左上のタイトル</span>
            <input
              type="text"
              value={branding.productTitle}
              onChange={(ev) => patch({ productTitle: ev.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <span>バッジ文言（例: 生徒用）</span>
            <input
              type="text"
              value={branding.badgeLabel}
              onChange={(ev) => patch({ badgeLabel: ev.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <span>学校名・表示名（空欄ならヘッダーに出しません）</span>
            <input
              type="text"
              value={branding.schoolDisplayName}
              onChange={(ev) => patch({ schoolDisplayName: ev.target.value })}
              autoComplete="organization"
            />
          </div>

          <fieldset style={{ border: "none", margin: "18px 0 0", padding: 0 }}>
            <legend className="field" style={{ marginBottom: 8 }}>
              <span>色（# と 6 桁の英数字）</span>
            </legend>
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              <label className="field" style={{ margin: 0 }}>
                <span>メイン（見出し・強調）</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="color"
                    value={colorPickerValue(branding.primaryColor, DEFAULT_STUDENT_BRANDING.primaryColor)}
                    onChange={(ev) => patch({ primaryColor: ev.target.value })}
                    aria-label="メイン色"
                    style={{ width: 44, height: 44, padding: 0, border: "1px solid #cbd5e1", borderRadius: 8 }}
                  />
                  <input
                    type="text"
                    value={branding.primaryColor}
                    onChange={(ev) => patch({ primaryColor: ev.target.value })}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>アクセント（ボタン・装飾）</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="color"
                    value={colorPickerValue(branding.accentColor, DEFAULT_STUDENT_BRANDING.accentColor)}
                    onChange={(ev) => patch({ accentColor: ev.target.value })}
                    aria-label="アクセント色"
                    style={{ width: 44, height: 44, padding: 0, border: "1px solid #cbd5e1", borderRadius: 8 }}
                  />
                  <input
                    type="text"
                    value={branding.accentColor}
                    onChange={(ev) => patch({ accentColor: ev.target.value })}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>背景（上）</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="color"
                    value={colorPickerValue(
                      branding.surfaceTintStart,
                      DEFAULT_STUDENT_BRANDING.surfaceTintStart,
                    )}
                    onChange={(ev) => patch({ surfaceTintStart: ev.target.value })}
                    aria-label="背景色（上）"
                    style={{ width: 44, height: 44, padding: 0, border: "1px solid #cbd5e1", borderRadius: 8 }}
                  />
                  <input
                    type="text"
                    value={branding.surfaceTintStart}
                    onChange={(ev) => patch({ surfaceTintStart: ev.target.value })}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span>背景（下）</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="color"
                    value={colorPickerValue(branding.surfaceTintEnd, DEFAULT_STUDENT_BRANDING.surfaceTintEnd)}
                    onChange={(ev) => patch({ surfaceTintEnd: ev.target.value })}
                    aria-label="背景色（下）"
                    style={{ width: 44, height: 44, padding: 0, border: "1px solid #cbd5e1", borderRadius: 8 }}
                  />
                  <input
                    type="text"
                    value={branding.surfaceTintEnd}
                    onChange={(ev) => patch({ surfaceTintEnd: ev.target.value })}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
              </label>
            </div>
          </fieldset>

          {error ? (
            <p className="muted" style={{ color: "#b91c1c", marginTop: 16 }}>
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="muted" style={{ marginTop: 16, color: "#15803d" }}>
              {message}
            </p>
          ) : null}

          <p style={{ marginTop: 20, marginBottom: 0 }}>
            <button type="submit" disabled={saving}>
              {saving ? "保存中…" : "サーバーに保存"}
            </button>
          </p>
        </form>
      )}
    </main>
  );
}

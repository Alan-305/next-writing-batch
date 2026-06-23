"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StudentBrandingThemeDecor } from "@/components/branding/StudentBrandingThemeDecor";
import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { OPS_DASHBOARD_LABEL } from "@/lib/ops/ops-dashboard-label";
import {
  applyStudentBrandingPreset,
  resolveActivePresetId,
  STUDENT_BRANDING_PRESET_CATEGORIES,
  STUDENT_BRANDING_PRESETS,
} from "@/lib/student-branding-presets";
import {
  DEFAULT_STUDENT_BRANDING,
  studentBrandingStyle,
  type StudentBranding,
} from "@/lib/student-branding";

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

function colorPickerValue(hex: string, fallback: string): string {
  const t = hex.trim();
  return HEX6.test(t) ? t : fallback;
}

function preventEnterSubmit(ev: React.KeyboardEvent<HTMLFormElement>) {
  if (ev.key === "Enter" && (ev.target as HTMLElement).tagName !== "TEXTAREA") {
    ev.preventDefault();
  }
}

export default function OpsStudentAppearancePage() {
  const { user } = useFirebaseAuthContext();
  const [branding, setBranding] = useState<StudentBranding>(DEFAULT_STUDENT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activePresetId = useMemo(() => resolveActivePresetId(branding), [branding]);
  const shellStyle = useMemo(() => studentBrandingStyle(branding), [branding]);

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

  const patchText = (p: Partial<StudentBranding>) => {
    setBranding((prev) => ({ ...prev, ...p }));
  };

  const patchColors = (p: Partial<StudentBranding>) => {
    setBranding((prev) => ({ ...prev, ...p, stylePresetId: "custom" }));
  };

  const selectPreset = (presetId: string) => {
    setBranding((prev) => applyStudentBrandingPreset(prev, presetId));
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
        "保存しました。教員画面・生徒画面を開き直すか再読み込みすると、新しい見た目になります。",
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
        <Link href="/ops">← {OPS_DASHBOARD_LABEL}</Link>
      </p>
      <h1>教師・生徒画面設定</h1>
      <p className="muted">
        <strong>タイトル・学校名</strong>は自由入力、<strong>色と雰囲気</strong>はスタイルから選べます。
        各スタイルでは<strong>背景の小道具</strong>や<strong>ボタンの形</strong>もテーマに合わせて変わります（本文は読みやすさのため白背景を維持）。
        設定は<strong>教員の運用画面</strong>と<strong>生徒の提出・結果画面</strong>の両方に反映されます。
      </p>

      {loading ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <form
          className="card"
          onSubmit={onSubmit}
          onKeyDown={preventEnterSubmit}
          style={{ maxWidth: 720, padding: "20px 22px" }}
        >
          <div className="field">
            <span>左上のタイトル</span>
            <input
              type="text"
              value={branding.productTitle}
              onChange={(ev) => patchText({ productTitle: ev.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <span>生徒画面のバッジ（例: 生徒用）</span>
            <input
              type="text"
              value={branding.badgeLabel}
              onChange={(ev) => patchText({ badgeLabel: ev.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <span>教員画面のバッジ（例: 教員・運用）</span>
            <input
              type="text"
              value={branding.teacherBadgeLabel}
              onChange={(ev) => patchText({ teacherBadgeLabel: ev.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <span>学校名・表示名（空欄ならヘッダーに出しません）</span>
            <input
              type="text"
              value={branding.schoolDisplayName}
              onChange={(ev) => patchText({ schoolDisplayName: ev.target.value })}
              autoComplete="organization"
            />
          </div>

          <section className="appearance-preset-section" aria-labelledby="appearance-style-heading">
            <h2 id="appearance-style-heading" className="appearance-preset-section__title">
              画面スタイル
            </h2>
            <p className="appearance-preset-section__hint">
              ボタンは白文字＋濃いめのグラデーションで表示されます。視認性を優先した配色です。
            </p>

            {STUDENT_BRANDING_PRESET_CATEGORIES.map((cat) => {
              const presets = STUDENT_BRANDING_PRESETS.filter((p) => p.category === cat.id);
              if (presets.length === 0) return null;
              return (
                <div key={cat.id} className="appearance-preset-category">
                  <p className="appearance-preset-category__label">{cat.label}</p>
                  <div className="appearance-preset-grid" role="list">
                    {presets.map((preset) => {
                      const selected = activePresetId === preset.id;
                      const { primaryColor, accentColor } = preset.colors;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          role="listitem"
                          className={`appearance-preset-card${selected ? " appearance-preset-card--selected" : ""}`}
                          aria-pressed={selected}
                          aria-label={`${preset.name} — ${preset.description}`}
                          style={{
                            background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
                          }}
                          onClick={() => selectPreset(preset.id)}
                        >
                          <span className="appearance-preset-card__name">{preset.name}</span>
                          <span className="appearance-preset-card__desc">{preset.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

          <div
            className="appearance-preview-panel"
            style={shellStyle}
            data-style-preset={activePresetId}
          >
            <p className="appearance-preview-panel__label">プレビュー（装飾・ボタン・見出し）</p>
            <div className="appearance-preview-shell">
              <StudentBrandingThemeDecor presetId={activePresetId} compact />
              <div
                className="appearance-preview-header"
                style={{
                  background: `linear-gradient(90deg, ${branding.primaryColor}, ${branding.accentColor})`,
                }}
              >
                <span className="appearance-preview-header__title">{branding.productTitle}</span>
                <span className="appearance-preview-header__badge">{branding.badgeLabel}</span>
              </div>
              <div
                className="appearance-preview-body"
                style={{
                  background: `linear-gradient(180deg, ${branding.surfaceTintStart}, ${branding.surfaceTintEnd})`,
                }}
              >
                <main className="appearance-preview-main">
                <h3 style={{ color: branding.primaryColor }}>提出・結果画面の見出し</h3>
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                  背景の小道具とボタンの形を確認できます。本文エリアは読みやすさのため白背景のままです。
                </p>
                <div className="appearance-preview-actions">
                  <button
                    type="button"
                    className="appearance-preview-btn appearance-preview-btn--primary"
                    style={{
                      background: `linear-gradient(180deg, ${branding.accentColor}, ${branding.primaryColor})`,
                    }}
                  >
                    送信する
                  </button>
                  <span className="appearance-preview-btn appearance-preview-btn--ghost">キャンセル</span>
                </div>
                </main>
              </div>
            </div>
          </div>

          {activePresetId === "custom" ? (
            <fieldset className="appearance-custom-colors" style={{ border: "none", margin: 0, padding: 0 }}>
              <legend className="field" style={{ marginBottom: 8 }}>
                <span>カスタム色（上級者向け）</span>
              </legend>
              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                <label className="field" style={{ margin: 0 }}>
                  <span>メイン（見出し・強調）</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="color"
                      value={colorPickerValue(branding.primaryColor, DEFAULT_STUDENT_BRANDING.primaryColor)}
                      onChange={(ev) => patchColors({ primaryColor: ev.target.value })}
                      aria-label="メイン色"
                      style={{ width: 44, height: 44, padding: 0, border: "1px solid #cbd5e1", borderRadius: 8 }}
                    />
                    <input
                      type="text"
                      value={branding.primaryColor}
                      onChange={(ev) => patchColors({ primaryColor: ev.target.value })}
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
                      onChange={(ev) => patchColors({ accentColor: ev.target.value })}
                      aria-label="アクセント色"
                      style={{ width: 44, height: 44, padding: 0, border: "1px solid #cbd5e1", borderRadius: 8 }}
                    />
                    <input
                      type="text"
                      value={branding.accentColor}
                      onChange={(ev) => patchColors({ accentColor: ev.target.value })}
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
                      onChange={(ev) => patchColors({ surfaceTintStart: ev.target.value })}
                      aria-label="背景色（上）"
                      style={{ width: 44, height: 44, padding: 0, border: "1px solid #cbd5e1", borderRadius: 8 }}
                    />
                    <input
                      type="text"
                      value={branding.surfaceTintStart}
                      onChange={(ev) => patchColors({ surfaceTintStart: ev.target.value })}
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
                      onChange={(ev) => patchColors({ surfaceTintEnd: ev.target.value })}
                      aria-label="背景色（下）"
                      style={{ width: 44, height: 44, padding: 0, border: "1px solid #cbd5e1", borderRadius: 8 }}
                    />
                    <input
                      type="text"
                      value={branding.surfaceTintEnd}
                      onChange={(ev) => patchColors({ surfaceTintEnd: ev.target.value })}
                      pattern="^#[0-9A-Fa-f]{6}$"
                      style={{ flex: 1, minWidth: 0 }}
                    />
                  </div>
                </label>
              </div>
            </fieldset>
          ) : null}

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

          <p className="appearance-form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "保存中…" : "サーバーに保存"}
            </button>
          </p>
        </form>
      )}
    </main>
  );
}

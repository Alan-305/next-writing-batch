"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { RegisteredTaskIdField } from "@/components/RegisteredTaskIdField";

type SupportForm = {
  taskId: string;
  content: string;
};

const emptyForm = (): SupportForm => ({ taskId: "", content: "" });

export function NexusSupportForm() {
  const { user, profile } = useFirebaseAuthContext();
  const [form, setForm] = useState<SupportForm>(emptyForm);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "warning" | "error" | "">("");

  const profileLabel = useMemo(() => {
    const parts: string[] = [];
    if (profile?.studentNumber) parts.push(`学籍番号: ${profile.studentNumber}`);
    if (profile?.nickname) parts.push(`ニックネーム: ${profile.nickname}`);
    if (user?.email) parts.push(`返信先: ${user.email}`);
    return parts;
  }, [profile?.nickname, profile?.studentNumber, user?.email]);

  useEffect(() => {
    if (!user) setForm(emptyForm());
  }, [user]);

  const getAccessToken = async () => {
    if (!user) return null;
    return user.getIdToken();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setVariant("error");
      setMessage("送信にはログインが必要です。");
      return;
    }
    setSending(true);
    setMessage("");
    setVariant("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const json = await response.json();

      if (response.ok && json.ok) {
        setVariant("success");
        setMessage(json.message ?? "送信しました。");
        setForm(emptyForm());
      } else if (!response.ok && json.message) {
        setVariant("error");
        setMessage(json.message);
      } else {
        setVariant("error");
        setMessage(json.message ?? "送信に失敗しました。");
      }
    } catch {
      setVariant("error");
      setMessage("通信エラーが発生しました。再度お試しください。");
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="nexus-support-heading">
      <h2 id="nexus-support-heading">サポート・お問い合わせ</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        あなたのクラスの担当先生に届きます（控えは support@nexus-learning.com）。返信はログイン中の Google メール宛になります。
      </p>
      <form className="card" onSubmit={onSubmit}>
        <RegisteredTaskIdField
          value={form.taskId}
          onTaskIdChange={(tid) => setForm((p) => ({ ...p, taskId: tid }))}
          disabled={sending || !user}
          getAccessToken={getAccessToken}
        />
        {profileLabel.length > 0 ? (
          <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.92rem" }}>
            {profileLabel.join(" · ")}
          </p>
        ) : null}
        <label className="field">
          <span>お問い合わせ内容</span>
          <textarea
            rows={8}
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            required
            disabled={sending || !user}
            placeholder="内容をご記入ください。"
          />
        </label>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.92rem" }}>
          送信に失敗する場合は、しばらくしてから再度お試しください。
        </p>
        <button type="submit" disabled={sending || !user}>
          {sending ? "送信中" : "送信する"}
        </button>
      </form>

      {message ? (
        <p
          className={variant === "success" ? "success" : variant === "warning" ? "muted" : "error"}
          style={variant === "warning" ? { color: "#b45309" } : undefined}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

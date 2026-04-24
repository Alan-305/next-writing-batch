"use client";

import { FormEvent, useState } from "react";

const empty = { taskId: "", studentId: "", studentName: "", email: "", content: "" };

export function NexusSupportForm() {
  const [form, setForm] = useState(empty);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "warning" | "error" | "">("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setMessage("");
    setVariant("");
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await response.json();

      if (response.ok && json.ok && !json.partial) {
        setVariant("success");
        setMessage(json.message ?? "送信しました。");
        setForm(empty);
      } else if (response.ok && json.partial) {
        setVariant("warning");
        setMessage(json.message ?? "");
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
      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>課題ID</span>
          <input
            value={form.taskId}
            onChange={(e) => setForm((p) => ({ ...p, taskId: e.target.value }))}
            required
            disabled={sending}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>学籍番号</span>
          <input
            value={form.studentId}
            onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))}
            required
            disabled={sending}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>氏名</span>
          <input
            value={form.studentName}
            onChange={(e) => setForm((p) => ({ ...p, studentName: e.target.value }))}
            required
            disabled={sending}
            autoComplete="name"
          />
        </label>
        <label className="field">
          <span>メールアドレス</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
            disabled={sending}
            autoComplete="email"
          />
        </label>
        <label className="field">
          <span>サポート内容</span>
          <textarea
            rows={8}
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            required
            disabled={sending}
            placeholder="内容をご記入ください。"
          />
        </label>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.92rem" }}>
          送信に失敗する場合は、しばらくしてから再度お試しください。
        </p>
        <button type="submit" disabled={sending}>
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

"use client";

import { useState } from "react";

export function TensakuKakumeiSupportForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [feedback, setFeedback] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setFeedback("");
    try {
      const r = await fetch("/api/tensaku-kakumei/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, company }),
      });
      const data = (await r.json()) as { ok?: boolean; message?: string };
      if (r.ok && data.ok) {
        setStatus("ok");
        setFeedback(data.message ?? "送信しました。");
        setName("");
        setEmail("");
        setMessage("");
        setCompany("");
        return;
      }
      setStatus("err");
      setFeedback(data.message ?? "送信に失敗しました。");
    } catch {
      setStatus("err");
      setFeedback("通信に失敗しました。ネットワークをご確認ください。");
    }
  }

  return (
    <form className="tensaku-support-form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="tk-name">お名前</label>
        <input
          id="tk-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="tk-email">メールアドレス</label>
        <input
          id="tk-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="tk-company">会社名（空のままにしてください）</label>
        <input id="tk-company" name="company" type="text" tabIndex={-1} value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tk-message">お問い合わせ内容</label>
        <textarea
          id="tk-message"
          name="message"
          required
          maxLength={10000}
          rows={8}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? "送信中…" : "送信する"}
      </button>
      {feedback ? (
        <p className={status === "ok" ? "success" : "error"} style={{ marginTop: 12 }}>
          {feedback}
        </p>
      ) : null}
    </form>
  );
}

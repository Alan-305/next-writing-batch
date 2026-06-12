"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { RegisteredTaskIdField } from "@/components/RegisteredTaskIdField";

type SupportMessage = {
  id: string;
  role: "student" | "teacher";
  content: string;
  createdAt: string;
  taskId?: string;
};

type Props = {
  organizationId: string;
  /** 提出直後など、あらかじめ分かっている場合 */
  initialDisplayNick?: string;
  initialRedeemId?: string;
};

function formatWhen(iso: string): string {
  const t = iso.trim();
  if (!t) return "";
  try {
    return new Date(t).toLocaleString("ja-JP", { hour12: false });
  } catch {
    return t;
  }
}

export function StudentSupportMailbox({ organizationId, initialDisplayNick = "", initialRedeemId = "" }: Props) {
  const org = organizationId.trim();
  const [displayNick, setDisplayNick] = useState(initialDisplayNick);
  const [redeemId, setRedeemId] = useState(initialRedeemId);
  const [taskId, setTaskId] = useState("");
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (initialDisplayNick) setDisplayNick(initialDisplayNick);
    if (initialRedeemId) setRedeemId(initialRedeemId);
  }, [initialDisplayNick, initialRedeemId]);

  const loadMessages = useCallback(async () => {
    const nick = displayNick.trim();
    const redeem = redeemId.trim();
    if (!org || !nick || !redeem) {
      setMessage("ニックネームと引換IDを入力してください。");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({
        organizationId: org,
        displayNick: nick,
        redeemId: redeem,
      });
      const res = await fetch(`/api/support/anonymous?${params.toString()}`);
      const json = (await res.json()) as { ok?: boolean; messages?: SupportMessage[]; message?: string };
      if (!res.ok || !json.ok) {
        setMessages([]);
        setMessage(json.message ?? "メッセージを読み込めませんでした。");
        return;
      }
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setOpened(true);
    } catch {
      setMessage("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [displayNick, org, redeemId]);

  useEffect(() => {
    if (initialDisplayNick.trim() && initialRedeemId.trim()) {
      void loadMessages();
    }
  }, [initialDisplayNick, initialRedeemId, loadMessages]);

  const onOpen = (event: FormEvent) => {
    event.preventDefault();
    void loadMessages();
  };

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    const nick = displayNick.trim();
    const redeem = redeemId.trim();
    const body = content.trim();
    if (!nick || !redeem || !body) {
      setMessage("ニックネーム、引換ID、お問い合わせ内容を入力してください。");
      return;
    }
    setSending(true);
    setMessage("");
    try {
      const res = await fetch("/api/support/anonymous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org,
          displayNick: nick,
          redeemId: redeem,
          content: body,
          ...(taskId.trim() ? { taskId: taskId.trim() } : {}),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setMessage(json.message ?? "送信に失敗しました。");
        return;
      }
      setContent("");
      setMessage(json.message ?? "送信しました。");
      await loadMessages();
    } catch {
      setMessage("通信エラーが発生しました。");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card" style={{ marginTop: 24 }} aria-labelledby="student-support-mailbox-heading">
      <h2 id="student-support-mailbox-heading" style={{ marginTop: 0, fontSize: "1.15rem" }}>
        サポート・メッセージボックス
      </h2>
      <p className="muted" style={{ margin: "0 0 14px", lineHeight: 1.6 }}>
        質問は担当の先生に届きます。先生からの<strong>返信はこのボックス</strong>に表示されます（ニックネームと引換IDで確認）。
      </p>

      <form onSubmit={onOpen} style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <label className="field">
          <span>ニックネーム</span>
          <input
            value={displayNick}
            onChange={(e) => setDisplayNick(e.target.value)}
            autoComplete="off"
            maxLength={24}
            disabled={loading || sending}
          />
        </label>
        <label className="field">
          <span>引換ID</span>
          <input
            value={redeemId}
            onChange={(e) => setRedeemId(e.target.value)}
            autoComplete="off"
            style={{ fontFamily: "monospace", letterSpacing: "0.04em" }}
            disabled={loading || sending}
          />
        </label>
        <button type="submit" disabled={loading || sending} style={{ minHeight: 44, justifySelf: "start" }}>
          {loading ? "読み込み中..." : opened ? "メッセージを再読み込み" : "メッセージボックスを開く"}
        </button>
      </form>

      {opened ? (
        <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
          {messages.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              まだメッセージはありません。下のフォームから質問を送れます。
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: m.role === "teacher" ? "2px solid #2563eb" : "1px solid #e2e8f0",
                  background: m.role === "teacher" ? "linear-gradient(180deg, #eff6ff 0%, #fff 100%)" : "#fafafa",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <strong style={{ color: m.role === "teacher" ? "#1d4ed8" : "#334155" }}>
                    {m.role === "teacher" ? "先生からの返信" : "あなたの質問"}
                  </strong>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {formatWhen(m.createdAt)}
                  </span>
                </div>
                {m.taskId ? (
                  <p className="muted" style={{ margin: "0 0 6px", fontSize: "0.88rem" }}>
                    課題ID: {m.taskId}
                  </p>
                ) : null}
                <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{m.content}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      <form onSubmit={onSend} style={{ display: "grid", gap: 12 }}>
        <RegisteredTaskIdField
          value={taskId}
          onTaskIdChange={(tid) => setTaskId(tid)}
          disabled={sending}
          publicOrganizationId={org}
        />
        <label className="field">
          <span>お問い合わせ内容</span>
          <textarea
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="質問や困っていることを書いてください。"
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
            }}
          />
        </label>
        <button type="submit" disabled={sending} style={{ minHeight: 44, justifySelf: "start" }}>
          {sending ? "送信中..." : "先生に質問を送る"}
        </button>
      </form>

      {message ? <p className={message.includes("送信") ? "success" : "error"} style={{ marginTop: 12 }}>{message}</p> : null}
    </section>
  );
}

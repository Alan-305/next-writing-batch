"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { OPS_DASHBOARD_LABEL } from "@/lib/ops/ops-dashboard-label";

type ThreadSummary = {
  threadId: string;
  displayNick: string;
  redeemId: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string;
  lastMessageRole: "student" | "teacher";
};

type SupportMessage = {
  id: string;
  role: "student" | "teacher";
  content: string;
  createdAt: string;
  taskId?: string;
};

function formatWhen(iso: string): string {
  const t = iso.trim();
  if (!t) return "—";
  try {
    return new Date(t).toLocaleString("ja-JP", { hour12: false });
  } catch {
    return t;
  }
}

export function OpsStudentSupportPageClient() {
  const { user, authLoading } = useFirebaseAuthContext();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const selectedThread = useMemo(
    () => threads.find((t) => t.threadId === selectedId) ?? null,
    [threads, selectedId],
  );

  const loadThreads = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/ops/student-support-threads", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { ok?: boolean; threads?: ThreadSummary[]; message?: string };
    if (!res.ok || !json.ok) {
      throw new Error(json.message ?? "一覧を読み込めませんでした。");
    }
    setThreads(Array.isArray(json.threads) ? json.threads : []);
  }, [user]);

  const loadThreadDetail = useCallback(
    async (threadId: string) => {
      if (!user || !threadId) return;
      const token = await user.getIdToken();
      const params = new URLSearchParams({ threadId });
      const res = await fetch(`/api/ops/student-support-threads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        ok?: boolean;
        messages?: SupportMessage[];
        thread?: ThreadSummary;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? "スレッドを読み込めませんでした。");
      }
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      if (json.thread) {
        setThreads((prev) => {
          const idx = prev.findIndex((t) => t.threadId === json.thread!.threadId);
          if (idx < 0) return [...prev, json.thread!];
          const copy = [...prev];
          copy[idx] = json.thread!;
          return copy;
        });
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoadErr("ログインが必要です。");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await loadThreads();
        if (!cancelled) setLoadErr("");
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "読み込みに失敗しました。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, loadThreads]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadThreadDetail(selectedId).catch((e) => {
      setStatus(e instanceof Error ? e.message : "読み込みに失敗しました。");
    });
  }, [selectedId, loadThreadDetail]);

  const onReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !selectedId) return;
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    setStatus("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/student-support-threads/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId: selectedId, content: body }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setStatus(json.message ?? "返信に失敗しました。");
        return;
      }
      setReply("");
      setStatus(json.message ?? "返信しました。");
      await loadThreadDetail(selectedId);
      await loadThreads();
    } catch {
      setStatus("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1 style={{ marginTop: 0 }}>{OPS_DASHBOARD_LABEL} — 生徒サポート</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        匿名生徒からの質問への返信は、生徒のメッセージボックスに表示されます。
      </p>

      {loadErr ? <p className="error">{loadErr}</p> : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 16, alignItems: "start" }}>
        <section className="card" aria-label="スレッド一覧">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>問い合わせ一覧</h2>
          {threads.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              まだ問い合わせはありません。
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {threads.map((t) => (
                <li key={t.threadId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.threadId)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      minHeight: 44,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: selectedId === t.threadId ? "2px solid #2563eb" : "1px solid #e2e8f0",
                      background: selectedId === t.threadId ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{t.displayNick}</div>
                    <div className="muted" style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>
                      {t.redeemId}
                    </div>
                    <div style={{ fontSize: "0.88rem", marginTop: 4, lineHeight: 1.4 }}>
                      {t.lastMessageRole === "student" ? "🟡 未返信" : "✓ 返信済"} — {t.lastMessagePreview}
                    </div>
                    <div className="muted" style={{ fontSize: "0.8rem", marginTop: 4 }}>
                      更新: {formatWhen(t.updatedAt)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-label="スレッド詳細">
          {!selectedThread ? (
            <p className="muted" style={{ margin: 0 }}>
              左の一覧からスレッドを選んでください。
            </p>
          ) : (
            <>
              <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>
                {selectedThread.displayNick}
                <span className="muted" style={{ fontWeight: 400, marginLeft: 8, fontFamily: "monospace" }}>
                  {selectedThread.redeemId}
                </span>
              </h2>

              <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: m.role === "teacher" ? "1px solid #93c5fd" : "1px solid #fde68a",
                      background: m.role === "teacher" ? "#f8fafc" : "#fffbeb",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <strong>{m.role === "teacher" ? "先生（あなた）" : "生徒"}</strong>
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
                ))}
              </div>

              <form onSubmit={onReply} style={{ display: "grid", gap: 10 }}>
                <label className="field">
                  <span>返信（生徒のメッセージボックスに届きます）</span>
                  <textarea
                    rows={5}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    disabled={busy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
                    }}
                  />
                </label>
                <button type="submit" disabled={busy || !reply.trim()} style={{ minHeight: 44, justifySelf: "start" }}>
                  {busy ? "送信中..." : "返信を送る"}
                </button>
              </form>
            </>
          )}
          {status ? <p className="success" style={{ marginTop: 12 }}>{status}</p> : null}
        </section>
      </div>
    </main>
  );
}

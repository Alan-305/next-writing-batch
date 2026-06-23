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
  hasTeacherReply: boolean;
  needsReply: boolean;
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

function SupportThreadBadges({ thread }: { thread: ThreadSummary }) {
  return (
    <div className="ops-support-thread-badges" aria-label="対応状況">
      {thread.hasTeacherReply ? (
        <span className="ops-support-badge ops-support-badge--replied">返信済</span>
      ) : (
        <span className="ops-support-badge ops-support-badge--pending">未返信</span>
      )}
      {thread.hasTeacherReply && thread.needsReply ? (
        <span className="ops-support-badge ops-support-badge--followup">再問い合わせ</span>
      ) : null}
    </div>
  );
}

export function OpsStudentSupportPageClient() {
  const { user, authLoading } = useFirebaseAuthContext();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
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

  const onDeleteThread = async () => {
    if (!user || !selectedThread) return;
    const label = `${selectedThread.displayNick}（${selectedThread.redeemId}）`;
    const ok = window.confirm(
      `「${label}」の問い合わせを削除しますか？\nメッセージはすべて消え、生徒側のメッセージボックスからも見えなくなります。`,
    );
    if (!ok) return;

    setDeleteBusy(true);
    setStatus("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/student-support-threads", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId: selectedThread.threadId }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setStatus(json.message ?? "削除に失敗しました。");
        return;
      }
      setSelectedId("");
      setMessages([]);
      setStatus(json.message ?? "問い合わせを削除しました。");
      await loadThreads();
    } catch {
      setStatus("通信エラーが発生しました。");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <main className="ops-student-support-page">
      <h1 style={{ marginTop: 0 }}>{OPS_DASHBOARD_LABEL} — 生徒サポート</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        匿名生徒からの質問への返信は、生徒のメッセージボックスに表示されます。
      </p>

      {loadErr ? <p className="error">{loadErr}</p> : null}

      <div className="ops-student-support-layout">
        <section className="card" aria-label="スレッド一覧">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>問い合わせ一覧</h2>
          {threads.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              まだ問い合わせはありません。
            </p>
          ) : (
            <ul className="ops-support-thread-list">
              {threads.map((t) => (
                <li key={t.threadId}>
                  <button
                    type="button"
                    className={`ops-support-thread-item${selectedId === t.threadId ? " ops-support-thread-item--active" : ""}`}
                    onClick={() => setSelectedId(t.threadId)}
                  >
                    <div className="ops-support-thread-item__head">
                      <div className="ops-support-thread-item__nick">{t.displayNick}</div>
                      <SupportThreadBadges thread={t} />
                    </div>
                    <div className="muted ops-support-thread-item__redeem">{t.redeemId}</div>
                    <div className="ops-support-thread-item__preview">{t.lastMessagePreview}</div>
                    <div className="muted ops-support-thread-item__updated">更新: {formatWhen(t.updatedAt)}</div>
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
              <div className="ops-support-detail-head">
                <div>
                  <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>
                    {selectedThread.displayNick}
                    <span className="muted ops-support-detail-head__redeem">{selectedThread.redeemId}</span>
                  </h2>
                  <SupportThreadBadges thread={selectedThread} />
                </div>
                <button
                  type="button"
                  className="ops-btn ops-btn--danger ops-btn--compact"
                  disabled={deleteBusy || busy}
                  onClick={() => void onDeleteThread()}
                >
                  {deleteBusy ? "削除中…" : "削除"}
                </button>
              </div>

              <div className="ops-support-messages">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`ops-support-message ops-support-message--${m.role}`}
                  >
                    <div className="ops-support-message__meta">
                      <strong>{m.role === "teacher" ? "先生（あなた）" : "生徒"}</strong>
                      <span className="muted">{formatWhen(m.createdAt)}</span>
                    </div>
                    {m.taskId ? (
                      <p className="muted ops-support-message__task">課題ID: {m.taskId}</p>
                    ) : null}
                    <p className="ops-support-message__body">{m.content}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={onReply} className="ops-support-reply-form">
                <label className="field">
                  <span>返信（生徒のメッセージボックスに届きます）</span>
                  <textarea
                    rows={5}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    disabled={busy || deleteBusy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
                    }}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || deleteBusy || !reply.trim()}
                  className="ops-support-reply-form__submit"
                >
                  {busy ? "送信中..." : "返信を送る"}
                </button>
              </form>
            </>
          )}
          {status ? <p className="success ops-support-status">{status}</p> : null}
        </section>
      </div>
    </main>
  );
}

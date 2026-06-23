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
  hiddenFromTeacherList: boolean;
  hiddenFromTeacherListAt: string;
};

type SupportMessage = {
  id: string;
  role: "student" | "teacher";
  content: string;
  createdAt: string;
  taskId?: string;
};

type StatusFilter = "all" | "pending" | "replied" | "followup" | "hidden";
type SortKey = "updatedDesc" | "updatedAsc" | "nickAsc";

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
      {thread.hiddenFromTeacherList ? (
        <span className="ops-support-badge ops-support-badge--hidden">非表示</span>
      ) : null}
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

function matchesStatusFilter(thread: ThreadSummary, filter: StatusFilter): boolean {
  if (filter === "hidden") return thread.hiddenFromTeacherList;
  if (thread.hiddenFromTeacherList) return false;
  if (filter === "all") return true;
  if (filter === "pending") return !thread.hasTeacherReply;
  if (filter === "replied") return thread.hasTeacherReply && !thread.needsReply;
  if (filter === "followup") return thread.hasTeacherReply && thread.needsReply;
  return true;
}

function sortThreads(threads: ThreadSummary[], sortKey: SortKey): ThreadSummary[] {
  const copy = [...threads];
  copy.sort((a, b) => {
    if (sortKey === "updatedAsc") return a.updatedAt.localeCompare(b.updatedAt);
    if (sortKey === "nickAsc") return a.displayNick.localeCompare(b.displayNick, "ja");
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return copy;
}

export function OpsStudentSupportPageClient() {
  const { user, authLoading } = useFirebaseAuthContext();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [hideBusy, setHideBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedDesc");

  const selectedThread = useMemo(
    () => threads.find((t) => t.threadId === selectedId) ?? null,
    [threads, selectedId],
  );

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = threads.filter((t) => {
      if (!matchesStatusFilter(t, statusFilter)) return false;
      if (!q) return true;
      const hay = `${t.displayNick} ${t.redeemId} ${t.lastMessagePreview}`.toLowerCase();
      return hay.includes(q);
    });
    return sortThreads(filtered, sortKey);
  }, [threads, query, statusFilter, sortKey]);

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

  const onSetHidden = async (thread: ThreadSummary, hidden: boolean) => {
    if (!user) return;
    if (hidden) {
      const label = `${thread.displayNick}（${thread.redeemId}）`;
      const ok = window.confirm(
        `「${label}」を問い合わせ一覧から非表示にしますか？\n生徒のメッセージは削除されず、生徒側のメッセージボックスには残ります。`,
      );
      if (!ok) return;
    }

    setHideBusy(true);
    setStatus("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/student-support-threads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId: thread.threadId, hidden }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setStatus(json.message ?? "更新に失敗しました。");
        return;
      }
      if (hidden && selectedId === thread.threadId) {
        setSelectedId("");
        setMessages([]);
      }
      setStatus(json.message ?? (hidden ? "非表示にしました。" : "再表示しました。"));
      await loadThreads();
    } catch {
      setStatus("通信エラーが発生しました。");
    } finally {
      setHideBusy(false);
    }
  };

  return (
    <main className="ops-student-support-page">
      <h1 style={{ marginTop: 0 }}>{OPS_DASHBOARD_LABEL} — 生徒サポート</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        匿名生徒からの質問への返信は、生徒のメッセージボックスに表示されます。対応不要の問い合わせは一覧から<strong>非表示</strong>にできます（メッセージは削除されません）。
      </p>

      {loadErr ? <p className="error">{loadErr}</p> : null}

      <div className="ops-student-support-layout">
        <section className="card" aria-label="スレッド一覧">
          <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>問い合わせ一覧</h2>

          <div className="ops-support-list-controls">
            <label className="field ops-support-list-controls__search">
              <span className="sr-only">検索</span>
              <input
                type="search"
                value={query}
                placeholder="ニック名・ID・本文で検索"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </label>
            <label className="field ops-support-list-controls__filter">
              <span>絞り込み</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">すべて（非表示除く）</option>
                <option value="pending">未返信</option>
                <option value="replied">返信済</option>
                <option value="followup">再問い合わせ</option>
                <option value="hidden">非表示のみ</option>
              </select>
            </label>
            <label className="field ops-support-list-controls__sort">
              <span>並べ替え</span>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="updatedDesc">更新日（新しい順）</option>
                <option value="updatedAsc">更新日（古い順）</option>
                <option value="nickAsc">ニック名（あいうえお順）</option>
              </select>
            </label>
          </div>

          {visibleThreads.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              {threads.length === 0 ? "まだ問い合わせはありません。" : "条件に一致する問い合わせはありません。"}
            </p>
          ) : (
            <ul className="ops-support-thread-list">
              {visibleThreads.map((t) => (
                <li key={t.threadId} className="ops-support-thread-row">
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
                  <button
                    type="button"
                    className="ops-btn ops-btn--ghost ops-btn--compact ops-support-thread-row__hide"
                    disabled={hideBusy || busy}
                    title={t.hiddenFromTeacherList ? "一覧に再表示" : "対応不要として非表示"}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onSetHidden(t, !t.hiddenFromTeacherList);
                    }}
                  >
                    {t.hiddenFromTeacherList ? "再表示" : "非表示"}
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
              </div>

              <div className="ops-support-messages">
                {messages.map((m) => (
                  <div key={m.id} className={`ops-support-message ops-support-message--${m.role}`}>
                    <div className="ops-support-message__meta">
                      <strong>{m.role === "teacher" ? "先生（あなた）" : "生徒"}</strong>
                      <span className="muted">{formatWhen(m.createdAt)}</span>
                    </div>
                    {m.taskId ? <p className="muted ops-support-message__task">課題ID: {m.taskId}</p> : null}
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
                    disabled={busy || hideBusy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
                    }}
                  />
                </label>
                <button type="submit" disabled={busy || hideBusy || !reply.trim()} className="ops-support-reply-form__submit">
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

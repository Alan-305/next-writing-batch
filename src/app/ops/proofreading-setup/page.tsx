"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { TextareaWithFileDrop } from "@/components/TextareaWithFileDrop";
import {
  clampInt,
  isProofreadingSetupJson,
  parseProofreadingSetupJson,
  sanitizeProofreadingSetup,
  type ProofreadingSetupJson,
} from "@/lib/proofreading-setup-json";
import type { RegisteredTaskSummary } from "@/lib/registered-tasks-list";
import { OPS_DASHBOARD_LABEL } from "@/lib/ops/ops-dashboard-label";
import { validateTaskIdForStorage } from "@/lib/task-id-policy";

function defaultFilename(label: string): string {
  const s = (label || "設定").trim().slice(0, 18).replace(/[/\\:*?"<>|]/g, "_");
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `添削作業設定_${s}_${y}${mo}${da}.json`;
}

export default function ProofreadingSetupPage() {
  const { user } = useFirebaseAuthContext();
  const [setup, setSetup] = useState<ProofreadingSetupJson>(() => sanitizeProofreadingSetup({}));
  const [structuredQuestion, setStructuredQuestion] = useState(false);
  const [message, setMessage] = useState("");
  const [savingServer, setSavingServer] = useState(false);
  const [loadingServer, setLoadingServer] = useState(false);
  const [registryTasks, setRegistryTasks] = useState<RegisteredTaskSummary[]>([]);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [selectedDeleteTaskId, setSelectedDeleteTaskId] = useState("");
  const [deletingRegistry, setDeletingRegistry] = useState(false);
  const [deleteAwaitingConfirm, setDeleteAwaitingConfirm] = useState(false);
  const jsonFileRef = useRef<HTMLInputElement>(null);

  const totalPoints = setup.content_max + setup.grammar_max;

  const registryTaskIdSet = useMemo(
    () => new Set(registryTasks.map((t) => t.taskId)),
    [registryTasks],
  );
  const loadTaskSelectValue =
    registryTaskIdSet.has((setup.task_id ?? "").trim()) ? (setup.task_id ?? "").trim() : "";

  const authHeader = useCallback(async (): Promise<Record<string, string> | null> => {
    if (!user) return null;
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  const loadRegistryTasks = useCallback(async (opts?: { quiet?: boolean }) => {
    setRegistryLoading(true);
    try {
      const ah = await authHeader();
      const res = await fetch("/api/tasks/registry", {
        headers: ah ? { ...ah } : {},
      });
      const j = (await res.json()) as { ok?: boolean; tasks?: RegisteredTaskSummary[]; message?: string };
      if (!res.ok || !j?.ok) {
        if (!opts?.quiet) {
          setMessage(j?.message ?? "登録済み課題一覧の取得に失敗しました。");
        }
        setRegistryTasks([]);
        return;
      }
      setRegistryTasks(Array.isArray(j.tasks) ? j.tasks : []);
    } catch {
      if (!opts?.quiet) {
        setMessage("通信エラーで登録済み課題一覧を取得できませんでした。");
      }
      setRegistryTasks([]);
    } finally {
      setRegistryLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    void loadRegistryTasks();
  }, [loadRegistryTasks]);

  const patchSetup = useCallback((patch: Partial<ProofreadingSetupJson>) => {
    setSetup((prev) => sanitizeProofreadingSetup({ ...prev, ...patch }));
  }, []);

  const applyPayload = useCallback((p: ProofreadingSetupJson) => {
    setSetup(sanitizeProofreadingSetup(p));
  }, []);

  const onSaveJson = () => {
    const tidErr = validateTaskIdForStorage(setup.task_id);
    if (tidErr) {
      setMessage(tidErr);
      return;
    }
    if (!setup.question.trim()) {
      setMessage("問題文（課題）を入力してから JSON を保存してください。");
      return;
    }
    setMessage("");
    const blob = new Blob([JSON.stringify(setup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = defaultFilename(setup.problem_memo || setup.task_id);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onPickJsonFile = () => jsonFileRef.current?.click();

  const onJsonFile = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        if (!isProofreadingSetupJson(parsed)) {
          setMessage("添削設定の JSON ではありません（schema_version または既知のキーがありません）。");
          return;
        }
        const next = parseProofreadingSetupJson(parsed);
        if (!next) {
          setMessage("JSON を解釈できませんでした。");
          return;
        }
        applyPayload(next);
        setMessage("JSON をフォームに読み込みました。");
      } catch {
        setMessage("JSON の形式が正しくありません。");
      }
    };
    reader.readAsText(f, "UTF-8");
    if (jsonFileRef.current) jsonFileRef.current.value = "";
  };

  const onSaveToServer = async () => {
    if (!setup.task_id.trim()) {
      setMessage("サーバーに保存するには課題ID（task_id）を入力してください。");
      return;
    }
    const tidErr = validateTaskIdForStorage(setup.task_id);
    if (tidErr) {
      setMessage(tidErr);
      return;
    }
    if (!setup.question.trim()) {
      setMessage("問題文（課題）を入力してからサーバーに保存してください。");
      return;
    }
    setSavingServer(true);
    setMessage("");
    try {
      const ah = await authHeader();
      if (!ah) {
        setMessage("ログインしてください（教員・運用画面は Google ログインが必要です）。");
        return;
      }
      const res = await fetch("/api/ops/teacher-proofreading-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ah },
        body: JSON.stringify(setup),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) {
        setMessage(j?.message ?? "サーバーへの保存に失敗しました。");
        return;
      }
      setMessage(j?.message ?? "サーバーに保存しました。");
      void loadRegistryTasks({ quiet: true });
    } catch {
      setMessage("通信エラーで保存できませんでした。");
    } finally {
      setSavingServer(false);
    }
  };

  const onLoadFromServer = async () => {
    if (!setup.task_id.trim()) {
      setMessage("サーバーから読み込むには課題ID（task_id）を入力してください。");
      return;
    }
    const tidErr = validateTaskIdForStorage(setup.task_id);
    if (tidErr) {
      setMessage(tidErr);
      return;
    }
    setLoadingServer(true);
    setMessage("");
    try {
      const ah = await authHeader();
      if (!ah) {
        setMessage("ログインしてください（教員・運用画面は Google ログインが必要です）。");
        return;
      }
      const q = encodeURIComponent(setup.task_id.trim());
      const res = await fetch(`/api/ops/teacher-proofreading-setup?taskId=${q}`, {
        method: "GET",
        headers: { ...ah },
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; setup?: ProofreadingSetupJson };
      if (!res.ok || !j?.setup) {
        setMessage(j?.message ?? "サーバーからの読み込みに失敗しました。");
        return;
      }
      applyPayload(j.setup);
      setMessage(`課題ID「${setup.task_id.trim()}」の設定をサーバーから読み込みました。`);
    } catch {
      setMessage("通信エラーで読み込めませんでした。");
    } finally {
      setLoadingServer(false);
    }
  };

  const copyQuestion = async () => {
    const q = setup.question.trim();
    if (!q) {
      setMessage("コピーする課題文がありません。");
      return;
    }
    try {
      await navigator.clipboard.writeText(q);
      setMessage(
        "課題文をクリップボードにコピーしました。（生徒提出は課題プルダウンから選ぶため、通常は貼り付け不要です。）",
      );
    } catch {
      setMessage("コピーに失敗しました。課題文を手で選択してコピーしてください。");
    }
  };

  const notify = (msg: string) => {
    setMessage(msg);
  };

  const requestDeleteConfirmation = () => {
    const tid = selectedDeleteTaskId.trim();
    if (!tid) {
      setMessage("削除する課題を一覧から選んでください。");
      return;
    }
    setMessage("");
    setDeleteAwaitingConfirm(true);
  };

  const cancelDeleteConfirmation = () => {
    setDeleteAwaitingConfirm(false);
  };

  const executeDeleteFromServer = async () => {
    const tid = selectedDeleteTaskId.trim();
    if (!tid) {
      setDeleteAwaitingConfirm(false);
      setMessage("削除する課題を一覧から選んでください。");
      return;
    }
    setDeletingRegistry(true);
    setMessage("");
    try {
      const ah = await authHeader();
      if (!ah) {
        setDeletingRegistry(false);
        setMessage("ログインしてください（教員・運用画面は Google ログインが必要です）。");
        return;
      }
      const q = encodeURIComponent(tid);
      const res = await fetch(`/api/ops/registered-task?taskId=${q}`, { method: "DELETE", headers: { ...ah } });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !j?.ok) {
        setMessage(j?.message ?? "サーバーからの削除に失敗しました。");
        return;
      }
      setMessage(j?.message ?? "削除しました。");
      setSelectedDeleteTaskId("");
      setDeleteAwaitingConfirm(false);
      await loadRegistryTasks({ quiet: true });
    } catch {
      setMessage("通信エラーで削除できませんでした。");
    } finally {
      setDeletingRegistry(false);
    }
  };

  const messageClass =
    message.includes("コピーしました") ||
    message.includes("読み込みました") ||
    message.includes("フォームに読み込み") ||
    message.includes("設定 JSON") ||
    message.includes("取り込みが完了") ||
    message.includes("JSON の問題文") ||
    message.includes("クリップボード") ||
    message.includes("サーバーに保存しました") ||
    message.includes("としてサーバーに保存") ||
    message.includes("削除しました")
      ? "success"
      : message.includes("失敗") ||
          message.includes("未対応") ||
          message.includes("ではありません") ||
          message.includes("形式が正しく") ||
          message.includes("入力してから")
        ? "error"
        : message.includes("テキストがありません")
          ? "muted"
          : "error";

  return (
    <main>
      <h1>課題・添削設定</h1>
      <p>
        <Link href="/ops">{OPS_DASHBOARD_LABEL}</Link> · <Link href="/submit">提出（生徒）</Link>
      </p>

      <div className="card">
        <h2>課題設定</h2>

        <label className="field">
          <span>新規課題ID</span>
          <input
            value={setup.task_id ?? ""}
            onChange={(e) => patchSetup({ task_id: e.target.value })}
            placeholder="例: 2026_english_essay_02（半角英数字と ._- のみ）"
            autoComplete="off"
          />
          <span className="muted" style={{ fontSize: "0.9em", display: "block", marginTop: 4 }}>
            半角の英数字と <strong>._-</strong> のみ。生徒の提出画面の課題一覧にも使われます。
          </span>
        </label>

        <div className="field">
          <label>
            <span>登録済みの課題IDを選ぶ</span>
            <select
              value={loadTaskSelectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v) patchSetup({ task_id: v });
              }}
              disabled={registryLoading}
              style={{ width: "100%", maxWidth: "100%" }}
            >
              <option value="">プルダウンで選択</option>
              {registryTasks.map((t) => (
                <option key={t.taskId} value={t.taskId}>
                  {t.displayLabel} — {t.taskId}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 10 }}>
            <button
              type="button"
              onClick={() => void onLoadFromServer()}
              disabled={loadingServer || !setup.task_id.trim()}
            >
              {loadingServer ? "読み込み中…" : "課題を読み込む"}
            </button>
            {registryLoading && registryTasks.length === 0 ? (
              <span className="muted" style={{ fontSize: "0.9em" }}>
                一覧を取得中…
              </span>
            ) : null}
          </div>
        </div>

        <label className="field">
          <span>課題内容メモ（任意）</span>
          <input
            type="text"
            maxLength={120}
            value={setup.problem_memo ?? ""}
            onChange={(e) => patchSetup({ problem_memo: e.target.value })}
            placeholder="例: 2026 英作文 第2回"
            autoComplete="off"
          />
          <span className="muted" style={{ fontSize: "0.9em", display: "block", marginTop: 4 }}>
            生徒の課題選択プルダウンに表示される名前です。
          </span>
        </label>

        <div className="field" style={{ display: "flex", flexWrap: "wrap", gap: "12px 20px", alignItems: "center" }}>
          <label>
            内容点（満点）{" "}
            <input
              type="number"
              min={1}
              max={100}
              value={Number.isFinite(setup.content_max) ? setup.content_max : 25}
              onChange={(e) =>
                patchSetup({ content_max: clampInt(parseInt(e.target.value, 10) || 1, 1, 100) })
              }
              style={{ width: "5rem", padding: 8 }}
            />
          </label>
          <label>
            文法点（満点）{" "}
            <input
              type="number"
              min={1}
              max={100}
              value={Number.isFinite(setup.grammar_max) ? setup.grammar_max : 25}
              onChange={(e) =>
                patchSetup({ grammar_max: clampInt(parseInt(e.target.value, 10) || 1, 1, 100) })
              }
              style={{ width: "5rem", padding: 8 }}
            />
          </label>
          <span className="muted" style={{ margin: 0 }}>
            合計: {totalPoints} 点
          </span>
        </div>

        <TextareaWithFileDrop
          label="問題文（課題）"
          rows={10}
          placeholder="Write your opinion in about 80 words ... など"
          value={setup.question ?? ""}
          onChange={(question) => patchSetup({ question })}
          confirmOnAppend={false}
          jsonDropBehavior="setup-full"
          onSetupJsonImport={applyPayload}
          onNotify={(msg, _v) => notify(msg)}
          structuredProblemReading={{
            checked: structuredQuestion,
            onChange: setStructuredQuestion,
          }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <button type="button" onClick={onSaveToServer} disabled={savingServer}>
            {savingServer ? "保存中…" : "サーバーに保存"}
          </button>
          <button type="button" onClick={onSaveJson}>
            JSON をダウンロード
          </button>
          <button type="button" onClick={onPickJsonFile}>
            JSON を読み込む…
          </button>
          <input
            ref={jsonFileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => onJsonFile(e.target.files)}
          />
          <button type="button" onClick={copyQuestion}>
            課題文だけコピー
          </button>
        </div>
      </div>

      <div className="card">
        <h2>サーバー登録の削除</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          不要になった課題を<strong>サーバー上から削除</strong>すると、生徒の提出画面の<strong>プルダウン</strong>からも消えます。既存の提出データは削除されません。
        </p>
        <label className="field">
          <span>登録済み課題から選ぶ</span>
          <select
            value={selectedDeleteTaskId}
            onChange={(e) => {
              setSelectedDeleteTaskId(e.target.value);
              setDeleteAwaitingConfirm(false);
            }}
            disabled={registryLoading || deletingRegistry}
            style={{ width: "100%", maxWidth: "100%" }}
          >
            <option value="">（削除する課題を選んでください）</option>
            {registryTasks.map((t) => (
              <option key={t.taskId} value={t.taskId}>
                {t.displayLabel} — {t.taskId}
              </option>
            ))}
          </select>
        </label>
        {registryLoading && registryTasks.length === 0 ? (
          <p className="muted">一覧を読み込み中…</p>
        ) : !registryLoading && registryTasks.length === 0 ? (
          <p className="muted">登録済みの課題がありません。</p>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button type="button" onClick={() => void loadRegistryTasks()} disabled={registryLoading}>
            {registryLoading ? "一覧取得中…" : "一覧を再読み込み"}
          </button>
          <button
            type="button"
            onClick={requestDeleteConfirmation}
            disabled={
              !selectedDeleteTaskId || deletingRegistry || registryLoading || deleteAwaitingConfirm
            }
            style={{ background: "#b91c1c" }}
          >
            選択した課題をサーバーから削除
          </button>
        </div>
        {deleteAwaitingConfirm && selectedDeleteTaskId.trim() ? (
          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 8,
              border: "1px solid #fca5a5",
              background: "#fef2f2",
            }}
          >
            <p style={{ margin: "0 0 8px" }}>
              <strong>削除の確認</strong>
            </p>
            <p className="muted" style={{ margin: "0 0 12px" }}>
              次の課題をサーバーから削除します。生徒の提出フォームのプルダウンから消えます。既存の提出データは残ります。
            </p>
            <ul style={{ margin: "0 0 14px", paddingLeft: "1.25rem" }}>
              <li>
                表示名:{" "}
                <strong>
                  {registryTasks.find((t) => t.taskId === selectedDeleteTaskId)?.displayLabel ??
                    selectedDeleteTaskId}
                </strong>
              </li>
              <li>
                課題ID: <code>{selectedDeleteTaskId}</code>
              </li>
            </ul>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="button" onClick={cancelDeleteConfirmation} disabled={deletingRegistry}>
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteFromServer()}
                disabled={deletingRegistry}
                style={{ background: "#b91c1c" }}
              >
                {deletingRegistry ? "削除中…" : "削除を実行する"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {message ? <p className={messageClass === "muted" ? "muted" : messageClass}>{message}</p> : null}
    </main>
  );
}

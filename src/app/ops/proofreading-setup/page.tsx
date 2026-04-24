"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { TextareaWithFileDrop } from "@/components/TextareaWithFileDrop";
import {
  clampInt,
  isProofreadingSetupJson,
  parseProofreadingSetupJson,
  sanitizeProofreadingSetup,
  type ProofreadingSetupJson,
} from "@/lib/proofreading-setup-json";
import type { RegisteredTaskSummary } from "@/lib/registered-tasks-list";
import { validateTaskIdForStorage } from "@/lib/task-id-policy";

function defaultFilename(school: string): string {
  const s = (school || "設定").trim().slice(0, 18).replace(/[/\\:*?"<>|]/g, "_");
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `添削作業設定_${s}_${y}${mo}${da}.json`;
}

export default function ProofreadingSetupPage() {
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

  const loadRegistryTasks = useCallback(async (opts?: { quiet?: boolean }) => {
    setRegistryLoading(true);
    try {
      const res = await fetch("/api/tasks/registry");
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
  }, []);

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
    a.download = defaultFilename(setup.school_name);
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
      const res = await fetch("/api/ops/teacher-proofreading-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const q = encodeURIComponent(setup.task_id.trim());
      const res = await fetch(`/api/ops/teacher-proofreading-setup?taskId=${q}`, {
        method: "GET",
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
      const q = encodeURIComponent(tid);
      const res = await fetch(`/api/ops/registered-task?taskId=${q}`, { method: "DELETE" });
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
      <p className="muted">
        課題文や配点などを入力し、<strong>JSON をダウンロードして保存</strong>したり、保存したファイルを<strong>読み込んで再編集</strong>できます。
      </p>
      <p>
        <Link href="/ops">運用トップ</Link> · <Link href="/submit">提出（生徒）</Link>
      </p>

      <div className="card">
        <h2>設定・問題</h2>
        <p className="muted" style={{ marginTop: -6, marginBottom: 14, fontSize: "0.88rem", lineHeight: 1.55 }}>
          「サーバーに保存」すると、プロジェクト直下の{" "}
          <code>data/teacher-proofreading-setup/〈課題ID〉.json</code> と{" "}
          <code>data/task-problems/〈課題ID〉.json</code> に書き込まれます（Finder / VS Code で開けます）。保存直後のメッセージにも実際のパスが出ます。
        </p>

        <label className="field">
          <span>先生のお名前（本名）</span>
          <input
            value={setup.teacher_name ?? ""}
            onChange={(e) => patchSetup({ teacher_name: e.target.value })}
            placeholder="例: 山田 花子"
          />
        </label>

        <label className="field">
          <span>メールアドレス（任意）</span>
          <input
            type="email"
            value={setup.teacher_email ?? ""}
            onChange={(e) => patchSetup({ teacher_email: e.target.value })}
            placeholder="例: name@school.jp"
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span>学校名</span>
          <input
            value={setup.school_name ?? ""}
            onChange={(e) => patchSetup({ school_name: e.target.value })}
            placeholder="例: 河合塾 北大３クラス（提出プルダウンに表示されます）"
          />
          <span className="muted" style={{ fontSize: "0.9em", display: "block", marginTop: 4 }}>
            課題IDに含めたい日本語（学校・塾・クラス名など）はここに書いてください。JSON ダウンロード時のファイル名にも使われます。
          </span>
        </label>

        <label className="field">
          <span>課題ID（taskId）</span>
          <input
            value={setup.task_id ?? ""}
            onChange={(e) => patchSetup({ task_id: e.target.value })}
            placeholder="例: 2026_kawai_hokudai3_matsuo（半角英数字と ._- のみ）"
            autoComplete="off"
          />
          <span className="muted" style={{ fontSize: "0.9em", display: "block", marginTop: 4 }}>
            <strong>半角の英数字と ._-（ドット・アンダースコア・ハイフン）のみ</strong>です。納品 ZIP やファイル名と衝突しないよう、日本語は「学校名」「問題メモ」へ分けてください。
            生徒の提出画面では<strong>登録済み課題のプルダウン</strong>にこの ID が出ます。「サーバーに保存」で <code>data/task-problems/</code> のマスタも更新されます。バッチの <code>--task-id</code> もこの ID と揃えてください。
          </span>
        </label>

        <label className="field">
          <span>問題メモ（任意）</span>
          <input
            type="text"
            maxLength={120}
            value={setup.problem_memo ?? ""}
            onChange={(e) => patchSetup({ problem_memo: e.target.value })}
            placeholder="例: 2026 北大３ 松尾先生担当 英作文第2回"
            autoComplete="off"
          />
          <span className="muted" style={{ fontSize: "0.9em", display: "block", marginTop: 4 }}>
            提出プルダウンでは「学校名 · 問題メモ」のように表示されます。課題マスタの設問タイトル（単一設問時）にも使われます。添削プロンプトの問題文そのものではありません。
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
        <p className="muted" style={{ marginTop: 0 }}>
          「サーバーに保存」を押すと、<strong>課題ID</strong>ごとに教員設定が保存されると同時に、
          <code>data/task-problems/</code> 下の当該課題の JSON が<strong>上書き</strong>されます（生徒の提出プルダウン・添削の問題文の単一ソース）。手編集したマスタがある場合はバックアップを推奨します。運用の<strong>提出詳細 → 修正入力</strong>のルーブリック初期値（
          <code>content</code> / <code>grammar</code>）にも、ここで設定した<strong>内容点・文法点</strong>が反映されます（課題マスタの各項目の満点を超えないよう丸めます）。
        </p>

        <TextareaWithFileDrop
          label="問題文（課題）— JSON 保存に必須"
          hint={
            <span>
              画像・PDF の読み取りは <strong>Gemini</strong>（サーバの <code>GEMINI_API_KEY</code>）を使います。キーが無い場合はブラウザ内の
              Tesseract / PDF 取り込みにフォールバックします。教員用の設定 JSON を1ファイルだけドロップすると、
              <strong>フォーム全体</strong>をその内容で置き換えます。
            </span>
          }
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
            {savingServer ? "サーバーに保存中…" : "サーバーに保存（課題ID）"}
          </button>
          <button type="button" onClick={onLoadFromServer} disabled={loadingServer}>
            {loadingServer ? "サーバーから読込中…" : "サーバー保存済みJSONを読み込む（課題ID）"}
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
          不要になった課題を<strong>サーバー上から削除</strong>すると、生徒の提出画面の<strong>プルダウン</strong>からも消えます（
          <code>data/task-problems/</code> と <code>data/teacher-proofreading-setup/</code>）。既存の提出データは削除されません。
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

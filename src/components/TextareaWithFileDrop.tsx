"use client";

import { useCallback, useId, useRef, useState } from "react";

import {
  ingestFilesInOrder,
  isImageFile,
  isJsonFile,
  isPdfFile,
  isPlainTextDataFile,
  mergeExtractedBlock,
  readFileAsText,
} from "@/lib/file-ingest";
import { ProcessingEyesIcon } from "@/components/ProcessingEyesIcon";
import {
  extractQuestionFromTeacherJson,
  isProofreadingSetupJson,
  parseProofreadingSetupJson,
  type ProofreadingSetupJson,
} from "@/lib/proofreading-setup-json";

export type JsonDropBehavior = "none" | "setup-full" | "extract-question-only";

/** カスタム自由英作文と同じ「構造化読み取り」（デフォルト OFF は親の state） */
export type StructuredProblemReadingProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export type TextareaWithFileDropProps = {
  label: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  /** 既に文字があるとき、末尾追記でよいか確認する（提出画面の英文欄と同じ） */
  confirmOnAppend?: boolean;
  jsonDropBehavior?: JsonDropBehavior;
  onSetupJsonImport?: (parsed: ProofreadingSetupJson) => void;
  onNotify?: (message: string, variant: "success" | "error" | "info") => void;
  disabled?: boolean;
  /** 問題文欄のみ: Gemini + 構造化チェック（英文欄では渡さない） */
  structuredProblemReading?: StructuredProblemReadingProps;
  /**
   * 画像のみ Tesseract で読むときの言語。英作文欄は `eng`（既定の提出欄）、
   * 課題文（日英混在）は省略で `jpn+eng`。
   */
  tesseractLang?: string;
  /**
   * 提出の英文欄向け: 画像・PDF を先に Claude で転記（手書き向き）。API キーがないか失敗時は Tesseract にフォールバック。
   */
  geminiHandwritingOcr?: boolean;
};

const FILE_ACCEPT =
  "image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,application/pdf,text/plain,.txt,.md,.json,text/markdown";

function isHeicLike(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.includes("heic") || t.includes("heif")) return true;
  const n = (file.name || "").toLowerCase();
  return /\.(heic|heif)$/i.test(n);
}

async function normalizeGeminiMediaFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    if (!isHeicLike(f)) {
      out.push(f);
      continue;
    }
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: f, toType: "image/jpeg", quality: 0.92 });
      const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
      if (jpegBlob instanceof Blob) {
        const base = (f.name || "upload").replace(/\.(heic|heif)$/i, "");
        out.push(new File([jpegBlob], `${base}.jpg`, { type: "image/jpeg" }));
        continue;
      }
    } catch {
      // 変換失敗時は元ファイルを残し、下流で通常のエラーハンドリングに任せる。
    }
    out.push(f);
  }
  return out;
}

async function fetchGeminiEssayImageIngest(
  mediaFiles: File[],
): Promise<{ text: string; noApiKey: boolean; clientError: string | null }> {
  const fd = new FormData();
  for (const f of mediaFiles) {
    fd.append("files", f);
  }
  const res = await fetch("/api/essay-image-ingest", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { error?: string; text?: string };
  if (res.status === 503) {
    return { text: "", noApiKey: true, clientError: null };
  }
  if (!res.ok) {
    return {
      text: "",
      noApiKey: false,
      clientError: typeof data.error === "string" ? data.error : "読み取りに失敗しました。",
    };
  }
  return { text: String(data.text || ""), noApiKey: false, clientError: null };
}

async function fetchGeminiProblemIngest(
  mediaFiles: File[],
  structured: boolean,
): Promise<{ text: string; usedFirstOnly: boolean }> {
  const fd = new FormData();
  fd.append("mode", structured ? "structured" : "plain");
  for (const f of mediaFiles) {
    fd.append("files", f);
  }
  const res = await fetch("/api/problem-ingest", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { error?: string; text?: string; usedFirstOnly?: boolean };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "読み取りに失敗しました。");
  }
  return {
    text: String(data.text || ""),
    usedFirstOnly: data.usedFirstOnly === true,
  };
}

export function TextareaWithFileDrop({
  label,
  hint,
  value,
  onChange,
  rows = 8,
  placeholder,
  confirmOnAppend = false,
  jsonDropBehavior = "none",
  onSetupJsonImport,
  onNotify,
  disabled = false,
  structuredProblemReading,
  tesseractLang,
  geminiHandwritingOcr,
}: TextareaWithFileDropProps) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const runImport = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || disabled) return;

      if (confirmOnAppend && (value ?? "").trim()) {
        const ok = window.confirm(
          "すでに文字が入っています。取り込んだ内容を末尾に追記しますか？\n「キャンセル」なら何もしません。",
        );
        if (!ok) return;
      }

      setBusy(true);
      setStatus("取り込み中…");

      try {
        if (files.length === 1 && isJsonFile(files[0])) {
          const f = files[0];
          let raw: unknown;
          try {
            raw = JSON.parse(await readFileAsText(f));
          } catch {
            raw = null;
          }

          if (jsonDropBehavior === "setup-full" && raw && isProofreadingSetupJson(raw)) {
            const parsed = parseProofreadingSetupJson(raw);
            if (parsed != null && onSetupJsonImport) {
              onSetupJsonImport(parsed);
              setStatus("");
              onNotify?.("設定 JSON をフォームに読み込みました。", "success");
              return;
            }
          }

          if (jsonDropBehavior === "extract-question-only" && raw) {
            const q = extractQuestionFromTeacherJson(raw);
            if (q) {
              onChange(mergeExtractedBlock(value ?? "", q, "課題設定JSONの問題文"));
              setStatus("");
              onNotify?.("JSON の問題文を取り込みました。", "success");
              return;
            }
          }
        }

        const geminiMedia = files.filter((f) => isImageFile(f) || isPdfFile(f));
        const textOnlyFiles = files.filter((f) => isPlainTextDataFile(f));
        const used = new Set([...geminiMedia, ...textOnlyFiles]);
        const otherFiles = files.filter((f) => !used.has(f));

        const useGeminiPath =
          !!structuredProblemReading && otherFiles.length === 0 && geminiMedia.length > 0;

        let textJoin = "";
        for (const tf of textOnlyFiles) {
          const t = (await readFileAsText(tf)).trim();
          if (t) textJoin = textJoin ? `${textJoin}\n\n${t}` : t;
        }

        const tryEssayGemini =
          Boolean(geminiHandwritingOcr) && otherFiles.length === 0 && geminiMedia.length > 0;

        if (tryEssayGemini) {
          try {
            setStatus("手書き・画像を読み取り中…");
            const normalizedMedia = await normalizeGeminiMediaFiles(geminiMedia);
            const { text: geminiText, noApiKey, clientError } = await fetchGeminiEssayImageIngest(
              normalizedMedia,
            );
            if (noApiKey) {
              setStatus("");
              onNotify?.("Claude API キーが未設定です。手書きOCRは Claude が必須です。", "error");
              return;
            } else if (clientError) {
              setStatus("");
              onNotify?.(`Claude OCR に失敗しました: ${clientError}`, "error");
              return;
            } else if (geminiText.trim()) {
              let block = geminiText.trim();
              if (textJoin) {
                block = `${textJoin}\n\n${block}`;
              }
              onChange(mergeExtractedBlock(value ?? "", block, "画像・PDF（Claude）"));
              setStatus("");
              onNotify?.("取り込みが完了しました。内容を確認してください。", "success");
              return;
            } else {
              setStatus("");
              onNotify?.("Claude OCR が空の結果を返しました。画像の鮮明さを確認して再実行してください。", "error");
              return;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setStatus("");
            onNotify?.(`Claude OCR に失敗しました: ${msg}`, "error");
            return;
          }
        }

        if (useGeminiPath) {
          try {
            setStatus("問題文を読み取り中…");
            const structured = structuredProblemReading.checked;
            const { text: geminiText, usedFirstOnly } = await fetchGeminiProblemIngest(geminiMedia, structured);
            if (!geminiText.trim()) {
              setStatus("");
              onNotify?.(
                "取り込めるテキストがありませんでした。画像の解像度や内容を確認してください。",
                "info",
              );
              return;
            }
            let block = geminiText.trim();
            if (textJoin) {
              block = `${textJoin}\n\n${block}`;
            }
            const labelTag = structured ? "問題（構造化読み取り）" : "問題（通常読み取り・Gemini）";
            onChange(mergeExtractedBlock(value ?? "", block, labelTag));
            setStatus("");
            onNotify?.(
              usedFirstOnly
                ? "複数ファイルのうち先頭の1件だけを読み取りました（カスタム自由英作文と同じ）。内容を確認してください。"
                : "取り込みが完了しました。内容を確認してください。",
              "success",
            );
            return;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("GEMINI_API_KEY")) {
              setStatus("ブラウザ内の取り込みに切り替えます…");
              onNotify?.("Gemini API が使えないため、ローカル（Tesseract / PDF）で読み取ります。", "info");
            } else {
              setStatus("ブラウザ内の取り込みに切り替えます…");
              onNotify?.(`${msg} ローカル取り込みを試みます。`, "info");
            }
          }
        }

        const extracted = await ingestFilesInOrder(files, (msg) => setStatus(msg), {
          tesseractLang: tesseractLang ?? "jpn+eng",
        });
        if (!extracted.trim()) {
          setStatus("");
          onNotify?.(
            "取り込めるテキストがありませんでした。PDF がスキャン画像のみの場合は、画像として保存してからドロップするか、GEMINI_API_KEY を設定して Gemini 取り込みを試してください。",
            "info",
          );
          return;
        }
        onChange(mergeExtractedBlock(value ?? "", extracted, "画像・PDF・ファイルから読み取り"));
        setStatus("");
        onNotify?.("取り込みが完了しました。内容を確認してください。", "success");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus("");
        onNotify?.(msg, "error");
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [
      confirmOnAppend,
      disabled,
      jsonDropBehavior,
      onChange,
      onNotify,
      onSetupJsonImport,
      structuredProblemReading,
      tesseractLang,
      geminiHandwritingOcr,
      value,
    ],
  );

  const onPick = () => fileRef.current?.click();

  const onInputChange = (list: FileList | null) => {
    if (!list?.length) return;
    void runImport(Array.from(list));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (disabled || busy) return;
    const dt = e.dataTransfer.files;
    if (!dt?.length) return;
    void runImport(Array.from(dt));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !busy) setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  return (
    <div className="field">
      <span>{label}</span>
      {hint ? <div className="muted">{hint}</div> : null}

      {structuredProblemReading ? (
        <div className="muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
          <label
            style={{
              cursor: "pointer",
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 8,
              width: "100%",
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(structuredProblemReading.checked)}
              onChange={(e) => structuredProblemReading.onChange(e.target.checked)}
              disabled={disabled || busy}
              style={{ marginTop: 3, flexShrink: 0 }}
            />
            <span
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                writingMode: "horizontal-tb",
                whiteSpace: "normal",
                wordBreak: "normal",
              }}
            >
              グラフ・表を含むお題を、<strong>指示文＋表形式</strong>で読み取る（複数枚可・Gemini）
            </span>
          </label>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={FILE_ACCEPT}
        multiple
        hidden
        disabled={disabled || busy}
        onChange={(e) => onInputChange(e.target.files)}
      />

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: `2px dashed ${dragOver ? "#f97316" : "#cbd5e1"}`,
          borderRadius: 10,
          padding: "12px 14px",
          marginTop: 8,
          background: dragOver ? "#fff7ed" : "#f8fafc",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <p className="muted" style={{ margin: "0 0 10px", lineHeight: 1.55 }}>
          写真・スクリーンショット（画像）、<strong>PDF</strong>、テキスト（.txt / .md など）を
          <strong>ドラッグ＆ドロップ</strong>するか、下のボタンで選べます。
          {structuredProblemReading ? (
            <>
              {" "}
              <strong>デフォルトはオフ</strong>です。オフのときは画像1件（複数なら先頭のみ）を{" "}
              <strong>Gemini</strong> が通常プロンプトで読み取ります。オンにするとカスタム自由英作文の{" "}
              <code>problem_structured</code> と同じ形式です。
            </>
          ) : null}
          {jsonDropBehavior === "setup-full" ? (
            <>
              {" "}
              教員用の<strong>設定 JSON</strong>を1つだけドロップした場合は、フォーム全体を読み込みます。
            </>
          ) : null}
          {jsonDropBehavior === "extract-question-only" ? (
            <>
              {" "}
              教員用設定 <strong>JSON</strong> を1つドロップすると、中の<strong>問題文だけ</strong>を取り込みます。
            </>
          ) : null}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            onClick={onPick}
            disabled={disabled || busy}
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {busy ? (
              <>
                <ProcessingEyesIcon />
                処理中…
              </>
            ) : (
              "ファイルを選ぶ"
            )}
          </button>
        </div>
        {status ? (
          <p
            className="muted"
            style={{
              margin: "0 0 8px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              lineHeight: 1.5,
            }}
          >
            <ProcessingEyesIcon />
            <span>{status}</span>
          </p>
        ) : null}
        <p className="muted" style={{ margin: "0 0 0", fontSize: "0.85rem" }}>
          この枠内（テキスト欄を含む）にドラッグ＆ドロップできます。
        </p>
        <textarea
          id={inputId}
          rows={rows}
          value={value ?? ""}
          disabled={disabled || busy}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          style={{ marginTop: 10 }}
        />
      </div>
    </div>
  );
}

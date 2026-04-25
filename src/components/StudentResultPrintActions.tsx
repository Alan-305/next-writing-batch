"use client";

export function StudentResultPrintActions() {
  return (
    <div className="student-result-print-actions no-print">
      <button type="button" onClick={() => window.print()}>
        印刷 / PDFに保存
      </button>
      <p className="muted student-result-print-hint">
        印刷ダイアログで保存先に「PDFに保存」などを選ぶと、画面と同じ内容のPDFを作れます。
      </p>
    </div>
  );
}

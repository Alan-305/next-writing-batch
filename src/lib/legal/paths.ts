/** 法的書面ページのパス（チケット購入・フッター等で共通利用） */
export const LEGAL_PATHS = {
  index: "/legal",
  terms: "/legal/terms",
  tokushoho: "/legal/tokushoho",
  refund: "/legal/refund",
} as const;

export type LegalDocumentId = keyof Omit<typeof LEGAL_PATHS, "index">;

export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentId, string> = {
  terms: "利用規約（チケット購入）",
  tokushoho: "特定商取引法に基づく表記",
  refund: "返金ポリシー",
};

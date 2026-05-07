/** プロダクト ID（表記・値はルールで固定） */
export const PRODUCT_ID_NEXT_WRITING_BATCH = "next-writing-batch" as const;
export const PRODUCT_ID_NEXUSPROJECT = "nexusproject" as const;

export type NexusProductId =
  | typeof PRODUCT_ID_NEXT_WRITING_BATCH
  | typeof PRODUCT_ID_NEXUSPROJECT;

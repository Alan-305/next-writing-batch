import { getDay4AudioResponse } from "@/lib/day4-audio-serve";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ taskId: string; filename: string }> };

/** 公開 GET: Day4 音声（QR 用の期限なし URL）。 */
export async function GET(_request: Request, context: RouteContext) {
  const { taskId, filename } = await context.params;
  return getDay4AudioResponse(decodeURIComponent(taskId ?? ""), decodeURIComponent(filename ?? ""));
}

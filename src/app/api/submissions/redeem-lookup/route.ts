import { NextResponse } from "next/server";

import { normalizeRedeemLookupToken } from "@/lib/anonymous-redeem";
import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import { buildSubmissionLookupJson } from "@/lib/submission-lookup-response";
import { findSubmissionByRedeemLookup } from "@/lib/submissions-store";

export const runtime = "nodejs";

type RedeemLookupBody = {
  organizationId?: unknown;
  displayNick?: unknown;
  nickname?: unknown;
  redeemId?: unknown;
};

/** ニックネーム + 引換ID で添削結果を照会（ログイン不要） */
export async function POST(request: Request) {
  let body: RedeemLookupBody;
  try {
    body = (await request.json()) as RedeemLookupBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const orgRaw = String(body.organizationId ?? "").trim();
  const organizationId = sanitizeOrganizationIdForPath(orgRaw);
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "organizationId（招待リンクの org）が必要です。" }, { status: 400 });
  }

  const displayNick = normalizeRedeemLookupToken(
    String(body.displayNick ?? body.nickname ?? ""),
  );
  const redeemId = normalizeRedeemLookupToken(String(body.redeemId ?? ""));

  if (!displayNick || !redeemId) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "ニックネームと引換IDの両方を入力してください。",
      },
      { status: 422 },
    );
  }

  await migrateLegacyOrgLayoutOnce();
  const submission = await findSubmissionByRedeemLookup(organizationId, { displayNick, redeemId });
  if (!submission) {
    return NextResponse.json({
      ok: true,
      found: false,
      message: "該当する提出が見つかりませんでした。ニックネームと引換IDをご確認ください。",
    });
  }

  return NextResponse.json(buildSubmissionLookupJson(submission));
}

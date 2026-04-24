import { readFile } from "fs/promises";
import { NextResponse } from "next/server";

import {
  deleteDeliverableZip,
  deliverableZipAbsolutePath,
  isSafeDeliverableZipName,
} from "@/lib/deliverables-store";

type RouteContext = { params: Promise<{ file: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { file: raw } = await context.params;
  const file = decodeURIComponent(raw || "");
  if (!isSafeDeliverableZipName(file)) {
    return NextResponse.json({ message: "Invalid file name" }, { status: 400 });
  }
  const abs = deliverableZipAbsolutePath(file);
  if (!abs) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  try {
    const buf = await readFile(abs);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { file: raw } = await context.params;
  const file = decodeURIComponent(raw || "");
  const result = await deleteDeliverableZip(file);
  if (result === "invalid") {
    return NextResponse.json({ message: "Invalid file name" }, { status: 400 });
  }
  if (result === "not_found") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

import { NextResponse } from "next/server";
import { normalizeCspReport } from "../../../lib/csp-report";

export async function POST(request: Request) {
  const report = normalizeCspReport(await request.json().catch(() => ({})));
  console.warn("csp violation", report);
  return new NextResponse(null, { status: 204 });
}

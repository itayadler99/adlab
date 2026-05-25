import { NextResponse } from "next/server";
import { STORES } from "@/lib/stores";

export const runtime = "nodejs";

export async function GET() {
  // Strip empty configs so UI can show "configure me" hints.
  const stores = STORES.map((s) => ({
    id: s.id,
    name: s.name,
    adAccountId: s.adAccountId,
    pageId: s.pageId,
    defaultLink: s.defaultLink,
    configured: !!(s.adAccountId && s.pageId),
  }));
  return NextResponse.json({ stores });
}

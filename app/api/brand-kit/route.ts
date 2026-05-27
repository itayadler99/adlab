import { NextRequest, NextResponse } from "next/server";
import { getBrandKit, upsertBrandKit, type BrandKit } from "@/lib/brand-kit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get("store_id");
  if (!storeId) return NextResponse.json({ error: "store_id required" }, { status: 400 });
  const kit = await getBrandKit(storeId);
  return NextResponse.json({ kit });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<BrandKit> & { storeId?: string; store_id?: string };
  const storeId = body.storeId || body.store_id;
  if (!storeId) return NextResponse.json({ error: "storeId required" }, { status: 400 });
  try {
    const kit = await upsertBrandKit({ ...body, storeId });
    return NextResponse.json({ kit });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

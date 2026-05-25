import { NextResponse } from "next/server";
import { getProducts } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getProducts(50);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, products: [] }, { status: 500 });
  }
}

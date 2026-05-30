import { NextResponse } from "next/server";
import { listSouls } from "@/lib/souls";

export const runtime = "nodejs";

export async function GET() {
  try {
    const souls = await listSouls();
    return NextResponse.json({
      souls,
      apiReady: Boolean(process.env.HIGGSFIELD_API_URL && process.env.HIGGSFIELD_API_KEY),
    });
  } catch (e) {
    return NextResponse.json(
      { souls: [], apiReady: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 }
    );
  }
}

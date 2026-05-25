import { NextRequest, NextResponse } from "next/server";
import { saveDraft, listDrafts } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const drafts = await listDrafts(status);
    return NextResponse.json({ drafts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, product_id, product_title, script, video_url, video_job_id, ad_account_id, campaign_name, budget } = body;
    if (!title || !script) {
      return NextResponse.json({ error: "title and script are required" }, { status: 400 });
    }
    const draft = await saveDraft({
      title,
      product_id,
      product_title,
      script,
      video_url,
      video_job_id,
      video_status: video_url ? "ready" : "pending",
      ad_account_id,
      campaign_name,
      budget,
      status: "draft",
    });
    return NextResponse.json({ draft });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getDraft, updateDraft } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const rejection_reason: string = body.reason ?? "";
    const draft = await getDraft(id);
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (draft.status !== "draft") {
      return NextResponse.json({ error: `Cannot reject a draft with status '${draft.status}'` }, { status: 400 });
    }
    const updated = await updateDraft(id, { status: "rejected", rejection_reason });
    return NextResponse.json({ draft: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

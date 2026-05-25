import { NextRequest, NextResponse } from "next/server";
import { getDraft, updateDraft } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const draft = await getDraft(id);
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (draft.status !== "draft") {
      return NextResponse.json({ error: `Cannot approve a draft with status '${draft.status}'` }, { status: 400 });
    }
    const updated = await updateDraft(id, { status: "approved" });
    return NextResponse.json({ draft: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

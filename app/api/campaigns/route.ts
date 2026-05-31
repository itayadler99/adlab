import { NextResponse } from "next/server";
import { getCampaigns, getAccountCampaignInsights } from "@/lib/meta";

export async function GET() {
  try {
    const campaigns = await getCampaigns();
    let insightMap: Record<string, unknown> = {};
    try {
      // One account-level call broken down by campaign (last 7d for the dashboard).
      insightMap = await getAccountCampaignInsights("last_7d");
    } catch {
      // insights are optional — campaigns list still renders without them
    }
    const enriched = campaigns.map((c) => ({
      ...c,
      insights: insightMap[c.id] ?? null,
    }));
    return NextResponse.json({ campaigns: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getCampaigns, getCampaignInsights } from "@/lib/meta";

export async function GET() {
  try {
    const campaigns = await getCampaigns();
    let enriched = campaigns;
    try {
      const ids = campaigns.map((c: { id: string }) => c.id);
      if (ids.length > 0) {
        const insights = await getCampaignInsights(ids);
        const insightMap: Record<string, unknown> = {};
        if (Array.isArray(insights)) {
          for (const ins of insights) {
            if (ins.campaign_id) insightMap[ins.campaign_id] = ins;
          }
        }
        enriched = campaigns.map((c: { id: string }) => ({
          ...c,
          insights: insightMap[c.id] ?? null,
        }));
      }
    } catch {
      // insights are optional
    }
    return NextResponse.json({ campaigns: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

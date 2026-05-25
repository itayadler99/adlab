import { NextRequest, NextResponse } from "next/server";
import { getCampaigns, getCampaignInsights } from "@/lib/meta";

const ROAS_THRESHOLD = 3;

async function sendWebhookAlert(winners: { campaignId: string; campaignName: string; roas: number; spend: number; revenue: number }[]) {
  const webhookUrl = process.env.WINNER_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("WINNER_WEBHOOK_URL not set, skipping webhook alert");
    return;
  }

  const payload = {
    event: "roas_winner_detected",
    timestamp: new Date().toISOString(),
    threshold: ROAS_THRESHOLD,
    winners,
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`Webhook delivery failed: ${res.status} ${res.statusText}`);
  } else {
    console.log(`Webhook delivered successfully for ${winners.length} winner(s)`);
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaigns = await getCampaigns();
    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ message: "No campaigns found", winners: [] });
    }

    const winners: { campaignId: string; campaignName: string; roas: number; spend: number; revenue: number }[] = [];
    const results: { campaignId: string; campaignName: string; roas: number | null; spend: number; revenue: number; isWinner: boolean }[] = [];

    for (const campaign of campaigns) {
      try {
        const insights = await getCampaignInsights(campaign.id);

        let totalSpend = 0;
        let totalRevenue = 0;

        if (insights && Array.isArray(insights)) {
          for (const insight of insights) {
            const spend = parseFloat(insight.spend ?? "0");
            const revenue = parseFloat(
              insight.action_values?.find((a: { action_type: string; value: string }) => a.action_type === "offsite_conversion.fb_pixel_purchase")?.value ??
              insight.action_values?.find((a: { action_type: string; value: string }) => a.action_type === "purchase")?.value ??
              "0"
            );
            totalSpend += spend;
            totalRevenue += revenue;
          }
        }

        const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;
        const isWinner = roas !== null && roas > ROAS_THRESHOLD;

        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name ?? campaign.id,
          roas,
          spend: totalSpend,
          revenue: totalRevenue,
          isWinner,
        });

        if (isWinner) {
          winners.push({
            campaignId: campaign.id,
            campaignName: campaign.name ?? campaign.id,
            roas,
            spend: totalSpend,
            revenue: totalRevenue,
          });
        }
      } catch (err) {
        console.error(`Failed to get insights for campaign ${campaign.id}:`, err);
      }
    }

    if (winners.length > 0) {
      await sendWebhookAlert(winners);
    }

    return NextResponse.json({
      message: `Scanned ${campaigns.length} campaign(s), found ${winners.length} winner(s)`,
      threshold: ROAS_THRESHOLD,
      winners,
      results,
    });
  } catch (err) {
    console.error("check-winners cron error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

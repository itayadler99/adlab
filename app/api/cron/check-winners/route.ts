// Daily ROAS scan.
//   - Winner  : ROAS > 3 (decided on lifetime, with 30d/7d fallback). Alerts via webhook.
//   - Kill     : 0 purchases lifetime AND spend > ₪200 lifetime (Itay's ironclad kill rule).
//                Alert-only by default; set META_AUTO_KILL=1 to also pause the campaign.
//
// Per Itay's rules we ALWAYS read lifetime + 7d + 30d (date_preset=maximum/last_7d/last_30d).
// Schedule via vercel.json. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`;
// `?secret=` is also accepted for manual runs.

import { NextRequest, NextResponse } from "next/server";
import {
  getCampaigns,
  getCampaignInsightsMulti,
  setCampaignStatus,
  roasOf,
  spendOf,
  purchaseCount,
} from "@/lib/meta";

export const runtime = "nodejs";
export const maxDuration = 300;

const ROAS_THRESHOLD = Number(process.env.WINNER_ROAS_THRESHOLD || 3);
// Kill rule is denominated in the ad account currency (Montier = ILS).
const KILL_SPEND_THRESHOLD = Number(process.env.KILL_SPEND_THRESHOLD || 200);
const AUTO_KILL = process.env.META_AUTO_KILL === "1";

interface Winner {
  campaignId: string;
  campaignName: string;
  roas: number;
  roas7d: number | null;
  roas30d: number | null;
  spend: number;
}
interface KillCandidate {
  campaignId: string;
  campaignName: string;
  spend: number;
  purchases: number;
  daysRunning: number | null;
  paused: boolean;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured → open (dev)
  const header = req.headers.get("authorization");
  const query = req.nextUrl.searchParams.get("secret");
  return header === `Bearer ${secret}` || query === secret;
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

async function sendWebhookAlert(payload: Record<string, unknown>) {
  const webhookUrl = process.env.WINNER_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("WINNER_WEBHOOK_URL not set, skipping webhook alert");
    return;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`Webhook delivery failed: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.error("Webhook delivery error:", err);
  }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const campaigns = await getCampaigns();
    if (campaigns.length === 0) {
      return NextResponse.json({ message: "No campaigns found", winners: [], killCandidates: [] });
    }

    const winners: Winner[] = [];
    const killCandidates: KillCandidate[] = [];

    for (const campaign of campaigns) {
      try {
        const { lifetime, d7, d30 } = await getCampaignInsightsMulti(campaign.id);

        // ROAS decision: prefer lifetime, fall back to 30d then 7d.
        const roasLife = roasOf(lifetime);
        const roas30 = roasOf(d30);
        const roas7 = roasOf(d7);
        const decisionRoas = roasLife ?? roas30 ?? roas7;

        const lifeSpend = spendOf(lifetime);
        const lifePurchases = purchaseCount(lifetime);

        if (decisionRoas !== null && decisionRoas > ROAS_THRESHOLD) {
          winners.push({
            campaignId: campaign.id,
            campaignName: campaign.name ?? campaign.id,
            roas: decisionRoas,
            roas7d: roas7,
            roas30d: roas30,
            spend: lifeSpend,
          });
        }

        // Kill rule: 0 purchases lifetime + spend over threshold. Only act on
        // campaigns that are actually running.
        const isActive = (campaign.effective_status ?? campaign.status) === "ACTIVE";
        if (isActive && lifePurchases === 0 && lifeSpend > KILL_SPEND_THRESHOLD) {
          let paused = false;
          if (AUTO_KILL) {
            try {
              await setCampaignStatus(campaign.id, "PAUSED");
              paused = true;
            } catch (err) {
              console.error(`Auto-kill failed for ${campaign.id}:`, err);
            }
          }
          killCandidates.push({
            campaignId: campaign.id,
            campaignName: campaign.name ?? campaign.id,
            spend: lifeSpend,
            purchases: lifePurchases,
            daysRunning: daysSince(campaign.created_time),
            paused,
          });
        }
      } catch (err) {
        console.error(`Failed to evaluate campaign ${campaign.id}:`, err);
      }
    }

    if (winners.length > 0 || killCandidates.length > 0) {
      await sendWebhookAlert({
        event: "roas_scan",
        timestamp: new Date().toISOString(),
        roasThreshold: ROAS_THRESHOLD,
        killSpendThreshold: KILL_SPEND_THRESHOLD,
        autoKill: AUTO_KILL,
        winners,
        killCandidates,
      });
    }

    return NextResponse.json({
      message: `Scanned ${campaigns.length} campaign(s): ${winners.length} winner(s), ${killCandidates.length} kill candidate(s)`,
      roasThreshold: ROAS_THRESHOLD,
      killSpendThreshold: KILL_SPEND_THRESHOLD,
      autoKill: AUTO_KILL,
      winners,
      killCandidates,
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

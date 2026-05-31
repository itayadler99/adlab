// Daily ROAS scan (thin route over lib/learn.ts).
//   - Winner   : ROAS > 3 AND out of the learning phase. Webhook alert.
//   - Promising : ROAS > 3 but still learning (< minDays or < minConversions).
//   - Kill      : 0 purchases lifetime + spend > ₪200 lifetime (ironclad kill rule).
//                 Alert-only by default; META_AUTO_KILL=1 also pauses the campaign.
//
// Per Itay's rules the scan reads lifetime + 7d + 30d. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>`; `?secret=` is also accepted for manual runs.

import { NextRequest, NextResponse } from "next/server";
import { scanCampaigns, persistScan } from "@/lib/learn";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: misconfig should not expose cron
  const header = req.headers.get("authorization");
  const query = req.nextUrl.searchParams.get("secret");
  return header === `Bearer ${secret}` || query === secret;
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
    const accountId = req.nextUrl.searchParams.get("account_id") || undefined;
    const result = await scanCampaigns({ accountId });
    await persistScan(result);

    // Alert on confirmed winners and kill candidates. Promising-but-learning
    // campaigns are reported in the response but don't trigger an alert (no
    // judgment during the learning phase).
    if (result.winners.length > 0 || result.killCandidates.length > 0) {
      await sendWebhookAlert({
        event: "roas_scan",
        timestamp: new Date().toISOString(),
        config: result.config,
        winners: result.winners,
        killCandidates: result.killCandidates,
      });
    }

    return NextResponse.json({
      message: `Scanned ${result.scanned} campaign(s): ${result.winners.length} winner(s), ${result.promising.length} promising, ${result.killCandidates.length} kill candidate(s)`,
      config: result.config,
      winners: result.winners,
      promising: result.promising,
      killCandidates: result.killCandidates,
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

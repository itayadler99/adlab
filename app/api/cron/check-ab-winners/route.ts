import { NextRequest, NextResponse } from "next/server";
import { listPendingComparisons, updateAbTest } from "@/lib/abtests";
import { metaGet, roasOf, spendOf, purchaseCount, type InsightRow } from "@/lib/meta";

export const runtime = "nodejs";

// Min data before an A/B test is allowed to decide. A single fluke purchase
// shouldn't crown a winner. Overridable via env.
const AB_MIN_SPEND = Number(process.env.AB_MIN_SPEND || 50);
const AB_MIN_CONVERSIONS = Number(process.env.AB_MIN_CONVERSIONS || 5);

async function getAdsetInsightRow(adsetId: string, since: string, until: string): Promise<InsightRow | null> {
  const json = await metaGet<{ data?: InsightRow[] }>(`/${adsetId}/insights`, {
    fields: "spend,actions,action_values,purchase_roas",
    time_range: JSON.stringify({ since, until }),
  });
  return json.data?.[0] ?? null;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: misconfig should not expose cron
  const header = req.headers.get("authorization");
  const query = req.nextUrl.searchParams.get("secret");
  return header === `Bearer ${secret}` || query === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await listPendingComparisons();
  const results: Array<{ id: string; winner?: string; error?: string }> = [];

  for (const test of pending) {
    try {
      if (!test.adset_id_a || !test.adset_id_b) {
        continue;
      }

      const since = test.started_at
        ? new Date(test.started_at).toISOString().slice(0, 10)
        : new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const until = new Date().toISOString().slice(0, 10);

      const [rowA, rowB] = await Promise.all([
        getAdsetInsightRow(test.adset_id_a, since, until),
        getAdsetInsightRow(test.adset_id_b, since, until),
      ]);

      // Campaigns launch PAUSED (ironclad rule); the owner activates them in
      // Ads Manager. Don't decide until there's enough real data on both arms:
      // combined spend over the floor AND at least one arm with enough
      // conversions. Otherwise leave pending and re-check next run.
      const spendA = spendOf(rowA);
      const spendB = spendOf(rowB);
      const convA = purchaseCount(rowA);
      const convB = purchaseCount(rowB);
      const enoughSpend = spendA + spendB >= AB_MIN_SPEND;
      const enoughConversions = Math.max(convA, convB) >= AB_MIN_CONVERSIONS;
      if (!enoughSpend || !enoughConversions) {
        results.push({
          id: test.id,
          error: `insufficient data — spend ₪${(spendA + spendB).toFixed(0)}/${AB_MIN_SPEND}, conv ${Math.max(convA, convB)}/${AB_MIN_CONVERSIONS}; still pending`,
        });
        continue;
      }

      const roasA = roasOf(rowA) ?? 0;
      const roasB = roasOf(rowB) ?? 0;

      let winner: string;
      if (roasA > roasB) winner = "A";
      else if (roasB > roasA) winner = "B";
      else winner = "tie";

      await updateAbTest(test.id, {
        roas_a: roasA,
        roas_b: roasB,
        winner,
        status: "completed",
        compared_at: new Date().toISOString(),
      });

      results.push({ id: test.id, winner });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ id: test.id, error: message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

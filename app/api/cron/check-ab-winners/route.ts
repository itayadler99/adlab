import { NextRequest, NextResponse } from "next/server";
import { listPendingComparisons, updateAbTest } from "@/lib/abtests";
import { metaGet } from "@/lib/meta";

async function getAdsetInsights(adsetId: string, since: string, until: string) {
  return metaGet(`/${adsetId}/insights`, {
    fields: "spend,action_values",
    time_range: JSON.stringify({ since, until }),
  });
}

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
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

      const [insightsA, insightsB] = await Promise.all([
        getAdsetInsights(test.adset_id_a, since, until),
        getAdsetInsights(test.adset_id_b, since, until),
      ]);

      // Campaigns launch PAUSED (ironclad rule); the owner activates them in
      // Ads Manager. Until real spend lands on both adsets there's nothing to
      // compare — leave the test pending and re-check on the next run rather
      // than declaring a premature tie.
      if (extractSpend(insightsA) <= 0 && extractSpend(insightsB) <= 0) {
        results.push({ id: test.id, error: "no spend yet — still pending" });
        continue;
      }

      const roasA = extractRoas(insightsA);
      const roasB = extractRoas(insightsB);

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

function extractSpend(insights: unknown): number {
  const data = (insights as { data?: unknown[] })?.data;
  if (!data || !Array.isArray(data) || data.length === 0) return 0;
  const row = data[0] as Record<string, unknown>;
  return parseFloat(String(row.spend ?? "0")) || 0;
}

function extractRoas(insights: unknown): number {
  const data = (insights as { data?: unknown[] })?.data;
  if (!data || !Array.isArray(data) || data.length === 0) return 0;
  const row = data[0] as Record<string, unknown>;
  const actions = row.action_values as Array<{ action_type: string; value: string }> | undefined;
  if (!actions) return 0;
  const purchase = actions.find((a) => a.action_type === "purchase");
  if (!purchase) return 0;
  const spend = parseFloat(String(row.spend ?? "0"));
  if (spend === 0) return 0;
  return parseFloat(purchase.value) / spend;
}

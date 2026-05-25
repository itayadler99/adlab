import { NextResponse } from "next/server";
import { listAll } from "@/lib/db";

const VIDEO_COST_USD = 0.05;
const SCRIPT_COST_USD = 0.003;
const MONTHLY_BUDGET_USD = 50;

export async function GET() {
  try {
    const records = await listAll();
    const videos: any[] = records?.videos || [];
    const totalGenerations = videos.length;
    const totalVideoCost = totalGenerations * VIDEO_COST_USD;
    const totalScriptCost = totalGenerations * SCRIPT_COST_USD;
    const totalBurn = totalVideoCost + totalScriptCost;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = videos.filter((r: any) => {
      const created = r.created_at ? new Date(r.created_at) : null;
      return created && created >= startOfMonth;
    });
    const monthlyBurn = thisMonth.length * (VIDEO_COST_USD + SCRIPT_COST_USD);

    const byDay: Record<string, number> = {};
    for (const r of videos) {
      const created = r.created_at ? new Date(r.created_at) : null;
      if (!created) continue;
      const day = created.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + VIDEO_COST_USD + SCRIPT_COST_USD;
    }

    const dailyCosts = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost: parseFloat(cost.toFixed(4)) }));

    return NextResponse.json({
      totalGenerations,
      totalBurn: parseFloat(totalBurn.toFixed(4)),
      monthlyBurn: parseFloat(monthlyBurn.toFixed(4)),
      monthlyBudget: MONTHLY_BUDGET_USD,
      budgetUsedPct: parseFloat(((monthlyBurn / MONTHLY_BUDGET_USD) * 100).toFixed(1)),
      perGenerationEstimate: parseFloat((VIDEO_COST_USD + SCRIPT_COST_USD).toFixed(4)),
      dailyCosts,
      costs: {
        videoPerGen: VIDEO_COST_USD,
        scriptPerGen: SCRIPT_COST_USD,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

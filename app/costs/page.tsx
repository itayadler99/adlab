"use client";
import { useEffect, useState } from "react";

interface CostData {
  totalGenerations: number;
  totalBurn: number;
  monthlyBurn: number;
  monthlyBudget: number;
  budgetUsedPct: number;
  perGenerationEstimate: number;
  dailyCosts: { date: string; cost: number }[];
  costs: { videoPerGen: number; scriptPerGen: number };
}

export default function CostsDashboard() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [budget, setBudget] = useState("");
  const [customBudget, setCustomBudget] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/costs")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const effectiveBudget = customBudget ?? data?.monthlyBudget ?? 50;
  const effectivePct = data
    ? Math.min(100, parseFloat(((data.monthlyBurn / effectiveBudget) * 100).toFixed(1)))
    : 0;

  const barColor =
    effectivePct >= 90
      ? "bg-red-500"
      : effectivePct >= 70
      ? "bg-yellow-400"
      : "bg-emerald-500";

  const maxDailyCost =
    data && data.dailyCosts.length > 0
      ? Math.max(...data.dailyCosts.map((d) => d.cost))
      : 1;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Cost Dashboard</h1>
        <p className="text-gray-400 mb-8">Estimated spend based on generation activity</p>

        {loading && (
          <div className="text-gray-400 animate-pulse">Loading cost data…</div>
        )}
        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 text-red-300">
            Error: {error}
          </div>
        )}

        {data && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Total Generations"
                value={String(data.totalGenerations)}
                sub="all time"
              />
              <StatCard
                label="Est. Total Burn"
                value={`$${data.totalBurn.toFixed(2)}`}
                sub="all time"
              />
              <StatCard
                label="This Month"
                value={`$${data.monthlyBurn.toFixed(2)}`}
                sub={`of $${effectiveBudget} budget`}
              />
              <StatCard
                label="Cost per Gen"
                value={`$${data.perGenerationEstimate.toFixed(4)}`}
                sub="video + script"
              />
            </div>

            {/* Monthly Budget Bar */}
            <section className="bg-gray-900 rounded-2xl p-6 mb-8 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Monthly Budget</h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Budget ($):</span>
                  <input
                    type="number"
                    min="1"
                    className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder={String(data.monthlyBudget)}
                    value={budget}
                    onChange={(e) => {
                      setBudget(e.target.value);
                      const n = parseFloat(e.target.value);
                      setCustomBudget(isNaN(n) || n <= 0 ? null : n);
                    }}
                  />
                </div>
              </div>
              <div className="relative h-8 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${effectivePct}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <span className="text-gray-400">
                  ${data.monthlyBurn.toFixed(2)} used
                </span>
                <span
                  className={`font-semibold ${
                    effectivePct >= 90
                      ? "text-red-400"
                      : effectivePct >= 70
                      ? "text-yellow-400"
                      : "text-emerald-400"
                  }`}
                >
                  {effectivePct}%
                </span>
                <span className="text-gray-400">${effectiveBudget} budget</span>
              </div>
            </section>

            {/* Cost Breakdown */}
            <section className="bg-gray-900 rounded-2xl p-6 mb-8 border border-gray-800">
              <h2 className="text-lg font-semibold mb-4">Cost Breakdown (per generation)</h2>
              <div className="space-y-3">
                <CostRow
                  label="Video generation (Replicate)"
                  cost={data.costs.videoPerGen}
                  pct={(data.costs.videoPerGen / data.perGenerationEstimate) * 100}
                  color="bg-indigo-500"
                />
                <CostRow
                  label="Script generation (Claude)"
                  cost={data.costs.scriptPerGen}
                  pct={(data.costs.scriptPerGen / data.perGenerationEstimate) * 100}
                  color="bg-violet-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-4">
                * Estimates based on typical model pricing. Actual costs may vary.
              </p>
            </section>

            {/* Daily Costs Chart */}
            {data.dailyCosts.length > 0 && (
              <section className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                <h2 className="text-lg font-semibold mb-4">Daily Spend (last {data.dailyCosts.length} days)</h2>
                <div className="flex items-end gap-1 h-40">
                  {data.dailyCosts.slice(-30).map((d) => {
                    const heightPct = (d.cost / maxDailyCost) * 100;
                    return (
                      <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center gap-1 group relative"
                      >
                        <div
                          className="w-full bg-indigo-500 rounded-t hover:bg-indigo-400 transition-colors cursor-default"
                          style={{ height: `${Math.max(heightPct, 2)}%` }}
                        />
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-700 text-xs text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                          {d.date}: ${d.cost.toFixed(4)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{data.dailyCosts.slice(-30)[0]?.date ?? ""}</span>
                  <span>{data.dailyCosts.slice(-30).at(-1)?.date ?? ""}</span>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

function CostRow({
  label,
  cost,
  pct,
  color,
}: {
  label: string;
  cost: number;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-white font-mono">${cost.toFixed(4)}</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

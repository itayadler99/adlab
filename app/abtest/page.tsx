"use client";
import { useState, useEffect } from "react";
import type { AbTest } from "@/lib/abtests";

const VIDEO_MODELS = [
  { value: "minimax", label: "Minimax" },
  { value: "kling", label: "Kling" },
  { value: "luma", label: "Luma" },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-700 text-gray-200",
    generating: "bg-yellow-700 text-yellow-100",
    launching: "bg-blue-700 text-blue-100",
    running: "bg-green-700 text-green-100",
    completed: "bg-purple-700 text-purple-100",
    failed: "bg-red-700 text-red-100",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? "bg-gray-700 text-gray-200"}`}>
      {status}
    </span>
  );
}

export default function AbTestPage() {
  const [tests, setTests] = useState<AbTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [script, setScript] = useState("");
  const [productId, setProductId] = useState("");
  const [modelA, setModelA] = useState("minimax");
  const [modelB, setModelB] = useState("kling");
  const [adAccountId, setAdAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [dailyBudget, setDailyBudget] = useState("1000");

  async function fetchTests() {
    setLoading(true);
    try {
      const res = await fetch("/api/abtest");
      const data = await res.json();
      setTests(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTests();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/abtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          product_id: productId,
          model_a: modelA,
          model_b: modelB,
          ad_account_id: adAccountId,
          page_id: pageId,
          daily_budget: parseInt(dailyBudget, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSuccess(`A/B test launched! ID: ${data.id}`);
      fetchTests();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-2">A/B Test Launcher</h1>
      <p className="text-gray-400 mb-6 text-sm">
        One script → two video models → two Meta adsets. ROAS compared automatically after 5 days.
      </p>

      <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-6 mb-8 space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium mb-1">Ad Script</label>
          <textarea
            className="w-full bg-gray-800 rounded p-2 text-sm h-28 resize-y"
            placeholder="Enter your ad script..."
            value={script}
            onChange={(e) => setScript(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Product ID</label>
            <input
              className="w-full bg-gray-800 rounded p-2 text-sm"
              placeholder="shopify-product-id"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Daily Budget (cents)</label>
            <input
              type="number"
              className="w-full bg-gray-800 rounded p-2 text-sm"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Model A</label>
            <select
              className="w-full bg-gray-800 rounded p-2 text-sm"
              value={modelA}
              onChange={(e) => setModelA(e.target.value)}
            >
              {VIDEO_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Model B</label>
            <select
              className="w-full bg-gray-800 rounded p-2 text-sm"
              value={modelB}
              onChange={(e) => setModelB(e.target.value)}
            >
              {VIDEO_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Meta Ad Account ID</label>
            <input
              className="w-full bg-gray-800 rounded p-2 text-sm"
              placeholder="act_XXXXXXXXX"
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Facebook Page ID</label>
            <input
              className="w-full bg-gray-800 rounded p-2 text-sm"
              placeholder="Page ID"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              required
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-green-400 text-sm">{success}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg py-2 font-medium text-sm transition-colors"
        >
          {submitting ? "Launching…" : "Launch A/B Test"}
        </button>
      </form>

      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Test History</h2>
          <button
            onClick={fetchTests}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : tests.length === 0 ? (
          <p className="text-gray-500 text-sm">No A/B tests yet.</p>
        ) : (
          <div className="space-y-3">
            {tests.map((test) => (
              <div key={test.id} className="bg-gray-900 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <StatusBadge status={test.status} />
                      <span className="text-xs text-gray-500 font-mono">{test.id.slice(0, 8)}</span>
                      {test.winner && (
                        <span className="text-xs font-bold text-yellow-400">
                          🏆 Winner: Model {test.winner}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 truncate mb-3">{test.script}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-1">Model A: {test.model_a}</div>
                        {test.roas_a != null && (
                          <div className="text-sm font-semibold">ROAS: {test.roas_a.toFixed(2)}x</div>
                        )}
                        {test.adset_id_a && (
                          <div className="text-xs text-gray-500 font-mono mt-1 truncate">Adset: {test.adset_id_a}</div>
                        )}
                      </div>
                      <div className="bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-400 mb-1">Model B: {test.model_b}</div>
                        {test.roas_b != null && (
                          <div className="text-sm font-semibold">ROAS: {test.roas_b.toFixed(2)}x</div>
                        )}
                        {test.adset_id_b && (
                          <div className="text-xs text-gray-500 font-mono mt-1 truncate">Adset: {test.adset_id_b}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">
                    {test.created_at ? new Date(test.created_at).toLocaleDateString() : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

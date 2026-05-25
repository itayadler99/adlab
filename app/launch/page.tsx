"use client";
import { useEffect, useState, useCallback } from "react";

interface Store {
  id: string;
  name: string;
  adAccountId: string;
  pageId: string;
  defaultLink?: string;
  configured: boolean;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  insights?: {
    spend?: string;
    impressions?: string;
    clicks?: string;
    ctr?: string;
  } | null;
}

interface LaunchForm {
  campaignName: string;
  objective: string;
  adAccountId: string;
  pageId: string;
  videoUrl: string;
  headline: string;
  description: string;
  targetUrl: string;
  budget: string;
  clonedFromId: string;
}

const OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_TRAFFIC",
  "OUTCOME_APP_PROMOTION",
];

const DEFAULT_FORM: LaunchForm = {
  campaignName: "",
  objective: "OUTCOME_SALES",
  adAccountId: "",
  pageId: "",
  videoUrl: "",
  headline: "",
  description: "",
  targetUrl: "",
  budget: "50",
  clonedFromId: "",
};

export default function LaunchPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignsError, setCampaignsError] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [form, setForm] = useState<LaunchForm>(DEFAULT_FORM);
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [showClonePanel, setShowClonePanel] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    setCampaignsError("");
    try {
      const res = await fetch("/api/campaigns");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch campaigns");
      setCampaigns(json.campaigns ?? []);
    } catch (e) {
      setCampaignsError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    fetch("/api/stores")
      .then((r) => r.json())
      .then((j) => setStores(j.stores ?? []))
      .catch(() => {});
  }, [fetchCampaigns]);

  const handleSelectStore = (id: string) => {
    setSelectedStoreId(id);
    const s = stores.find((x) => x.id === id);
    if (!s) return;
    setForm((prev) => ({
      ...prev,
      adAccountId: s.adAccountId || prev.adAccountId,
      pageId: s.pageId || prev.pageId,
      targetUrl: s.defaultLink || prev.targetUrl,
    }));
    setShowClonePanel(true);
  };

  const handleSelectCampaign = (id: string) => {
    setSelectedCampaignId(id);
    if (!id) {
      setShowClonePanel(false);
      return;
    }
    const c = campaigns.find((x) => x.id === id);
    if (c) {
      setForm((prev) => ({
        ...prev,
        campaignName: c.name + " (copy)",
        objective: c.objective || prev.objective,
        clonedFromId: c.id,
      }));
      setShowClonePanel(true);
    }
  };

  const handleNewCampaign = () => {
    setSelectedCampaignId("");
    setForm(DEFAULT_FORM);
    setShowClonePanel(true);
  };

  const handleChange = (field: keyof LaunchForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLaunch = async () => {
    if (!form.campaignName || !form.adAccountId || !form.pageId || !form.videoUrl) {
      setResult({ success: false, message: "Please fill in all required fields." });
      return;
    }
    setLaunching(true);
    setResult(null);
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Launch failed");
      setResult({ success: true, message: "Campaign launched successfully!", data: json });
      setShowClonePanel(false);
      fetchCampaigns();
    } catch (e) {
      setResult({ success: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLaunching(false);
    }
  };

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Launch Campaign</h1>
          <p className="text-gray-400 mt-1">Select an existing Meta campaign to clone and edit, or create a new one.</p>
        </div>

        {/* Store Picker */}
        <div className="bg-gray-900 rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">Store</h2>
          <select
            value={selectedStoreId}
            onChange={(e) => handleSelectStore(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Pick a store —</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.configured}>
                {s.name}{s.configured ? "" : " (not configured)"}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Selecting a store auto-fills ad account, page, and target URL.
          </p>
        </div>

        {/* Existing Campaigns */}
        <div className="bg-gray-900 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Existing Meta Campaigns</h2>
            <button
              onClick={fetchCampaigns}
              disabled={loadingCampaigns}
              className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50 transition"
            >
              {loadingCampaigns ? "Refreshing…" : "↺ Refresh"}
            </button>
          </div>

          {campaignsError && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
              {campaignsError}
            </div>
          )}

          {loadingCampaigns && campaigns.length === 0 ? (
            <div className="text-gray-500 text-sm py-4 text-center">Loading campaigns…</div>
          ) : campaigns.length === 0 ? (
            <div className="text-gray-500 text-sm py-4 text-center">No campaigns found.</div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Select a campaign to clone
              </label>
              <select
                value={selectedCampaignId}
                onChange={(e) => handleSelectCampaign(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Choose a campaign —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} [{c.status}]{c.objective ? ` · ${c.objective}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedCampaign && (
            <div className="bg-gray-800 rounded-lg p-4 text-sm space-y-1">
              <div className="flex flex-wrap gap-4">
                <span><span className="text-gray-400">ID:</span> <span className="text-gray-200">{selectedCampaign.id}</span></span>
                <span><span className="text-gray-400">Status:</span> <span className={selectedCampaign.status === "ACTIVE" ? "text-green-400" : "text-yellow-400"}>{selectedCampaign.status}</span></span>
                {selectedCampaign.objective && (
                  <span><span className="text-gray-400">Objective:</span> <span className="text-gray-200">{selectedCampaign.objective}</span></span>
                )}
              </div>
              {selectedCampaign.insights && (
                <div className="flex flex-wrap gap-4 mt-2 pt-2 border-t border-gray-700">
                  {selectedCampaign.insights.spend != null && (
                    <span><span className="text-gray-400">Spend:</span> <span className="text-gray-200">${selectedCampaign.insights.spend}</span></span>
                  )}
                  {selectedCampaign.insights.impressions != null && (
                    <span><span className="text-gray-400">Impressions:</span> <span className="text-gray-200">{selectedCampaign.insights.impressions}</span></span>
                  )}
                  {selectedCampaign.insights.clicks != null && (
                    <span><span className="text-gray-400">Clicks:</span> <span className="text-gray-200">{selectedCampaign.insights.clicks}</span></span>
                  )}
                  {selectedCampaign.insights.ctr != null && (
                    <span><span className="text-gray-400">CTR:</span> <span className="text-gray-200">{selectedCampaign.insights.ctr}%</span></span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {selectedCampaignId && (
              <button
                onClick={() => setShowClonePanel(true)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition"
              >
                Clone &amp; Edit
              </button>
            )}
            <button
              onClick={handleNewCampaign}
              className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
            >
              + New Campaign
            </button>
          </div>
        </div>

        {/* Clone / Create Form */}
        {showClonePanel && (
          <div className="bg-gray-900 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {form.clonedFromId ? "Clone Campaign" : "New Campaign"}
              </h2>
              {form.clonedFromId && (
                <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
                  Cloned from {form.clonedFromId}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Campaign Name *</label>
                <input
                  type="text"
                  value={form.campaignName}
                  onChange={(e) => handleChange("campaignName", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="My Awesome Campaign"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Objective</label>
                <select
                  value={form.objective}
                  onChange={(e) => handleChange("objective", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {OBJECTIVES.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Daily Budget (USD) *</label>
                <input
                  type="number"
                  min="1"
                  value={form.budget}
                  onChange={(e) => handleChange("budget", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Ad Account ID *</label>
                <input
                  type="text"
                  value={form.adAccountId}
                  onChange={(e) => handleChange("adAccountId", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="act_123456789"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Facebook Page ID *</label>
                <input
                  type="text"
                  value={form.pageId}
                  onChange={(e) => handleChange("pageId", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="123456789"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Video URL *</label>
                <input
                  type="url"
                  value={form.videoUrl}
                  onChange={(e) => handleChange("videoUrl", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Headline</label>
                <input
                  type="text"
                  value={form.headline}
                  onChange={(e) => handleChange("headline", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Shop Now"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Limited time offer…"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">Target URL</label>
                <input
                  type="url"
                  value={form.targetUrl}
                  onChange={(e) => handleChange("targetUrl", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://yourstore.com/products/..."
                />
              </div>
            </div>

            {result && (
              <div
                className={`rounded-lg p-4 text-sm ${
                  result.success
                    ? "bg-green-900/40 border border-green-700 text-green-300"
                    : "bg-red-900/40 border border-red-700 text-red-300"
                }`}
              >
                {result.message}
                {result.success && result.data && (
                  <pre className="mt-2 text-xs text-gray-400 overflow-x-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleLaunch}
                disabled={launching}
                className="px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition"
              >
                {launching ? "Launching…" : "🚀 Launch Campaign"}
              </button>
              <button
                onClick={() => {
                  setShowClonePanel(false);
                  setResult(null);
                }}
                className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Campaigns Table */}
        {campaigns.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">All Campaigns</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left">
                    <th className="pb-3 pr-4 text-gray-400 font-medium">Name</th>
                    <th className="pb-3 pr-4 text-gray-400 font-medium">Status</th>
                    <th className="pb-3 pr-4 text-gray-400 font-medium">Objective</th>
                    <th className="pb-3 pr-4 text-gray-400 font-medium">Spend</th>
                    <th className="pb-3 text-gray-400 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-800/50 transition">
                      <td className="py-3 pr-4 text-gray-200 font-medium">{c.name}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            c.status === "ACTIVE"
                              ? "bg-green-900/50 text-green-400"
                              : c.status === "PAUSED"
                              ? "bg-yellow-900/50 text-yellow-400"
                              : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-400">{c.objective ?? "—"}</td>
                      <td className="py-3 pr-4 text-gray-400">
                        {c.insights?.spend != null ? `$${c.insights.spend}` : "—"}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => handleSelectCampaign(c.id)}
                          className="text-blue-400 hover:text-blue-300 text-xs underline transition"
                        >
                          Clone
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_AWARENESS: "מודעות",
  OUTCOME_ENGAGEMENT: "מעורבות",
  OUTCOME_LEADS: "לידים",
  OUTCOME_SALES: "מכירות",
  OUTCOME_TRAFFIC: "תנועה לאתר",
  OUTCOME_APP_PROMOTION: "קידום אפליקציה",
};

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
      if (!res.ok) throw new Error(json.error || "טעינת הקמפיינים נכשלה");
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
        campaignName: c.name + " (עותק)",
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
      setResult({ success: false, message: "יש למלא את כל שדות החובה." });
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
      if (!res.ok) throw new Error(json.error || "ההשקה נכשלה");
      setResult({ success: true, message: "הקמפיין הושק בהצלחה", data: json });
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
    <div className="min-h-screen bg-black text-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white">השקת קמפיין</h1>
          <p className="text-gray-400 mt-1">בחרו קמפיין מטא קיים לשכפול ועריכה, או צרו קמפיין חדש.</p>
        </div>

        {/* Store Picker */}
        <div className="bg-gray-900 rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">חנות</h2>
          <select
            value={selectedStoreId}
            onChange={(e) => handleSelectStore(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">בחרו חנות</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.configured}>
                {s.name}{s.configured ? "" : " (לא מוגדרת)"}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            בחירת חנות ממלאת אוטומטית את חשבון המודעות, העמוד וכתובת היעד.
          </p>
        </div>

        {/* Existing Campaigns */}
        <div className="bg-gray-900 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">קמפיינים קיימים במטא</h2>
            <button
              onClick={fetchCampaigns}
              disabled={loadingCampaigns}
              className="text-sm text-violet-400 hover:text-violet-300 disabled:opacity-50 transition"
            >
              {loadingCampaigns ? "מרענן" : "רענון"}
            </button>
          </div>

          {campaignsError && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
              {campaignsError}
            </div>
          )}

          {loadingCampaigns && campaigns.length === 0 ? (
            <div className="text-gray-500 text-sm py-4 text-center">טוען קמפיינים</div>
          ) : campaigns.length === 0 ? (
            <div className="text-gray-500 text-sm py-4 text-center">לא נמצאו קמפיינים.</div>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                בחרו קמפיין לשכפול
              </label>
              <select
                value={selectedCampaignId}
                onChange={(e) => handleSelectCampaign(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">בחרו קמפיין</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} [{c.status}]{c.objective ? ` · ${OBJECTIVE_LABELS[c.objective] ?? c.objective}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedCampaign && (
            <div className="bg-gray-800 rounded-lg p-4 text-sm space-y-1">
              <div className="flex flex-wrap gap-4">
                <span><span className="text-gray-400">מזהה:</span> <span className="text-gray-200 ltr-island">{selectedCampaign.id}</span></span>
                <span><span className="text-gray-400">סטטוס:</span> <span className={selectedCampaign.status === "ACTIVE" ? "text-green-400" : "text-yellow-400"}>{selectedCampaign.status}</span></span>
                {selectedCampaign.objective && (
                  <span><span className="text-gray-400">מטרה:</span> <span className="text-gray-200">{OBJECTIVE_LABELS[selectedCampaign.objective] ?? selectedCampaign.objective}</span></span>
                )}
              </div>
              {selectedCampaign.insights && (
                <div className="flex flex-wrap gap-4 mt-2 pt-2 border-t border-gray-700">
                  {selectedCampaign.insights.spend != null && (
                    <span><span className="text-gray-400">הוצאה:</span> <span className="text-gray-200">${selectedCampaign.insights.spend}</span></span>
                  )}
                  {selectedCampaign.insights.impressions != null && (
                    <span><span className="text-gray-400">חשיפות:</span> <span className="text-gray-200">{selectedCampaign.insights.impressions}</span></span>
                  )}
                  {selectedCampaign.insights.clicks != null && (
                    <span><span className="text-gray-400">קליקים:</span> <span className="text-gray-200">{selectedCampaign.insights.clicks}</span></span>
                  )}
                  {selectedCampaign.insights.ctr != null && (
                    <span><span className="text-gray-400">אחוז הקלקה:</span> <span className="text-gray-200">{selectedCampaign.insights.ctr}%</span></span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {selectedCampaignId && (
              <button
                onClick={() => setShowClonePanel(true)}
                className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium transition"
              >
                שכפול ועריכה
              </button>
            )}
            <button
              onClick={handleNewCampaign}
              className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
            >
              קמפיין חדש
            </button>
          </div>
        </div>

        {/* Clone / Create Form */}
        {showClonePanel && (
          <div className="bg-gray-900 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {form.clonedFromId ? "שכפול קמפיין" : "קמפיין חדש"}
              </h2>
              {form.clonedFromId && (
                <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
                  שוכפל מתוך <span className="ltr-island">{form.clonedFromId}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">שם הקמפיין *</label>
                <input
                  type="text"
                  value={form.campaignName}
                  onChange={(e) => handleChange("campaignName", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="הקמפיין שלי"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">מטרה</label>
                <select
                  value={form.objective}
                  onChange={(e) => handleChange("objective", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {OBJECTIVES.map((o) => (
                    <option key={o} value={o}>{OBJECTIVE_LABELS[o] ?? o}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">תקציב יומי (דולר) *</label>
                <input
                  type="number"
                  min="1"
                  value={form.budget}
                  onChange={(e) => handleChange("budget", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">מזהה חשבון מודעות *</label>
                <input
                  type="text"
                  value={form.adAccountId}
                  onChange={(e) => handleChange("adAccountId", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 ltr-island"
                  placeholder="act_123456789"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">מזהה עמוד פייסבוק *</label>
                <input
                  type="text"
                  value={form.pageId}
                  onChange={(e) => handleChange("pageId", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 ltr-island"
                  placeholder="123456789"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">כתובת הסרטון *</label>
                <input
                  type="url"
                  value={form.videoUrl}
                  onChange={(e) => handleChange("videoUrl", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 ltr-island"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">כותרת</label>
                <input
                  type="text"
                  value={form.headline}
                  onChange={(e) => handleChange("headline", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="לרכישה עכשיו"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">תיאור</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="מבצע לזמן מוגבל"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">כתובת יעד</label>
                <input
                  type="url"
                  value={form.targetUrl}
                  onChange={(e) => handleChange("targetUrl", e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 ltr-island"
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
                {launching ? "משיק" : "השקת קמפיין"}
              </button>
              <button
                onClick={() => {
                  setShowClonePanel(false);
                  setResult(null);
                }}
                className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition"
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Campaigns Table */}
        {campaigns.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">כל הקמפיינים</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-start">
                    <th className="pb-3 px-4 text-gray-400 font-medium text-start">שם</th>
                    <th className="pb-3 px-4 text-gray-400 font-medium text-start">סטטוס</th>
                    <th className="pb-3 px-4 text-gray-400 font-medium text-start">מטרה</th>
                    <th className="pb-3 px-4 text-gray-400 font-medium text-start">הוצאה</th>
                    <th className="pb-3 text-gray-400 font-medium text-start">פעולה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-800/50 transition">
                      <td className="py-3 px-4 text-gray-200 font-medium">{c.name}</td>
                      <td className="py-3 px-4">
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
                      <td className="py-3 px-4 text-gray-400">{c.objective ? (OBJECTIVE_LABELS[c.objective] ?? c.objective) : "·"}</td>
                      <td className="py-3 px-4 text-gray-400">
                        {c.insights?.spend != null ? `$${c.insights.spend}` : "·"}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => handleSelectCampaign(c.id)}
                          className="text-violet-400 hover:text-violet-300 text-xs underline transition"
                        >
                          שכפול
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

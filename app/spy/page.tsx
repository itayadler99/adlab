"use client";
import { useState } from "react";

interface SpyAd {
  id?: string;
  pageName?: string;
  adArchiveId?: string;
  startDate?: string;
  status?: string;
  snapshot?: {
    title?: string;
    body?: string;
    images?: { originalImageUrl?: string }[];
    videos?: { videoSdUrl?: string; thumbnailUrl?: string }[];
    linkUrl?: string;
  };
  spend?: { lowerBound?: string; upperBound?: string };
  impressions?: { lowerBound?: string; upperBound?: string };
}

interface MetaAd {
  id?: string;
  creative?: { title?: string; body?: string; image_url?: string };
  insights?: { data?: { impressions?: string; spend?: string }[] };
}

export default function SpyPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MetaAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Scrape panel state
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [scrapeTerms, setScrapeTerms] = useState("");
  const [scrapePageIds, setScrapePageIds] = useState("");
  const [scrapeCountry, setScrapeCountry] = useState("US");
  const [scrapeMax, setScrapeMax] = useState(20);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [scrapeAds, setScrapeAds] = useState<SpyAd[]>([]);
  const [scrapeRunId, setScrapeRunId] = useState("");
  const [scrapeStatus, setScrapeStatus] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/spy?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.ads ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault();
    setScrapeLoading(true);
    setScrapeError("");
    setScrapeAds([]);
    setScrapeRunId("");
    setScrapeStatus("");
    try {
      const input: Record<string, unknown> = {
        country: scrapeCountry,
        maxResults: scrapeMax,
        async: true,
      };
      if (scrapeTerms.trim()) input.searchTerms = scrapeTerms.split(",").map((s) => s.trim()).filter(Boolean);
      if (scrapePageIds.trim()) input.searchPageIDs = scrapePageIds.split(",").map((s) => s.trim()).filter(Boolean);

      const res = await fetch("/api/spy/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scrape failed");
      setScrapeRunId(data.runId);
      setScrapeStatus("RUNNING");
      pollForResults(data.runId);
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : String(err));
      setScrapeLoading(false);
    }
  }

  async function pollForResults(runId: string) {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/spy/scrape?runId=${encodeURIComponent(runId)}`);
        const data = await res.json();
        setScrapeStatus(data.status);
        if (data.status === "SUCCEEDED") {
          setScrapeAds(data.ads ?? []);
          setScrapeLoading(false);
          return;
        }
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(data.status)) {
          setScrapeError(`Run ended with status: ${data.status}`);
          setScrapeLoading(false);
          return;
        }
      } catch {
        // keep polling
      }
    }
    setScrapeError("Polling timed out. Run may still be in progress.");
    setScrapeLoading(false);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-8">Ad Spy</h1>

      {/* Meta Ad Library Search */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Meta Ad Library Search</h2>
        <form onSubmit={handleSearch} className="flex gap-3 mb-4">
          <input
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-indigo-500"
            placeholder="Search ads by keyword..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-medium transition-colors"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((ad, i) => (
              <div key={ad.id ?? i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                {ad.creative?.image_url && (
                  <img src={ad.creative.image_url} alt="ad" className="w-full h-36 object-cover rounded mb-3" />
                )}
                <p className="font-semibold text-sm mb-1">{ad.creative?.title ?? "No title"}</p>
                <p className="text-gray-400 text-xs line-clamp-3">{ad.creative?.body ?? ""}</p>
                {ad.insights?.data?.[0] && (
                  <div className="mt-3 flex gap-4 text-xs text-gray-500">
                    <span>Impressions: {ad.insights.data[0].impressions ?? "—"}</span>
                    <span>Spend: ${ad.insights.data[0].spend ?? "—"}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Apify Scrape */}
      <section>
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-xl font-semibold">Facebook Ad Library Scraper</h2>
          <button
            onClick={() => setScrapeOpen((o) => !o)}
            className="bg-emerald-700 hover:bg-emerald-600 px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            {scrapeOpen ? "Hide Scraper" : "Scrape URL"}
          </button>
        </div>

        {scrapeOpen && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <form onSubmit={handleScrape} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Search Terms (comma-separated)</label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  placeholder="nike, running shoes, sportswear"
                  value={scrapeTerms}
                  onChange={(e) => setScrapeTerms(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Page IDs (comma-separated, optional)</label>
                <input
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  placeholder="123456789, 987654321"
                  value={scrapePageIds}
                  onChange={(e) => setScrapePageIds(e.target.value)}
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Country</label>
                  <select
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    value={scrapeCountry}
                    onChange={(e) => setScrapeCountry(e.target.value)}
                  >
                    <option value="US">US</option>
                    <option value="GB">GB</option>
                    <option value="CA">CA</option>
                    <option value="AU">AU</option>
                    <option value="DE">DE</option>
                    <option value="FR">FR</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Max Results</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    value={scrapeMax}
                    onChange={(e) => setScrapeMax(Number(e.target.value))}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={scrapeLoading || (!scrapeTerms.trim() && !scrapePageIds.trim())}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-6 py-2 rounded text-sm font-medium transition-colors"
              >
                {scrapeLoading ? "Scraping…" : "Start Scrape"}
              </button>
            </form>

            {scrapeError && <p className="text-red-400 text-sm mt-3">{scrapeError}</p>}

            {scrapeRunId && (
              <div className="mt-4 text-xs text-gray-400">
                <span>Run ID: <code className="text-gray-300">{scrapeRunId}</code></span>
                <span className="ml-4">Status: <span className={scrapeStatus === "SUCCEEDED" ? "text-emerald-400" : "text-yellow-400"}>{scrapeStatus}</span></span>
              </div>
            )}
          </div>
        )}

        {scrapeAds.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {scrapeAds.map((ad, i) => {
              const thumb = ad.snapshot?.videos?.[0]?.thumbnailUrl ?? ad.snapshot?.images?.[0]?.originalImageUrl;
              return (
                <div key={ad.adArchiveId ?? i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  {thumb && (
                    <img src={thumb} alt="ad thumbnail" className="w-full h-36 object-cover rounded mb-3" />
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-emerald-400">{ad.pageName ?? "Unknown Page"}</span>
                    {ad.status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        ad.status === "ACTIVE" ? "bg-emerald-900 text-emerald-300" : "bg-gray-700 text-gray-400"
                      }`}>{ad.status}</span>
                    )}
                  </div>
                  <p className="font-semibold text-sm mb-1">{ad.snapshot?.title ?? "No title"}</p>
                  <p className="text-gray-400 text-xs line-clamp-3">{ad.snapshot?.body ?? ""}</p>
                  {ad.snapshot?.linkUrl && (
                    <a
                      href={ad.snapshot.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 text-xs mt-2 block truncate hover:underline"
                    >
                      {ad.snapshot.linkUrl}
                    </a>
                  )}
                  {(ad.spend?.lowerBound || ad.impressions?.lowerBound) && (
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                      {ad.spend?.lowerBound && (
                        <span>Spend: ${ad.spend.lowerBound}–${ad.spend.upperBound ?? "?"}</span>
                      )}
                      {ad.impressions?.lowerBound && (
                        <span>Impressions: {ad.impressions.lowerBound}–{ad.impressions.upperBound ?? "?"}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

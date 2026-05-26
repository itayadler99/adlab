const APIFY_TOKEN = process.env.APIFY_TOKEN ?? "";
const ACTOR_ID = process.env.APIFY_ACTOR_ID ?? "apify~facebook-ads-scraper";
const BASE_URL = "https://api.apify.com/v2";

export interface ApifyAd {
  id?: string;
  pageId?: string;
  pageName?: string;
  adArchiveId?: string;
  startDate?: string;
  endDate?: string;
  snapshot?: {
    title?: string;
    body?: string;
    videos?: { videoHdUrl?: string; videoSdUrl?: string; thumbnailUrl?: string }[];
    images?: { originalImageUrl?: string }[];
    linkDescription?: string;
    linkUrl?: string;
  };
  status?: string;
  currency?: string;
  spend?: { lowerBound?: string; upperBound?: string };
  impressions?: { lowerBound?: string; upperBound?: string };
  [key: string]: unknown;
}

export interface ApifyRunInput {
  adArchiveId?: string;
  searchPageIDs?: string[];
  searchTerms?: string[];
  adType?: "ALL" | "POLITICAL_AND_ISSUE_ADS" | "HOUSING" | "EMPLOYMENT" | "CREDIT";
  publisherPlatform?: string[];
  country?: string;
  startDate?: string;
  endDate?: string;
  maxResults?: number;
}

interface ApifyRunResponse {
  data: { id: string; status: string; defaultDatasetId: string };
}

// Apify /datasets/{id}/items returns a raw JSON array, not wrapped.
type ApifyDatasetResponse = ApifyAd[];

async function apifyFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}token=${APIFY_TOKEN}`;
  const res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function startScrape(input: ApifyRunInput): Promise<string> {
  const body: ApifyRunInput & { maxResults: number } = {
    adType: "ALL",
    country: "US",
    maxResults: 20,
    ...input,
  };
  const run = await apifyFetch<ApifyRunResponse>(`/acts/${encodeURIComponent(ACTOR_ID)}/runs`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return run.data.id;
}

export async function pollScrape(runId: string): Promise<{ status: string; ads: ApifyAd[] }> {
  const run = await apifyFetch<{ data: { id: string; status: string; defaultDatasetId: string } }>(`/actor-runs/${runId}`);
  const { status, defaultDatasetId } = run.data;
  if (status !== "SUCCEEDED") {
    return { status, ads: [] };
  }
  const items = await apifyFetch<ApifyDatasetResponse>(`/datasets/${defaultDatasetId}/items?format=json&clean=true`);
  return { status, ads: Array.isArray(items) ? items : [] };
}

export async function scrapeAdLibrary(input: ApifyRunInput, timeoutMs = 120_000): Promise<ApifyAd[]> {
  const runId = await startScrape(input);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const { status, ads } = await pollScrape(runId);
    if (status === "SUCCEEDED") return ads;
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      throw new Error(`Apify run ${runId} ended with status: ${status}`);
    }
  }
  throw new Error(`Apify run ${runId} timed out after ${timeoutMs}ms`);
}

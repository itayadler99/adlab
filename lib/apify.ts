const APIFY_TOKEN = process.env.APIFY_TOKEN ?? "";
const ADS_ACTOR_ID = process.env.APIFY_ADS_ACTOR_ID ?? "apify~facebook-ads-scraper";
const PAGES_ACTOR_ID = process.env.APIFY_PAGES_ACTOR_ID ?? "apify~facebook-pages-scraper";
const BASE_URL = "https://api.apify.com/v2";

// Normalized ad shape used by the rest of the app.
export interface ApifyAd {
  adArchiveId?: string;
  pageId?: string;
  pageName?: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  publisherPlatform?: string[];
  spend?: { lowerBound?: string; upperBound?: string };
  impressions?: { lowerBound?: string; upperBound?: string };
  snapshot?: {
    title?: string;
    body?: string;
    videos?: { videoHdUrl?: string; videoSdUrl?: string; thumbnailUrl?: string }[];
    images?: { originalImageUrl?: string }[];
    linkUrl?: string;
    ctaType?: string;
  };
}

// Raw Apify response shape (subset we care about)
interface ApifyRawAd {
  adArchiveId?: string;
  pageId?: string;
  pageName?: string;
  startDate?: number;
  endDate?: number;
  startDateFormatted?: string;
  endDateFormatted?: string;
  isActive?: boolean;
  publisherPlatform?: string[];
  spend?: { lowerBound?: string; upperBound?: string } | null;
  impressionsWithIndex?: { impressionsText?: string | null };
  snapshot?: {
    title?: string | { text?: string };
    body?: string | { text?: string };
    videos?: {
      videoHdUrl?: string;
      videoSdUrl?: string;
      videoPreviewImageUrl?: string;
      thumbnailUrl?: string;
    }[];
    images?: {
      originalImageUrl?: string;
      resizedImageUrl?: string;
    }[];
    linkUrl?: string;
    ctaType?: string;
  };
  // sometimes wrapper around itself
  results?: ApifyRawAd[];
  error?: string;
}

function normalizeText(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "text" in v && typeof (v as { text: unknown }).text === "string") {
    return (v as { text: string }).text;
  }
  return undefined;
}

function normalizeAd(raw: ApifyRawAd): ApifyAd | null {
  if (!raw || raw.error) return null;
  const snapshot = raw.snapshot;
  if (!snapshot) return null;
  const body = normalizeText(snapshot.body);
  const title = normalizeText(snapshot.title);
  const videos = (snapshot.videos || []).map((v) => ({
    videoHdUrl: v.videoHdUrl,
    videoSdUrl: v.videoSdUrl,
    thumbnailUrl: v.videoPreviewImageUrl || v.thumbnailUrl,
  }));
  const images = (snapshot.images || []).map((i) => ({
    originalImageUrl: i.originalImageUrl || i.resizedImageUrl,
  }));
  return {
    adArchiveId: raw.adArchiveId,
    pageId: raw.pageId,
    pageName: raw.pageName,
    startDate: raw.startDateFormatted || (raw.startDate ? new Date(raw.startDate * 1000).toISOString() : undefined),
    endDate: raw.endDateFormatted || (raw.endDate ? new Date(raw.endDate * 1000).toISOString() : undefined),
    isActive: raw.isActive,
    publisherPlatform: raw.publisherPlatform,
    spend: raw.spend || undefined,
    impressions: undefined,
    snapshot: {
      title,
      body,
      videos,
      images,
      linkUrl: snapshot.linkUrl,
      ctaType: snapshot.ctaType,
    },
  };
}

async function apifyFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

interface ApifyRunResponse {
  data: { id: string; status: string; defaultDatasetId: string };
}

async function startActorRun(actorId: string, input: unknown): Promise<string> {
  const run = await apifyFetch<ApifyRunResponse>(`/acts/${encodeURIComponent(actorId)}/runs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return run.data.id;
}

async function waitForRun<T = unknown>(runId: string, timeoutMs: number): Promise<T[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const run = await apifyFetch<ApifyRunResponse>(`/actor-runs/${runId}`);
    const { status, defaultDatasetId } = run.data;
    if (status === "SUCCEEDED") {
      const items = await apifyFetch<T[]>(`/datasets/${defaultDatasetId}/items?format=json&clean=true`);
      return Array.isArray(items) ? items : [];
    }
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      throw new Error(`Apify run ${runId} ended with status: ${status}`);
    }
  }
  throw new Error(`Apify run ${runId} timed out after ${timeoutMs}ms`);
}

export interface FbPageInfo {
  pageId?: string;
  pageAdLibraryId?: string;
  name?: string;
  isCurrentlyRunningAds: boolean;
  websites?: string[];
}

interface PageScraperRawItem {
  pageId?: string;
  pageName?: string;
  title?: string;
  ad_status?: string;
  pageAdLibrary?: { id?: string };
  websites?: string[];
}

// Step 1: resolve a brand/page URL into FB page metadata (incl. pageAdLibrary id used by Ad Library URLs)
export async function resolveFbPage(input: { url?: string; brand?: string }, timeoutMs = 120_000): Promise<FbPageInfo | null> {
  const url = input.url
    ? input.url
    : input.brand
    ? `https://www.facebook.com/${encodeURIComponent(input.brand)}/`
    : null;
  if (!url) return null;
  try {
    const runId = await startActorRun(PAGES_ACTOR_ID, { startUrls: [{ url }] });
    const items = await waitForRun<PageScraperRawItem>(runId, timeoutMs);
    if (!items.length) return null;
    const r = items[0];
    return {
      pageId: r.pageId,
      pageAdLibraryId: r.pageAdLibrary?.id,
      name: r.pageName || r.title,
      isCurrentlyRunningAds: (r.ad_status || "").toLowerCase().includes("currently running"),
      websites: r.websites,
    };
  } catch {
    return null;
  }
}

export interface ScrapeAdsInput {
  pageAdLibraryId?: string;
  pageId?: string;
  searchUrl?: string;
  country?: string;
  maxResults?: number;
}

// Step 2: scrape ads from Facebook Ad Library for a given page (preferred: pageAdLibraryId)
export async function scrapeAdLibrary(input: ScrapeAdsInput, timeoutMs = 180_000): Promise<ApifyAd[]> {
  const country = input.country || "US";
  const id = input.pageAdLibraryId || input.pageId;
  let url = input.searchUrl;
  if (!url && id) {
    url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${encodeURIComponent(
      id
    )}`;
  }
  if (!url) throw new Error("scrapeAdLibrary requires pageAdLibraryId/pageId or searchUrl");

  const body = {
    startUrls: [{ url }],
    maxResults: input.maxResults ?? 30,
    activeStatus: "active",
    country,
  };
  const runId = await startActorRun(ADS_ACTOR_ID, body);
  const raw = await waitForRun<ApifyRawAd>(runId, timeoutMs);
  // Some items are pageInfo wrappers with empty data — filter those out via normalizeAd
  const ads = raw
    .map((r) => normalizeAd(r))
    .filter((a): a is ApifyAd => a !== null);
  return ads;
}

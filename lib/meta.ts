// Meta Graph API v25.0 wrapper — ported from ~/.claude/meta-mcp/index.js
const BASE = "https://graph.facebook.com/v25.0";

function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN not set");
  return t;
}
function adAccount() {
  return process.env.META_AD_ACCOUNT_ID || "act_2312364629134701";
}

export async function metaGet<T = any>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("access_token", token());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok || (json && json.error)) {
    const msg = json?.error?.message || `Meta GET ${path} failed ${res.status}`;
    throw new Error(`Meta API: ${msg}`);
  }
  return json;
}

export async function metaPost<T = any>(path: string, body: Record<string, any> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("access_token", token());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || (json && json.error)) {
    const msg = json?.error?.message || `Meta POST ${path} failed ${res.status}`;
    throw new Error(`Meta API: ${msg}`);
  }
  return json;
}

export interface Campaign {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time?: string;
}

export interface InsightRow {
  campaign_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type?: string; value: string }>;
  date_start?: string;
  date_stop?: string;
}

// Meta reports purchases under several action_type aliases depending on
// pixel/conversion-api setup. Check them in priority order.
const PURCHASE_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_purchase",
  "omni_purchase",
  "purchase",
];

const INSIGHT_FIELDS =
  "spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas";

/** Lifetime purchase count from an insight row (0 when none). */
export function purchaseCount(row?: InsightRow | null): number {
  if (!row?.actions) return 0;
  for (const t of PURCHASE_ACTION_TYPES) {
    const a = row.actions.find((x) => x.action_type === t);
    if (a) return Math.round(Number(a.value) || 0);
  }
  return 0;
}

/** Purchase revenue (value) from an insight row. */
export function purchaseValue(row?: InsightRow | null): number {
  if (!row?.action_values) return 0;
  for (const t of PURCHASE_ACTION_TYPES) {
    const a = row.action_values.find((x) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

/** ROAS from an insight row. Prefers Meta's purchase_roas, falls back to value/spend. Null when no spend. */
export function roasOf(row?: InsightRow | null): number | null {
  if (!row) return null;
  if (row.purchase_roas?.length) {
    const v = Number(row.purchase_roas[0].value);
    if (Number.isFinite(v)) return v;
  }
  const spend = Number(row.spend) || 0;
  if (spend <= 0) return null;
  return purchaseValue(row) / spend;
}

export function spendOf(row?: InsightRow | null): number {
  return Number(row?.spend) || 0;
}

export async function getCampaigns(
  statusFilter: "ACTIVE" | "PAUSED" | "ALL" = "ALL"
): Promise<Campaign[]> {
  const params: Record<string, string> = {
    fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time",
    limit: "100",
  };
  if (statusFilter !== "ALL") {
    params.effective_status = JSON.stringify([statusFilter]);
  }
  const json = await metaGet<{ data?: Campaign[] }>(`/${adAccount()}/campaigns`, params);
  return json.data ?? [];
}

/** Single-window insight rows for one campaign. Unwraps Meta's `{data}` envelope. */
export async function getCampaignInsights(
  campaignId: string,
  datePreset = "last_7d"
): Promise<InsightRow[]> {
  const json = await metaGet<{ data?: InsightRow[] }>(`/${campaignId}/insights`, {
    fields: INSIGHT_FIELDS,
    date_preset: datePreset,
  });
  return json.data ?? [];
}

export interface MultiWindowInsights {
  lifetime: InsightRow | null;
  d7: InsightRow | null;
  d30: InsightRow | null;
}

/**
 * Itay's ironclad rule: always read lifetime + 7d + 30d. `date_preset=maximum`
 * is the lifetime window. Returns the single aggregated row per window (or null).
 */
export async function getCampaignInsightsMulti(
  campaignId: string
): Promise<MultiWindowInsights> {
  const [lifetime, d7, d30] = await Promise.all([
    getCampaignInsights(campaignId, "maximum").catch(() => []),
    getCampaignInsights(campaignId, "last_7d").catch(() => []),
    getCampaignInsights(campaignId, "last_30d").catch(() => []),
  ]);
  return {
    lifetime: lifetime[0] ?? null,
    d7: d7[0] ?? null,
    d30: d30[0] ?? null,
  };
}

/** Account-level insights broken down by campaign, keyed by campaign_id. One API call. */
export async function getAccountCampaignInsights(
  datePreset = "last_7d"
): Promise<Record<string, InsightRow>> {
  const json = await metaGet<{ data?: InsightRow[] }>(`/${adAccount()}/insights`, {
    level: "campaign",
    fields: `campaign_id,${INSIGHT_FIELDS}`,
    date_preset: datePreset,
    limit: "200",
  });
  const map: Record<string, InsightRow> = {};
  for (const r of json.data ?? []) {
    if (r.campaign_id) map[r.campaign_id] = r;
  }
  return map;
}

/** Pause or activate a campaign. Used by the kill-rule guard (opt-in). */
export async function setCampaignStatus(
  campaignId: string,
  status: "ACTIVE" | "PAUSED"
) {
  return metaPost(`/${campaignId}`, { status });
}

export async function createCampaign(opts: {
  name: string;
  objective?: string;
  status?: "ACTIVE" | "PAUSED";
  daily_budget?: number;
}) {
  return metaPost(`/${adAccount()}/campaigns`, {
    name: opts.name,
    objective: opts.objective || "OUTCOME_SALES",
    status: opts.status || "PAUSED",
    special_ad_categories: [],
    ...(opts.daily_budget ? { daily_budget: opts.daily_budget * 100 } : {}),
  });
}

export async function createAdset(opts: {
  name: string;
  campaign_id: string;
  daily_budget: number;
  countries?: string[];
  age_min?: number;
  age_max?: number;
  page_id: string;
  pixel_id?: string;
  custom_event_type?: string;
  status?: "ACTIVE" | "PAUSED";
}) {
  const targeting = {
    geo_locations: { countries: opts.countries || ["US"] },
    age_min: opts.age_min || 18,
    age_max: opts.age_max || 65,
  };
  return metaPost(`/${adAccount()}/adsets`, {
    name: opts.name,
    campaign_id: opts.campaign_id,
    daily_budget: opts.daily_budget * 100,
    billing_event: "IMPRESSIONS",
    optimization_goal: opts.custom_event_type === "PURCHASE" ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting,
    promoted_object: opts.pixel_id
      ? { pixel_id: opts.pixel_id, custom_event_type: opts.custom_event_type || "PURCHASE" }
      : undefined,
    status: opts.status || "PAUSED",
  });
}

export async function uploadVideoFromUrl(videoUrl: string, name?: string) {
  return metaPost(`/${adAccount()}/advideos`, {
    file_url: videoUrl,
    name: name || `adlab-${Date.now()}`,
  });
}

export async function uploadImageFromUrl(imageUrl: string) {
  // Meta image upload requires file/bytes — fetch then re-post as multipart
  const img = await fetch(imageUrl);
  const buf = Buffer.from(await img.arrayBuffer());
  const form = new FormData();
  form.append("source", new Blob([buf]), "image.jpg");
  form.append("access_token", token());
  const res = await fetch(`${BASE}/${adAccount()}/adimages`, { method: "POST", body: form });
  return res.json();
}

export async function createVideoCreative(opts: {
  name: string;
  page_id: string;
  video_id: string;
  thumbnail_url?: string;
  message: string;
  link: string;
  cta_type?: string;
}) {
  const video_data: Record<string, unknown> = {
    video_id: opts.video_id,
    message: opts.message,
    call_to_action: {
      type: opts.cta_type || "SHOP_NOW",
      value: { link: opts.link },
    },
  };
  // Only include image_url if a real URL was provided — empty string breaks Meta API.
  if (opts.thumbnail_url && opts.thumbnail_url.startsWith("http")) {
    video_data.image_url = opts.thumbnail_url;
  }
  return metaPost(`/${adAccount()}/adcreatives`, {
    name: opts.name,
    object_story_spec: {
      page_id: opts.page_id,
      video_data,
    },
  });
}

export async function createAd(opts: {
  name: string;
  adset_id: string;
  creative_id: string;
  status?: "ACTIVE" | "PAUSED";
}) {
  return metaPost(`/${adAccount()}/ads`, {
    name: opts.name,
    adset_id: opts.adset_id,
    creative: { creative_id: opts.creative_id },
    status: opts.status || "PAUSED",
  });
}

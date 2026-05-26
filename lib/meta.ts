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

export async function getCampaigns(statusFilter: "ACTIVE" | "PAUSED" | "ALL" = "ALL") {
  const params: Record<string, string> = {
    fields: "id,name,status,objective,daily_budget,lifetime_budget,created_time",
    limit: "100",
  };
  if (statusFilter !== "ALL") {
    params.effective_status = JSON.stringify([statusFilter]);
  }
  return metaGet(`/${adAccount()}/campaigns`, params);
}

export async function getCampaignInsights(campaignId: string, datePreset = "last_7d") {
  return metaGet(`/${campaignId}/insights`, {
    fields: "spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas",
    date_preset: datePreset,
  });
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

import { NextResponse } from "next/server";
import { createAd, createAdset, createCampaign, createVideoCreative, uploadVideoFromUrl } from "@/lib/meta";
import { writeHeadlines } from "@/lib/anthropic";
import { saveCampaign } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Em/en dash → comma; collapse a stray sentence-hyphen too (Itay copy rule).
function sanitizeHeadline(h: string): string {
  return h.replace(/\s*[—–]\s*/g, ", ").replace(/\s*-\s+/g, ", ").replace(/\s{2,}/g, " ").trim();
}

export async function POST(req: Request) {
  try {
    const b = await req.json();

    // Headline variants: when no message is supplied, auto-generate 3 in Itay's
    // Hebrew style and use the first as the primary text. All 3 are returned so
    // the caller can launch siblings or let the owner pick.
    let message: string = b.message ?? "";
    let headlines: string[] | undefined;
    if (!message.trim() && (b.product_title || b.productTitle)) {
      try {
        const res = await writeHeadlines({
          productTitle: b.product_title || b.productTitle,
          productDescription: b.product_description || b.productDescription,
          language: b.language || "he",
        });
        headlines = (res.headlines || []).map(sanitizeHeadline).filter(Boolean).slice(0, 3);
        message = headlines[0] ?? "";
      } catch {
        /* non-fatal — launch proceeds with whatever message was provided */
      }
    }

    const campaign = await createCampaign({ name: b.name, status: "PAUSED" });
    if (!campaign.id) throw new Error("Campaign create failed: " + JSON.stringify(campaign));

    const adset = await createAdset({
      name: b.name + " · adset",
      campaign_id: campaign.id,
      daily_budget: b.daily_budget,
      countries: b.countries,
      age_min: b.age_min,
      age_max: b.age_max,
      page_id: b.page_id,
      pixel_id: b.pixel_id,
      custom_event_type: "PURCHASE",
      status: "PAUSED",
    });
    if (!adset.id) throw new Error("Adset create failed: " + JSON.stringify(adset));

    const video = await uploadVideoFromUrl(b.video_url, b.name);
    if (!video.id) throw new Error("Video upload failed: " + JSON.stringify(video));

    const creative = await createVideoCreative({
      name: b.name + " · creative",
      page_id: b.page_id,
      video_id: video.id,
      thumbnail_url: b.thumbnail_url,
      message,
      link: b.link,
    });
    if (!creative.id) throw new Error("Creative create failed: " + JSON.stringify(creative));

    const ad = await createAd({
      name: b.name + " · ad",
      adset_id: adset.id,
      creative_id: creative.id,
      status: "PAUSED",
    });
    if (!ad.id) throw new Error("Ad create failed: " + JSON.stringify(ad));

    await saveCampaign({
      name: b.name,
      meta_campaign_id: campaign.id,
      meta_adset_id: adset.id,
      meta_creative_id: creative.id,
      meta_ad_id: ad.id,
      video_url: b.video_url,
      daily_budget: b.daily_budget,
      countries: b.countries,
    });

    return NextResponse.json({
      campaign_id: campaign.id,
      adset_id: adset.id,
      video_id: video.id,
      creative_id: creative.id,
      ad_id: ad.id,
      headlines,
      primary_text: message,
      message: "Created paused. Activate in Ads Manager.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

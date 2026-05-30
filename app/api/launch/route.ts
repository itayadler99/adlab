import { NextResponse } from "next/server";
import {
  createAd,
  createAdset,
  createCampaign,
  createVideoCreative,
  uploadVideoFromUrl,
  waitForVideoReady,
} from "@/lib/meta";
import { writeHeadlines } from "@/lib/anthropic";
import { getStore } from "@/lib/stores";
import { sanitizeHebrew } from "@/lib/copy";
import { saveCampaign } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const b = await req.json();

    // Multi-store: resolve the selected store so the launch lands in the right
    // ad account / page / link instead of always the global account.
    const store = b.store_id ? getStore(b.store_id) : undefined;
    if (b.store_id && !store) {
      return NextResponse.json({ error: `unknown store_id: ${b.store_id}` }, { status: 400 });
    }
    const accountId = b.ad_account_id || store?.adAccountId || undefined;
    const pageId = b.page_id || store?.pageId;
    const link = b.link || store?.defaultLink;
    if (!pageId) return NextResponse.json({ error: "page_id (or a configured store) required" }, { status: 400 });
    if (!link) return NextResponse.json({ error: "link (or a configured store) required" }, { status: 400 });

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
        headlines = (res.headlines || []).map((h) => sanitizeHebrew(h)).filter(Boolean).slice(0, 3);
        message = headlines[0] ?? "";
      } catch {
        /* non-fatal — launch proceeds with whatever message was provided */
      }
    }

    const campaign = await createCampaign({ name: b.name, status: "PAUSED", accountId });
    if (!campaign.id) throw new Error("Campaign create failed: " + JSON.stringify(campaign));

    const adset = await createAdset({
      name: b.name + " · adset",
      campaign_id: campaign.id,
      daily_budget: b.daily_budget,
      countries: b.countries,
      age_min: b.age_min,
      age_max: b.age_max,
      page_id: pageId,
      pixel_id: b.pixel_id,
      custom_event_type: "PURCHASE",
      status: "PAUSED",
      accountId,
    });
    if (!adset.id) throw new Error("Adset create failed: " + JSON.stringify(adset));

    const video = await uploadVideoFromUrl(b.video_url, b.name, accountId);
    if (!video.id) throw new Error("Video upload failed: " + JSON.stringify(video));
    // Wait for Meta to finish processing before building the creative.
    await waitForVideoReady(video.id);

    const creative = await createVideoCreative({
      name: b.name + " · creative",
      page_id: pageId,
      video_id: video.id,
      thumbnail_url: b.thumbnail_url,
      message,
      link,
      accountId,
    });
    if (!creative.id) throw new Error("Creative create failed: " + JSON.stringify(creative));

    const ad = await createAd({
      name: b.name + " · ad",
      adset_id: adset.id,
      creative_id: creative.id,
      status: "PAUSED",
      accountId,
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
      store_id: store?.id,
      ad_account_id: accountId,
    });

    return NextResponse.json({
      campaign_id: campaign.id,
      adset_id: adset.id,
      video_id: video.id,
      creative_id: creative.id,
      ad_id: ad.id,
      store_id: store?.id,
      ad_account_id: accountId,
      headlines,
      primary_text: message,
      message: "Created paused. Activate in Ads Manager.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

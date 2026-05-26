import { NextResponse } from "next/server";
import {
  createAd,
  createAdset,
  createCampaign,
  createVideoCreative,
  uploadVideoFromUrl,
} from "@/lib/meta";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ApproveBody {
  requireApproved: boolean;
  videoUrl: string;
  thumbnailUrl?: string;
  headline: string;
  bodyCopy: string;
  productLink: string;
  dailyBudget: number;
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  campaignName?: string;
  pageId?: string;
  pixelId?: string;
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as ApproveBody;
    if (!b.requireApproved) {
      return NextResponse.json(
        { error: "requireApproved flag missing — this endpoint only accepts user-approved launches" },
        { status: 400 }
      );
    }
    if (!b.videoUrl) {
      return NextResponse.json({ error: "videoUrl required (video must be finished rendering)" }, { status: 400 });
    }

    const pageId = b.pageId || process.env.META_PAGE_MONTIER_US || "796977063501732";
    const pixelId = b.pixelId || process.env.META_PIXEL_MONTIER_US || "3600655550069643";
    const link = b.productLink || process.env.LINK_MONTIER_US || "https://montierjewelry.com";
    const name = b.campaignName || `autopilot-${Date.now()}`;
    const dailyBudget = b.dailyBudget || 100;
    const countries = b.countries || ["US"];

    const campaign = await createCampaign({ name, status: "ACTIVE" });
    if (!campaign.id) throw new Error("Campaign create failed: " + JSON.stringify(campaign));

    const adset = await createAdset({
      name: name + " · adset",
      campaign_id: campaign.id,
      daily_budget: dailyBudget,
      countries,
      age_min: b.ageMin || 18,
      age_max: b.ageMax || 65,
      page_id: pageId,
      pixel_id: pixelId,
      custom_event_type: "PURCHASE",
      status: "ACTIVE",
    });
    if (!adset.id) throw new Error("Adset create failed: " + JSON.stringify(adset));

    const video = await uploadVideoFromUrl(b.videoUrl, name);
    if (!video.id) throw new Error("Video upload failed: " + JSON.stringify(video));

    const creative = await createVideoCreative({
      name: name + " · creative",
      page_id: pageId,
      video_id: video.id,
      thumbnail_url: b.thumbnailUrl || "",
      message: `${b.headline}\n\n${b.bodyCopy}`,
      link,
    });
    if (!creative.id) throw new Error("Creative create failed: " + JSON.stringify(creative));

    const ad = await createAd({
      name: name + " · ad",
      adset_id: adset.id,
      creative_id: creative.id,
      status: "ACTIVE",
    });
    if (!ad.id) throw new Error("Ad create failed: " + JSON.stringify(ad));

    return NextResponse.json({
      campaign_id: campaign.id,
      adset_id: adset.id,
      video_id: video.id,
      creative_id: creative.id,
      ad_id: ad.id,
      status: "ACTIVE",
      message: "Campaign launched live on Meta.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Approve failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

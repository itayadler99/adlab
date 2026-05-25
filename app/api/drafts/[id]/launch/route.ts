import { NextRequest, NextResponse } from "next/server";
import { getDraft, updateDraft, saveCampaign } from "@/lib/db";
import {
  createCampaign,
  createAdset,
  uploadVideoFromUrl,
  uploadImageFromUrl,
  createVideoCreative,
  createAd,
} from "@/lib/meta";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const draft = await getDraft(id);
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (draft.status !== "approved") {
      return NextResponse.json(
        { error: `Draft must be approved before launching. Current status: '${draft.status}'` },
        { status: 400 }
      );
    }
    if (!draft.video_url) {
      return NextResponse.json({ error: "Draft has no video URL" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const adAccountId: string = body.ad_account_id ?? draft.ad_account_id ?? process.env.META_AD_ACCOUNT_ID ?? "";
    const campaignName: string = body.campaign_name ?? draft.campaign_name ?? draft.title;
    const budget: number = Number(body.budget ?? draft.budget ?? 1000);

    if (!adAccountId) {
      return NextResponse.json({ error: "ad_account_id is required" }, { status: 400 });
    }

    // Create Meta campaign
    const campaign = await createCampaign(adAccountId, campaignName);
    const campaignId: string = campaign.id;

    // Create ad set
    const adset = await createAdset(adAccountId, campaignId, `${campaignName} AdSet`, budget);
    const adsetId: string = adset.id;

    // Upload video
    const videoUpload = await uploadVideoFromUrl(adAccountId, draft.video_url, draft.title);
    const videoId: string = videoUpload.video_id ?? videoUpload.id;

    // Create creative
    const creative = await createVideoCreative(
      adAccountId,
      `${campaignName} Creative`,
      videoId,
      draft.title,
      draft.script.slice(0, 255)
    );
    const creativeId: string = creative.id;

    // Create ad
    const ad = await createAd(adAccountId, adsetId, `${campaignName} Ad`, creativeId);

    // Save campaign to DB
    await saveCampaign({
      meta_campaign_id: campaignId,
      name: campaignName,
      status: "ACTIVE",
      budget,
    });

    // Mark draft as launched
    const updated = await updateDraft(id, { status: "launched" });

    return NextResponse.json({
      draft: updated,
      meta: { campaign_id: campaignId, adset_id: adsetId, ad_id: ad.id, creative_id: creativeId },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

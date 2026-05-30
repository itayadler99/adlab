import { NextRequest, NextResponse } from "next/server";
import { startVideo, pollVideo, type VideoModel } from "@/lib/video";
import { saveAbTest, updateAbTest } from "@/lib/abtests";
import {
  createCampaign,
  createAdset,
  uploadVideoFromUrl,
  createVideoCreative,
  createAd,
  waitForVideoReady,
} from "@/lib/meta";
import { getStore } from "@/lib/stores";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function normModel(m: string): VideoModel {
  if (m === "kling" || m === "kling-1.6") return "kling-1.6";
  return "minimax";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      script,
      product_id,
      model_a = "minimax",
      model_b = "kling-1.6",
      daily_budget = 10,
      thumbnail_url,
      pixel_id,
      store_id,
    } = body;

    // Multi-store: resolve page/link/account from the store when provided.
    const store = store_id ? getStore(store_id) : undefined;
    if (store_id && !store) {
      return NextResponse.json({ error: `unknown store_id: ${store_id}` }, { status: 400 });
    }
    const page_id = body.page_id || store?.pageId;
    const link = body.link || store?.defaultLink;
    const accountId = body.ad_account_id || store?.adAccountId || undefined;

    if (!script || !product_id || !page_id || !link) {
      return NextResponse.json(
        { error: "script, product_id, and page_id+link (or a configured store) required" },
        { status: 400 }
      );
    }

    const ma = normModel(model_a);
    const mb = normModel(model_b);

    const [jobA, jobB] = await Promise.all([
      startVideo(script, ma),
      startVideo(script, mb),
    ]);

    const compareAfter = new Date(Date.now() + FIVE_DAYS_MS).toISOString();

    const test = await saveAbTest({
      script,
      product_id,
      model_a: ma,
      model_b: mb,
      video_job_a: jobA.id,
      video_job_b: jobB.id,
      status: "generating",
      compare_after: compareAfter,
      meta: { daily_budget, page_id, link, thumbnail_url, pixel_id, store_id, accountId },
    });

    launchWhenReady(test.id, jobA.id, jobB.id, ma, mb, {
      page_id,
      daily_budget,
      link,
      thumbnail_url,
      pixel_id,
      accountId,
    }).catch(console.error);

    return NextResponse.json({ id: test.id, status: "generating" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function pollUntilDone(jobId: string, model: VideoModel): Promise<string> {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const result = await pollVideo(jobId, model);
    if (result.status === "succeeded" && result.videoUrl) return result.videoUrl;
    if (result.status === "failed") throw new Error(`Video job ${jobId} failed`);
  }
  throw new Error(`Video job ${jobId} timed out`);
}

async function launchWhenReady(
  testId: string,
  jobIdA: string,
  jobIdB: string,
  modelA: VideoModel,
  modelB: VideoModel,
  opts: AdsetOpts
) {
  const [urlA, urlB] = await Promise.all([
    pollUntilDone(jobIdA, modelA),
    pollUntilDone(jobIdB, modelB),
  ]);

  await updateAbTest(testId, {
    video_url_a: urlA,
    video_url_b: urlB,
    status: "launching",
  });

  // Itay's ironclad rule: all Meta campaigns are created PAUSED. The owner
  // activates both adsets in Ads Manager; check-ab-winners then waits until
  // real spend lands before declaring a winner (see the zero-spend guard).
  const campaign = await createCampaign({
    name: `AB Test ${testId.slice(0, 8)}`,
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    accountId: opts.accountId,
  });
  const campaignId = campaign.id;

  const [resultA, resultB] = await Promise.all([
    setupAdset(campaignId, urlA, modelA, opts),
    setupAdset(campaignId, urlB, modelB, opts),
  ]);

  await updateAbTest(testId, {
    campaign_id: campaignId,
    adset_id_a: resultA.adsetId,
    adset_id_b: resultB.adsetId,
    ad_id_a: resultA.adId,
    ad_id_b: resultB.adId,
    status: "running",
  });
}

interface AdsetOpts {
  page_id: string;
  daily_budget: number;
  link: string;
  thumbnail_url?: string;
  pixel_id?: string;
  accountId?: string;
}

async function setupAdset(
  campaignId: string,
  videoUrl: string,
  modelName: string,
  opts: AdsetOpts
) {
  const video = await uploadVideoFromUrl(videoUrl, `abtest-${modelName}`, opts.accountId);
  // Wait for Meta to finish processing before building the creative.
  await waitForVideoReady(video.id);
  const creative = await createVideoCreative({
    name: `Creative-${modelName}`,
    page_id: opts.page_id,
    video_id: video.id,
    thumbnail_url: opts.thumbnail_url || "",
    message: "",
    link: opts.link,
    accountId: opts.accountId,
  });
  // Optimize for purchases when a pixel is supplied (real ROAS A/B); otherwise
  // createAdset falls back to LINK_CLICKS. Bid strategy stays the default
  // LOWEST_COST_WITHOUT_CAP (never Bid Cap).
  const adset = await createAdset({
    name: `Adset-${modelName}`,
    campaign_id: campaignId,
    daily_budget: opts.daily_budget,
    page_id: opts.page_id,
    pixel_id: opts.pixel_id,
    custom_event_type: opts.pixel_id ? "PURCHASE" : undefined,
    status: "PAUSED",
    accountId: opts.accountId,
  });
  const ad = await createAd({
    name: `Ad-${modelName}`,
    adset_id: adset.id,
    creative_id: creative.id,
    status: "PAUSED",
    accountId: opts.accountId,
  });
  return { adsetId: adset.id, adId: ad.id };
}

export async function GET() {
  const { listAbTests } = await import("@/lib/abtests");
  const tests = await listAbTests();
  return NextResponse.json(tests);
}

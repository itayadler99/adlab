import { NextRequest, NextResponse } from "next/server";
import { startVideo } from "@/lib/video";
import { saveAbTest, updateAbTest } from "@/lib/abtests";
import {
  createCampaign,
  createAdset,
  uploadVideoFromUrl,
  createVideoCreative,
  createAd,
} from "@/lib/meta";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      script,
      product_id,
      model_a = "minimax",
      model_b = "kling",
      daily_budget = 1000,
      ad_account_id,
      page_id,
      targeting,
    } = body;

    if (!script || !product_id || !ad_account_id || !page_id) {
      return NextResponse.json(
        { error: "script, product_id, ad_account_id, page_id are required" },
        { status: 400 }
      );
    }

    // Start both video jobs in parallel
    const [jobA, jobB] = await Promise.all([
      startVideo({ model: model_a, script, aspect_ratio: "9:16" }),
      startVideo({ model: model_b, script, aspect_ratio: "9:16" }),
    ]);

    const compareAfter = new Date(Date.now() + FIVE_DAYS_MS).toISOString();

    const test = await saveAbTest({
      script,
      product_id,
      model_a,
      model_b,
      video_job_a: jobA.id,
      video_job_b: jobB.id,
      status: "generating",
      compare_after: compareAfter,
      meta: { daily_budget, ad_account_id, page_id, targeting },
    });

    // Poll for completion and launch async (fire and forget)
    launchWhenReady(test.id, jobA.id, jobB.id, {
      ad_account_id,
      page_id,
      daily_budget,
      targeting,
      model_a,
      model_b,
    }).catch(console.error);

    return NextResponse.json({ id: test.id, status: "generating" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function pollUntilDone(
  jobId: string,
  model: string
): Promise<string> {
  const { pollVideo } = await import("@/lib/video");
  const maxAttempts = 60;
  let attempts = 0;
  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 10000));
    const result = await pollVideo(jobId, model as "minimax" | "kling" | "luma");
    if (result.status === "succeeded" && result.video_url) {
      return result.video_url;
    }
    if (result.status === "failed") {
      throw new Error(`Video job ${jobId} failed`);
    }
    attempts++;
  }
  throw new Error(`Video job ${jobId} timed out`);
}

async function launchWhenReady(
  testId: string,
  jobIdA: string,
  jobIdB: string,
  opts: {
    ad_account_id: string;
    page_id: string;
    daily_budget: number;
    targeting?: unknown;
    model_a: string;
    model_b: string;
  }
) {
  const [urlA, urlB] = await Promise.all([
    pollUntilDone(jobIdA, opts.model_a),
    pollUntilDone(jobIdB, opts.model_b),
  ]);

  await updateAbTest(testId, { video_url_a: urlA, video_url_b: urlB, status: "launching" });

  // Create one campaign for the test
  const campaign = await createCampaign(opts.ad_account_id, {
    name: `AB Test ${testId.slice(0, 8)}`,
    objective: "OUTCOME_SALES",
    status: "ACTIVE",
  });

  const campaignId = campaign.id;

  // Upload videos and create creatives/ads in parallel
  const [resultA, resultB] = await Promise.all([
    setupAdset(opts.ad_account_id, opts.page_id, campaignId, urlA, opts.model_a, opts.daily_budget, opts.targeting),
    setupAdset(opts.ad_account_id, opts.page_id, campaignId, urlB, opts.model_b, opts.daily_budget, opts.targeting),
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

async function setupAdset(
  adAccountId: string,
  pageId: string,
  campaignId: string,
  videoUrl: string,
  modelName: string,
  dailyBudget: number,
  targeting: unknown
) {
  const videoId = await uploadVideoFromUrl(adAccountId, videoUrl);
  const creative = await createVideoCreative(adAccountId, {
    name: `Creative-${modelName}`,
    video_id: videoId,
    page_id: pageId,
    message: "",
  });
  const adset = await createAdset(adAccountId, {
    name: `Adset-${modelName}`,
    campaign_id: campaignId,
    daily_budget: dailyBudget,
    targeting: targeting ?? { age_min: 18, age_max: 65 },
    status: "ACTIVE",
  });
  const ad = await createAd(adAccountId, {
    name: `Ad-${modelName}`,
    adset_id: adset.id,
    creative_id: creative.id,
    status: "ACTIVE",
  });
  return { adsetId: adset.id, adId: ad.id };
}

export async function GET() {
  const { listAbTests } = await import("@/lib/abtests");
  const tests = await listAbTests();
  return NextResponse.json(tests);
}

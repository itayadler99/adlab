import { NextRequest, NextResponse } from "next/server";
import { startVideo, pollVideo, type VideoModel } from "@/lib/video";
import { saveAbTest, updateAbTest } from "@/lib/abtests";
import {
  createCampaign,
  createAdset,
  uploadVideoFromUrl,
  createVideoCreative,
  createAd,
} from "@/lib/meta";

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

function normModel(m: string): VideoModel {
  if (m === "kling" || m === "kling-1.6") return "kling-1.6";
  if (m === "sora-2") return "sora-2";
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
      page_id,
      link,
      thumbnail_url,
    } = body;

    if (!script || !product_id || !page_id || !link) {
      return NextResponse.json(
        { error: "script, product_id, page_id, link required" },
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
      meta: { daily_budget, page_id, link, thumbnail_url },
    });

    launchWhenReady(test.id, jobA.id, jobB.id, ma, mb, {
      page_id,
      daily_budget,
      link,
      thumbnail_url,
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
  opts: { page_id: string; daily_budget: number; link: string; thumbnail_url?: string }
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

  const campaign = await createCampaign({
    name: `AB Test ${testId.slice(0, 8)}`,
    objective: "OUTCOME_SALES",
    status: "ACTIVE",
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

async function setupAdset(
  campaignId: string,
  videoUrl: string,
  modelName: string,
  opts: { page_id: string; daily_budget: number; link: string; thumbnail_url?: string }
) {
  const video = await uploadVideoFromUrl(videoUrl, `abtest-${modelName}`);
  const creative = await createVideoCreative({
    name: `Creative-${modelName}`,
    page_id: opts.page_id,
    video_id: video.id,
    thumbnail_url: opts.thumbnail_url || "",
    message: "",
    link: opts.link,
  });
  const adset = await createAdset({
    name: `Adset-${modelName}`,
    campaign_id: campaignId,
    daily_budget: opts.daily_budget,
    page_id: opts.page_id,
    status: "ACTIVE",
  });
  const ad = await createAd({
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

// Autopilot orchestrator: competitor URL -> winning ad -> matched product -> generated video + copy
import { resolveFbPage, scrapeAdLibrary, type ApifyAd } from "./apify";
import { anthropic, writeAdScript, writeHeadlines } from "./anthropic";
import { startVideoSequence, type VideoModel } from "./video";
// VideoModel re-exported for callers
import { getProducts, productUrl, type ShopProduct } from "./shopify";
import { startSalesImages } from "./images";
import { getVideoDurationSec } from "./video-meta";
import { shouldUseShowcase, type ShowcaseInputs } from "./showcase";

export type AutopilotMode = "video" | "ugc" | "showcase";

export interface AutopilotResult {
  competitorPageName?: string;
  winningAdId?: string;
  winningAdSummary: string;
  winningAdHook: string;
  winningAdStyle: AdStyle;
  winningAdThemes: string[];
  product: { id?: string; title: string; description: string; link: string; imageUrl?: string };
  script: string;
  visualPrompt: string;
  cta: string;
  headlines: string[];
  bodyCopy: string;
  mode: AutopilotMode;
  // Video pipeline (mode = "video")
  videoJobId?: string; // first clip — kept for backward compat
  videoJobIds?: string[]; // full sequence (1..N clips)
  videoClipSeconds?: number;
  videoTotalSeconds?: number;
  videoModel?: VideoModel;
  // UGC pipeline (mode = "ugc")
  ugcInputs?: {
    productTitle: string;
    productDescription?: string;
    productImageUrl: string;
    script: string;
    hook: string;
    style: AdStyle;
    language: "en" | "he";
    demographic?: string;
    voiceArchetype?: string;
  };
  // Showcase pipeline (mode = "showcase")
  showcaseInputs?: ShowcaseInputs;
  imageJobIds: string[]; // sales static images (Ideogram v2)
  thumbnailUrl?: string;
  dailyBudget: number;
}

export interface ResolvedCompetitor {
  adLibraryPageId?: string; // page id usable in FB Ad Library view_all_page_id (rare — usually different from real pageId)
  facebookPageUrl?: string; // e.g. https://www.facebook.com/icecartel/  — used to look up pageAdLibrary.id
  brand: string;
  isAdLibraryUrl: boolean;
}

export function resolveCompetitor(input: string): ResolvedCompetitor {
  const trimmed = input.trim();
  // 1. Ad Library URL with view_all_page_id
  if (/facebook\.com\/ads\/library/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const pid = u.searchParams.get("view_all_page_id") || undefined;
      return {
        adLibraryPageId: pid,
        brand: pid || u.searchParams.get("q") || trimmed,
        isAdLibraryUrl: true,
      };
    } catch {
      return { brand: trimmed, isAdLibraryUrl: true };
    }
  }
  // 2. Facebook page URL: https://facebook.com/<slug>
  if (/facebook\.com\//i.test(trimmed)) {
    return { facebookPageUrl: trimmed, brand: trimmed, isAdLibraryUrl: false };
  }
  // 3. Full URL -> use hostname slug to guess FB page
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const host = u.hostname.replace(/^www\./, "");
      const slug = host.split(".")[0];
      return {
        facebookPageUrl: `https://www.facebook.com/${encodeURIComponent(slug)}/`,
        brand: slug,
        isAdLibraryUrl: false,
      };
    } catch {
      return { brand: trimmed, isAdLibraryUrl: false };
    }
  }
  // 4. Bare domain
  if (/^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(trimmed)) {
    const slug = trimmed.replace(/^www\./, "").split(".")[0];
    return {
      facebookPageUrl: `https://www.facebook.com/${encodeURIComponent(slug)}/`,
      brand: slug,
      isAdLibraryUrl: false,
    };
  }
  // 5. Plain brand name -> guess FB slug
  const slug = trimmed.toLowerCase().replace(/\s+/g, "");
  return {
    facebookPageUrl: `https://www.facebook.com/${encodeURIComponent(slug)}/`,
    brand: trimmed,
    isAdLibraryUrl: false,
  };
}

interface ScoredAd extends ApifyAd {
  _score: number;
}

export function scoreAds(ads: ApifyAd[]): ScoredAd[] {
  const now = Date.now();
  // Count duplicate body texts (variants)
  const bodyCounts = new Map<string, number>();
  for (const ad of ads) {
    const body = ad.snapshot?.body?.trim().slice(0, 120);
    if (body) bodyCounts.set(body, (bodyCounts.get(body) || 0) + 1);
  }

  const scored: ScoredAd[] = ads.map((ad) => {
    let score = 0;
    // Days running
    const start = ad.startDate ? new Date(ad.startDate).getTime() : 0;
    const end = ad.endDate ? new Date(ad.endDate).getTime() : now;
    if (start) {
      const days = Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
      score += Math.min(100, days * 2);
    }
    // Has video
    if (ad.snapshot?.videos && ad.snapshot.videos.length > 0) score += 20;
    // Has any creative (body or visual)
    if (ad.snapshot?.body || (ad.snapshot?.images?.length ?? 0) > 0) score += 5;
    // Variants
    const body = ad.snapshot?.body?.trim().slice(0, 120);
    if (body) {
      const variants = bodyCounts.get(body) || 1;
      if (variants > 1) score += 30 * Math.min(3, variants);
    }
    // Cross-platform
    if (Array.isArray(ad.publisherPlatform) && ad.publisherPlatform.length > 1) score += 15;
    // Active right now bonus
    if (ad.isActive) score += 10;
    return { ...ad, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const ALLOWED_MEDIA: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

async function analyzeImage(imageUrl: string, prompt: string): Promise<string> {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return "";
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const rawCt = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    // Reject non-image content (CDN error pages, html, etc.)
    const media_type: ImageMediaType = ALLOWED_MEDIA.includes(rawCt as ImageMediaType)
      ? (rawCt as ImageMediaType)
      : "image/jpeg";
    if (!ALLOWED_MEDIA.includes(rawCt as ImageMediaType) && !rawCt.startsWith("image/")) {
      return "";
    }
    const b64 = buf.toString("base64");
    const res = await anthropic().messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type, data: b64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : "";
  } catch {
    return "";
  }
}

export type AdStyle = "ugc_review" | "yapping" | "founder_pov" | "demo";

export interface WinnerAnalysis {
  summary: string;
  hook: string;
  style: AdStyle;
  body_themes: string[];
  /** Free-text character description (e.g. "Black male rapper, late 20s, gold chain"). */
  character?: string;
  /** Voice archetype hint (e.g. "rapper_male", "young_woman_excited"). */
  voiceArchetype?: string;
  thumbnailUrl?: string;
}

export async function analyzeWinner(ad: ApifyAd): Promise<WinnerAnalysis> {
  const body = ad.snapshot?.body || "";
  const title = ad.snapshot?.title || "";
  const thumbnailUrl = ad.snapshot?.videos?.[0]?.thumbnailUrl || ad.snapshot?.images?.[0]?.originalImageUrl;

  let visualDescription = "";
  if (thumbnailUrl) {
    visualDescription = await analyzeImage(
      thumbnailUrl,
      "Describe this ad thumbnail in 1-2 sentences. Focus on: who is in it, what setting, what visual style (UGC selfie, polished demo, lifestyle, etc.)."
    );
  }

  const sys = `You analyze winning Meta ads. Output strict JSON only:
{"summary": "1-2 sentences what this ad is selling and why it works",
 "hook": "the opening line/visual hook in <=12 words",
 "style": "ugc_review" | "yapping" | "founder_pov" | "demo",
 "body_themes": ["3-6 short keyword themes from the body copy"],
 "character": "free-text description of the on-camera person — gender, ethnicity, age range, vibe, distinctive items (chain, cap, makeup, outfit). Empty string if no person on camera.",
 "voiceArchetype": "one of: rapper_male | rapper_female | young_woman_excited | young_woman_chill | young_man_hype | young_man_casual | founder_male | founder_female | mom_warm | british_male | british_female | narrator_neutral"}

Style definitions:
- ugc_review: real person holding/reviewing product, selfie cam
- yapping: fast talking head selfie, hook mid-sentence, raw vibe
- founder_pov: brand owner explaining, polished but personal
- demo: product close-up, motion, no face

voiceArchetype guide: pick the voice that would sound like the on-camera character. If the character is a Black rapper with a chain → rapper_male. Yapping 22-year-old girl in a car → young_woman_excited. Calm mother → mom_warm. No face / pure demo → narrator_neutral.`;

  const user = `Ad title: ${title}
Ad body: ${body}
Visual: ${visualDescription || "(unknown)"}`;

  const res = await anthropic().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 800,
    system: sys,
    messages: [{ role: "user", content: user }],
  });
  const textBlock = res.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    return {
      summary: body.slice(0, 200) || title || "Unknown ad",
      hook: title || body.slice(0, 60),
      style: "ugc_review",
      body_themes: [],
      thumbnailUrl,
    };
  }
  const parsed = JSON.parse(m[0]) as {
    summary: string;
    hook: string;
    style: AdStyle;
    body_themes: string[];
    character?: string;
    voiceArchetype?: string;
  };
  return { ...parsed, thumbnailUrl };
}

export async function pickProduct(themes: string[]): Promise<{ id?: string; title: string; description: string; link: string; imageUrl?: string }> {
  const fallback = {
    title: "Montier Jewelry",
    description: "Lab-grown moissanite jewelry with lifetime warranty.",
    link: process.env.LINK_MONTIER_US || "https://montierjewelry.com",
  };
  try {
    const { products } = await getProducts(50);
    if (!products || products.length === 0) return fallback;
    const themeWords = themes.flatMap((t) => t.toLowerCase().split(/[\s,]+/)).filter((w) => w.length > 2);
    let bestProduct: ShopProduct | undefined;
    let bestScore = 0;
    for (const p of products) {
      const titleLower = p.title.toLowerCase();
      let score = 0;
      for (const w of themeWords) {
        if (titleLower.includes(w)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestProduct = p;
      }
    }
    if (!bestProduct) bestProduct = products[0];
    return {
      id: String(bestProduct.id),
      title: bestProduct.title,
      description: bestProduct.title,
      link: productUrl(bestProduct.handle),
      imageUrl: bestProduct.image?.src,
    };
  } catch {
    return fallback;
  }
}

export interface RunAutopilotInput {
  competitorInput: string;
  dailyBudget?: number;
  videoModel?: VideoModel;
  videoDuration?: number;
  /** "auto" picks UGC for ugc_review/yapping styles, otherwise plain video. */
  mode?: "auto" | "video" | "ugc" | "showcase";
  language?: "en" | "he";
}

export async function runAutopilot(input: RunAutopilotInput): Promise<AutopilotResult> {
  const dailyBudget = input.dailyBudget ?? 100;
  const resolved = resolveCompetitor(input.competitorInput);

  // Step 1: resolve to a pageAdLibrary id (the id Ad Library URLs actually use).
  let pageAdLibraryId = resolved.adLibraryPageId;
  let competitorName: string | undefined;
  if (!pageAdLibraryId && resolved.facebookPageUrl) {
    const page = await resolveFbPage({ url: resolved.facebookPageUrl }, 120_000);
    if (page) {
      pageAdLibraryId = page.pageAdLibraryId || page.pageId;
      competitorName = page.name;
      if (!page.isCurrentlyRunningAds && !pageAdLibraryId) {
        throw new Error(`'${page.name || resolved.brand}' לא מריץ מודעות כרגע בפייסבוק`);
      }
    }
  }
  if (!pageAdLibraryId) {
    throw new Error(
      "לא הצלחתי לזהות את עמוד הפייסבוק של המתחרה. נסה להדביק כתובת ספריית מודעות ישירות (Ad Library) עם view_all_page_id"
    );
  }

  // Step 2: scrape ads
  const ads = await scrapeAdLibrary({ pageAdLibraryId, country: "US", maxResults: 30 }, 240_000);
  if (!ads || ads.length === 0) {
    throw new Error(`'${competitorName || resolved.brand}' אין מודעות פעילות ב-US`);
  }

  const scored = scoreAds(ads);
  // Prefer top-scored ad that has a video; fall back to top-scored
  const winner = scored.find((a) => a.snapshot?.videos && a.snapshot.videos.length > 0) || scored[0];

  const analysis = await analyzeWinner(winner);
  const product = await pickProduct(analysis.body_themes);

  const scriptOut = await writeAdScript({
    productTitle: product.title,
    productDescription: product.description,
    style: analysis.style,
    duration: 15,
  });

  // Decide mode:
  // - Explicit override always wins.
  // - "auto": UGC for ugc_review/yapping with a product image, showcase for
  //   product-focused styles (demo / small-wearable founder_pov), else plain video.
  const requestedMode = input.mode ?? "auto";
  const wantsShowcase = shouldUseShowcase({
    hasProductImage: Boolean(product.imageUrl),
    style: analysis.style,
    productTitle: product.title,
  });
  const mode: AutopilotMode =
    requestedMode === "ugc"
      ? "ugc"
      : requestedMode === "video"
        ? "video"
        : requestedMode === "showcase"
          ? "showcase"
          : (analysis.style === "ugc_review" || analysis.style === "yapping") && product.imageUrl
            ? "ugc"
            : wantsShowcase
              ? "showcase"
              : "video";

  // Video pipeline (skipped in UGC mode)
  let videoJobId: string | undefined;
  let videoJobIds: string[] | undefined;
  let videoClipSeconds: number | undefined;
  let videoTotalSeconds: number | undefined;
  let chosenModel: VideoModel | undefined;
  if (mode === "video") {
    console.log("[autopilot] mode=video, style=", analysis.style, "product.imageUrl=", !!product.imageUrl);
    // Resolve duration: explicit user value > probed winner duration > 15s fallback.
    let chosenDuration = input.videoDuration && input.videoDuration > 0 ? input.videoDuration : undefined;
    if (!chosenDuration) {
      const winnerVideoUrl =
        winner.snapshot?.videos?.[0]?.videoHdUrl || winner.snapshot?.videos?.[0]?.videoSdUrl;
      if (winnerVideoUrl) {
        console.log("[autopilot] probing winner duration:", winnerVideoUrl.slice(0, 80));
        try {
          const detected = await getVideoDurationSec(winnerVideoUrl);
          if (detected) chosenDuration = Math.round(Math.min(60, Math.max(5, detected)));
          console.log("[autopilot] detected duration:", detected, "→ chosenDuration:", chosenDuration);
        } catch (e) {
          console.warn("[autopilot] duration probe failed:", e instanceof Error ? e.message : e);
        }
      }
      chosenDuration = chosenDuration ?? 15;
    }
    // Model picking strategy V2:
    // - With product image: image-to-video MANDATORY (text-to-video invents jewelry).
    // - Default to Seedance 1 Pro on Replicate: 1080p, 10s native (no stitching),
    //   first-frame anchoring, no FAL gating to deal with. User has Replicate credit.
    // - Veo 3.1 Fast i2v on FAL is the upgrade path if it accepts the request
    //   (currently the only frontier FAL model not gated for this account).
    const hasProductImg = Boolean(product.imageUrl);
    if (input.videoModel) {
      chosenModel = input.videoModel;
      // Promote text-only models to their i2v variants when we have a product image.
      if (hasProductImg) {
        if (chosenModel === "veo-3.1-fast") chosenModel = "veo-3.1-fast-i2v";
        else if (chosenModel === "veo-3.1") chosenModel = "veo-3.1-i2v";
        else if (chosenModel === "kling-3.0") chosenModel = "kling-3.0-i2v";
        else if (chosenModel === "seedance-2.0") chosenModel = "seedance-1.0";
      }
    } else if (hasProductImg) {
      // Auto pick by duration. Seedance 1 Pro is the best accessible i2v for this
      // account: 1080p, 10s native single clip for ≤10s ads.
      if (chosenDuration <= 8) {
        // Veo 3.1 Fast i2v is sharper but capped at 8s — prefer it for short ads.
        chosenModel = "veo-3.1-fast-i2v";
      } else if (chosenDuration <= 10) {
        chosenModel = "seedance-1.0"; // Replicate, image input supported, 10s
      } else {
        // Longer than any single-clip native: use Seedance and stitch.
        chosenModel = "seedance-1.0";
      }
    } else if (chosenDuration <= 8) {
      chosenModel = "veo-3.1-fast";
    } else if (chosenDuration <= 10) {
      chosenModel = "sora-2-pro"; // Replicate text-to-video, top realism for non-product hero shots
    } else {
      chosenModel = "kling-3.0";
    }
    // Strengthen the prompt with the explicit product name so models that
    // partially honor the seed image still keep the same item.
    const productAnchor = hasProductImg
      ? `\n\nThe single product visible in the video is the EXACT item shown in the reference image: ${product.title}. Do not invent or substitute jewelry. Hold the camera close enough that the product reads clearly.`
      : "";
    console.log("[autopilot] starting video sequence: model=", chosenModel, "duration=", chosenDuration, "i2v=", hasProductImg);
    const sequence = await startVideoSequence(
      scriptOut.visual_prompt + productAnchor,
      chosenModel,
      chosenDuration,
      {
        aspectRatio: "9:16",
        resolution: "1080p",
        ...(hasProductImg ? { imageUrl: product.imageUrl } : {}),
      }
    );
    videoJobId = sequence.jobs[0].id;
    videoJobIds = sequence.jobs.map((j) => j.id);
    videoClipSeconds = sequence.clipSeconds;
    videoTotalSeconds = sequence.totalSeconds;
    chosenModel = sequence.model;
  }

  const headlinesOut = await writeHeadlines({
    productTitle: product.title,
    productDescription: product.description,
    language: "en",
  });

  // Build short bullet points for the static sales images.
  // Pull from themes when available; fall back to evergreen jewelry USPs.
  const bullets = (analysis.body_themes && analysis.body_themes.length > 0
    ? analysis.body_themes
    : [
        "Lifetime warranty",
        "Conflict-free moissanite",
        "Free worldwide shipping",
        "30-day returns",
      ]
  ).slice(0, 4);

  // Fire off 3 sales static images in parallel — don't block on failure.
  let imageJobIds: string[] = [];
  try {
    const imageJobs = await startSalesImages(
      {
        productTitle: product.title,
        productDescription: product.description,
        hook: analysis.hook,
        bullets,
        brand: "Montier",
      },
      3
    );
    imageJobIds = imageJobs.map((j) => j.id);
  } catch (e) {
    // Don't fail the whole run if image gen fails
    console.error("startSalesImages failed:", e);
  }

  // Body copy: simple template referencing winning hook
  const bodyCopy = `${analysis.hook}\n\n${product.title} — ${product.description}\n\nShop now: ${product.link}`;

  const ugcInputs =
    mode === "ugc" && product.imageUrl
      ? {
          productTitle: product.title,
          productDescription: product.description,
          productImageUrl: product.imageUrl,
          script: scriptOut.script,
          hook: analysis.hook,
          style: analysis.style,
          language: input.language ?? "en",
          demographic: analysis.character || undefined,
          voiceArchetype: analysis.voiceArchetype || undefined,
        }
      : undefined;

  const showcaseInputs: ShowcaseInputs | undefined =
    mode === "showcase" && product.imageUrl
      ? {
          productTitle: product.title,
          productImageUrl: product.imageUrl,
          hook: analysis.hook,
          // Seedance 1 Pro native max is 10s; longer ads get stitched downstream.
          durationSec: Math.min(10, Math.max(5, input.videoDuration ?? 10)),
        }
      : undefined;

  return {
    competitorPageName: winner.pageName || competitorName,
    winningAdId: winner.adArchiveId,
    winningAdSummary: analysis.summary,
    winningAdHook: analysis.hook,
    winningAdStyle: analysis.style,
    winningAdThemes: analysis.body_themes,
    product,
    script: scriptOut.script,
    visualPrompt: scriptOut.visual_prompt,
    cta: scriptOut.cta,
    headlines: headlinesOut.headlines,
    bodyCopy,
    mode,
    videoJobId,
    videoJobIds,
    videoClipSeconds,
    videoTotalSeconds,
    videoModel: chosenModel,
    ugcInputs,
    showcaseInputs,
    imageJobIds,
    thumbnailUrl: analysis.thumbnailUrl,
    dailyBudget,
  };
}

// Autopilot orchestrator: competitor URL -> winning ad -> matched product -> generated video + copy
import { resolveFbPage, scrapeAdLibrary, type ApifyAd } from "./apify";
import { anthropic, writeAdScript, writeHeadlines } from "./anthropic";
import { startVideoSequence, type VideoModel } from "./video";
// VideoModel re-exported for callers
import { getProducts, getProductImages, productUrl, type ShopProduct } from "./shopify";
import { pickGalleryReferences } from "./product-gallery-picker";
import { startSalesImages } from "./images";
import { getVideoDurationSec } from "./video-meta";
import { shouldUseShowcase, type ShowcaseInputs } from "./showcase";
import { analyzeWinnerDeep, matchProductToWinner, type WinnerStoryboard } from "./winner-deep-analysis";

export type AutopilotMode = "video" | "ugc" | "showcase";

export interface AutopilotResult {
  competitorPageName?: string;
  winningAdId?: string;
  winningAdSummary: string;
  winningAdHook: string;
  winningAdStyle: AdStyle;
  winningAdThemes: string[];
  product: {
    id?: string;
    title: string;
    description: string;
    link: string;
    imageUrl?: string;
    /** Vision-ranked clean reference shots from the Shopify gallery (best-first). */
    referenceImageUrls?: string[];
    /** Cleanest macro / single-item shot. Used as the i2v start anchor. */
    primaryReferenceUrl?: string;
  };
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
  // Source-of-truth surfacing — what we actually saw on the competitor's side,
  // so the user can compare side-by-side with what we generate.
  winningAdVideoUrl?: string;
  winningAdDurationSec?: number;
  storyboard?: {
    sceneDescription: string;
    characterDescription: string;
    shotList: string;
    cameraMotion: string;
    productType: string;
    hasPerson: boolean;
    approxDurationSec: number;
    frameUrls: string[];
  };
}

export interface ResolvedCompetitor {
  adLibraryPageId?: string; // page id usable in FB Ad Library view_all_page_id (rare — usually different from real pageId)
  facebookPageUrl?: string; // e.g. https://www.facebook.com/icecartel/  — used to look up pageAdLibrary.id
  /**
   * When the user pasted a single-ad permalink (`...?id=XXXX`), we scrape
   * ONLY that ad and skip scoring. This is the "clone this specific ad"
   * path — the auto-scoring path was burning days picking wrong winners.
   */
  singleAdArchiveId?: string;
  brand: string;
  isAdLibraryUrl: boolean;
}

export function resolveCompetitor(input: string): ResolvedCompetitor {
  const trimmed = input.trim();
  // 1. Ad Library URL — could be single-ad `?id=` or full-page `?view_all_page_id=`.
  if (/facebook\.com\/ads\/library/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const singleId = u.searchParams.get("id") || undefined;
      const pid = u.searchParams.get("view_all_page_id") || undefined;
      // Single-ad permalink wins. `id` param is the ad archive id; `view_all_page_id` may be absent.
      if (singleId) {
        return {
          singleAdArchiveId: singleId,
          adLibraryPageId: pid,
          brand: pid || singleId,
          isAdLibraryUrl: true,
        };
      }
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
  /** Short description of the winner's visual scene — surface, light, mood, framing. Drives showcase hero scene. */
  visualScene?: string;
  thumbnailUrl?: string;
}

export async function analyzeWinner(ad: ApifyAd): Promise<WinnerAnalysis> {
  const body = ad.snapshot?.body || "";
  const title = ad.snapshot?.title || "";
  const thumbnailUrl = ad.snapshot?.videos?.[0]?.thumbnailUrl || ad.snapshot?.images?.[0]?.originalImageUrl;

  let visualDescription = "";
  let visualScene = "";
  if (thumbnailUrl) {
    visualDescription = await analyzeImage(
      thumbnailUrl,
      "Describe this ad thumbnail in 1-2 sentences. Focus on: who is in it, what setting, what visual style (UGC selfie, polished demo, lifestyle, etc.)."
    );
    // Extract a concrete scene direction we can paste into a hero compositor.
    // Phrase as a short scene description, not a sentence about the ad.
    visualScene = await analyzeImage(
      thumbnailUrl,
      "Describe the visual scene of this ad in ONE short phrase (max 18 words) that another image-gen model can replicate. Focus on: surface/background, lighting style, color palette, framing, mood. Example outputs: 'gritty neon-lit street at night, low angle, harsh shadows, red and teal palette' or 'sunlit marble countertop, soft window light, warm cream tones, top-down framing'. Do NOT mention the product itself, brand names, text, or people."
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
      visualScene: visualScene || undefined,
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
  return { ...parsed, visualScene: visualScene || undefined, thumbnailUrl };
}

export async function pickProduct(
  themes: string[],
  opts?: { winnerProductType?: string }
): Promise<{
  id?: string;
  title: string;
  description: string;
  link: string;
  imageUrl?: string;
  referenceImageUrls?: string[];
  primaryReferenceUrl?: string;
}> {
  const fallback = {
    title: "Montier Jewelry",
    description: "Lab-grown moissanite jewelry with lifetime warranty.",
    link: process.env.LINK_MONTIER_US || "https://montierjewelry.com",
  };

  // Run the gallery picker after we know which product won. Storefront main
  // images often show a model wearing 5 stacked Cubans; ranking the full
  // gallery gives us clean single-item shots so the i2v doesn't hallucinate
  // an extra clasp or chain count.
  async function enrichGallery(productId: number | string, productTitle: string, mainImageUrl?: string) {
    try {
      const gallery = await getProductImages(productId);
      if (gallery.length === 0) {
        return { referenceImageUrls: mainImageUrl ? [mainImageUrl] : undefined, primaryReferenceUrl: mainImageUrl };
      }
      const picked = await pickGalleryReferences(gallery, productTitle, 3);
      return {
        referenceImageUrls: picked.references.length > 0 ? picked.references : undefined,
        primaryReferenceUrl: picked.primary || mainImageUrl,
      };
    } catch (e) {
      console.warn("[pickProduct] gallery enrichment failed:", e instanceof Error ? e.message : e);
      return { referenceImageUrls: mainImageUrl ? [mainImageUrl] : undefined, primaryReferenceUrl: mainImageUrl };
    }
  }

  try {
    const { products } = await getProducts(50);
    if (!products || products.length === 0) return fallback;

    // Preferred path: semantic match against the winner's actual product type.
    // This stops the orchestrator from locking onto the first "diamond"
    // product on every run when the winner is selling a chain or ring.
    if (opts?.winnerProductType) {
      const matchId = await matchProductToWinner({
        productType: opts.winnerProductType,
        catalog: products.map((p) => ({ id: String(p.id), title: p.title })),
      });
      if (matchId) {
        const matched = products.find((p) => String(p.id) === matchId);
        if (matched) {
          const gallery = await enrichGallery(matched.id, matched.title, matched.image?.src);
          return {
            id: String(matched.id),
            title: matched.title,
            description: matched.title,
            link: productUrl(matched.handle),
            imageUrl: gallery.primaryReferenceUrl || matched.image?.src,
            ...gallery,
          };
        }
      }
    }

    // Fallback: theme-keyword overlap, original behavior.
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
    const gallery = await enrichGallery(bestProduct.id, bestProduct.title, bestProduct.image?.src);
    return {
      id: String(bestProduct.id),
      title: bestProduct.title,
      description: bestProduct.title,
      link: productUrl(bestProduct.handle),
      imageUrl: gallery.primaryReferenceUrl || bestProduct.image?.src,
      ...gallery,
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

  let competitorName: string | undefined;
  let ads: ApifyAd[];
  let winner: ApifyAd;

  if (resolved.singleAdArchiveId) {
    // Single-ad clone path. User pasted a specific ad permalink — scrape
    // a wider set then filter to the exact archive id. The Apify actor
    // sometimes ignores the `?id=` query and returns the page's full ad set,
    // so `maxResults:1` could grab a random ad. We pull more and filter.
    const directUrl = `https://www.facebook.com/ads/library/?id=${encodeURIComponent(
      resolved.singleAdArchiveId
    )}`;
    ads = await scrapeAdLibrary({ searchUrl: directUrl, country: "US", maxResults: 30 }, 240_000);
    const exact = ads.find((a) => a.adArchiveId === resolved.singleAdArchiveId);
    if (!exact) {
      throw new Error(
        `לא הצלחתי לטעון את המודעה ${resolved.singleAdArchiveId}. בדוק שהקישור תקין ושהמודעה עדיין באוויר.`
      );
    }
    winner = exact;
    competitorName = winner.pageName;
  } else {
    // Page-level path. Resolve pageAdLibraryId, scrape top-N, pick by score.
    let pageAdLibraryId = resolved.adLibraryPageId;
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

    ads = await scrapeAdLibrary({ pageAdLibraryId, country: "US", maxResults: 30 }, 240_000);
    if (!ads || ads.length === 0) {
      throw new Error(`'${competitorName || resolved.brand}' אין מודעות פעילות ב-US`);
    }

    const scored = scoreAds(ads);
    winner = scored.find((a) => a.snapshot?.videos && a.snapshot.videos.length > 0) || scored[0];
  }

  // Two parallel passes on the winner:
  //   - analyzeWinner: text/single-thumbnail vibe + style classification.
  //   - analyzeWinnerDeep: multi-frame storyboard, character, palette,
  //     camera motion, product type. This is what makes the generated ad
  //     resemble the competitor — not just inherit its hook.
  const [analysis, storyboard] = await Promise.all([
    analyzeWinner(winner),
    analyzeWinnerDeep(winner),
  ]);

  // Merge: storyboard's scene takes priority over thumbnail's single-line
  // visualScene (deeper analysis), and we forward storyboard's character
  // when single-thumb analysis missed it.
  if (storyboard.sceneDescription && !analysis.visualScene) {
    analysis.visualScene = storyboard.sceneDescription;
  } else if (storyboard.sceneDescription) {
    analysis.visualScene = storyboard.sceneDescription;
  }
  if (storyboard.characterDescription && !analysis.character) {
    analysis.character = storyboard.characterDescription;
  }

  const product = await pickProduct(analysis.body_themes, {
    winnerProductType: storyboard.productType,
  });

  // Probe the winner's real video duration via FAL ffmpeg so we route + clamp
  // off ground truth, not just the LLM's storyboard estimate. Probe BOTH HD
  // and SD URLs — Meta's CDN sometimes blocks one. If both probes fail and
  // the ad has a video at all, fall back to a 20s default (typical Meta
  // creative length) so we don't collapse to a 5s clip.
  const winnerHd = winner.snapshot?.videos?.[0]?.videoHdUrl || "";
  const winnerSd = winner.snapshot?.videos?.[0]?.videoSdUrl || "";
  const winnerVideoUrl = winnerHd || winnerSd;
  let probedDuration = 0;
  if (winnerHd) {
    try {
      const p = await getVideoDurationSec(winnerHd);
      if (p && p > 0) probedDuration = Math.round(p);
    } catch {}
  }
  if (!probedDuration && winnerSd) {
    try {
      const p = await getVideoDurationSec(winnerSd);
      if (p && p > 0) probedDuration = Math.round(p);
    } catch {}
  }
  if (probedDuration > 0) {
    storyboard.approxDurationSec = probedDuration;
  } else if (winnerVideoUrl && storyboard.approxDurationSec === 0) {
    // We know it's a video ad but probe failed — assume 20s so routing
    // doesn't crush to a single 5-10s clip. Honest about being a guess.
    storyboard.approxDurationSec = 20;
  }
  console.log("[autopilot] winner duration probed=", probedDuration,
    "storyboard.approxDurationSec=", storyboard.approxDurationSec,
    "hd?", !!winnerHd, "sd?", !!winnerSd);

  const scriptOut = await writeAdScript({
    productTitle: product.title,
    productDescription: product.description,
    style: analysis.style,
    duration: 15,
  });

  // Decide mode.
  // Honesty constraint: a 39s actor-driven ad cannot be cloned faithfully
  // — UGC tops at 10s single-clip, and video stitched is product-only
  // (i2v anchored to product image, not the actor). Pick the least-lossy
  // option for each case and surface the choice on the result.
  //
  //   ugc / showcase explicit → honor caller.
  //   auto + has person + product image:
  //       - source ≤ 12s → UGC (actor + product fusion, single clip)
  //       - source > 12s → video sequence (loses actor but honors duration)
  //   auto + no person + product image → video sequence (product-only).
  //   auto + no product image → video sequence (t2v).
  const requestedMode = input.mode ?? "auto";
  const longWinner = storyboard.approxDurationSec > 12 || (input.videoDuration ?? 0) > 12;
  const mode: AutopilotMode =
    requestedMode === "ugc"
      ? "ugc"
      : requestedMode === "showcase"
        ? "showcase"
        : requestedMode === "video"
          ? "video"
          : storyboard.hasPerson && product.imageUrl && !longWinner
            ? "ugc"
            : "video";

  // Video pipeline (skipped in UGC mode)
  let videoJobId: string | undefined;
  let videoJobIds: string[] | undefined;
  let videoClipSeconds: number | undefined;
  let videoTotalSeconds: number | undefined;
  let chosenModel: VideoModel | undefined;
  if (mode === "video") {
    console.log("[autopilot] mode=video, style=", analysis.style, "product.imageUrl=", !!product.imageUrl);
    // Resolve duration: explicit user value > probed winner duration >
    // storyboard estimate > 15s fallback.
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
      if (!chosenDuration && storyboard.approxDurationSec > 0) {
        chosenDuration = Math.min(60, Math.max(5, storyboard.approxDurationSec));
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
    // Identity-lock language: stop the model from inventing a fake clasp,
    // adding extra chains, or merging multiple items into one piece — these
    // are the exact failure modes user flagged (e.g. Ice Cartel "4 chains
    // joined with a clasp that doesn't exist").
    const productAnchor = hasProductImg
      ? `\n\nThe single product visible in the video is the EXACT item shown in the reference image: ${product.title}. Identity lock: do not invent or substitute jewelry, do not change the clasp shape, do not add a second chain or extra rings, do not stack multiple pieces. Render exactly ONE item — the one in the seed frame — from start to finish. Hold the camera close enough that the product reads clearly.`
      : "";
    // Inject the winner ad's visual scene so the generation actually mirrors the
    // competitor's look (lighting, backdrop, mood) instead of defaulting to a
    // generic product-on-white shot. Empty when winner has no thumbnail.
    const sceneAnchor = analysis.visualScene
      ? `\n\nReplicate this visual scene from the reference creative: ${analysis.visualScene}. Match the lighting style, palette, and framing — but keep the product the exact item above.`
      : "";
    console.log("[autopilot] starting video sequence: model=", chosenModel, "duration=", chosenDuration, "i2v=", hasProductImg);
    const sequence = await startVideoSequence(
      scriptOut.visual_prompt + sceneAnchor + productAnchor,
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
        productImageUrl: product.imageUrl,
        hasText: true,
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

  // For UGC mode, build a richer script that bakes in the winner's shot list +
  // camera motion so the lipsync video actually mirrors competitor cuts and
  // staging, not the default "talking head on white" template.
  const ugcScript = storyboard.shotList
    ? `${scriptOut.script}\n\n--- Shot list (replicate from winning ad) ---\n${storyboard.shotList}\n\nCamera: ${storyboard.cameraMotion || "match the reference cuts"}.`
    : scriptOut.script;

  const ugcInputs =
    mode === "ugc" && product.imageUrl
      ? {
          productTitle: product.title,
          productDescription: product.description,
          productImageUrl: product.imageUrl,
          script: ugcScript,
          hook: analysis.hook,
          style: analysis.style,
          language: input.language ?? "en",
          demographic: analysis.character || undefined,
          setting: storyboard.sceneDescription || undefined,
          voiceArchetype: analysis.voiceArchetype || undefined,
        }
      : undefined;

  // Showcase clip length: each sub-clip is capped at 10s by every i2v model
  // we use. Total ad length comes from the winner — UI stitches multiple
  // sub-clips downstream for longer totals.
  const showcaseClipSec = 10;
  const showcaseTotalSec = Math.min(
    60,
    Math.max(
      5,
      input.videoDuration && input.videoDuration > 0
        ? input.videoDuration
        : storyboard.approxDurationSec > 0
          ? storyboard.approxDurationSec
          : 10
    )
  );

  const showcaseInputs: ShowcaseInputs | undefined =
    mode === "showcase" && product.imageUrl
      ? {
          productTitle: product.title,
          productImageUrl: product.imageUrl,
          hook: analysis.hook,
          // Borrow the winner's visual scene so the hero replicates competitor look,
          // not the generic studio-white default.
          scene: analysis.visualScene,
          durationSec: showcaseClipSec,
          totalSec: showcaseTotalSec,
          // Gallery-ranked clean shots so nano-banana sees the actual single
          // item from multiple angles, not just the "model wearing 5 chains"
          // storefront hero.
          referenceImageUrls: product.referenceImageUrls,
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
    // Source-of-truth surface for the UI side-by-side comparison.
    winningAdVideoUrl:
      winner.snapshot?.videos?.[0]?.videoHdUrl ||
      winner.snapshot?.videos?.[0]?.videoSdUrl ||
      undefined,
    winningAdDurationSec: storyboard.approxDurationSec || undefined,
    storyboard: {
      sceneDescription: storyboard.sceneDescription,
      characterDescription: storyboard.characterDescription,
      shotList: storyboard.shotList,
      cameraMotion: storyboard.cameraMotion,
      productType: storyboard.productType,
      hasPerson: storyboard.hasPerson,
      approxDurationSec: storyboard.approxDurationSec,
      frameUrls: storyboard.frameUrls,
    },
  };
}

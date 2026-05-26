// Autopilot orchestrator: competitor URL -> winning ad -> matched product -> generated video + copy
import { scrapeAdLibrary, type ApifyAd } from "./apify";
import { anthropic, writeAdScript, writeHeadlines } from "./anthropic";
import { startVideo, type VideoModel } from "./video";
import { getProducts, productUrl, type ShopProduct } from "./shopify";

export interface AutopilotResult {
  competitorPageName?: string;
  winningAdId?: string;
  winningAdSummary: string;
  winningAdHook: string;
  winningAdStyle: string;
  winningAdThemes: string[];
  product: { id?: string; title: string; description: string; link: string };
  script: string;
  visualPrompt: string;
  cta: string;
  headlines: string[];
  bodyCopy: string;
  videoJobId: string;
  videoModel: VideoModel;
  thumbnailUrl?: string;
  dailyBudget: number;
}

export interface ResolvedCompetitor {
  pageId?: string;
  searchTerm: string;
  isAdLibraryUrl: boolean;
}

export function resolveCompetitor(input: string): ResolvedCompetitor {
  const trimmed = input.trim();
  // FB Ad Library URL
  if (/facebook\.com\/ads\/library/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const pageId = u.searchParams.get("view_all_page_id") || undefined;
      const searchTerm = u.searchParams.get("q") || "";
      return { pageId, searchTerm: searchTerm || pageId || trimmed, isAdLibraryUrl: true };
    } catch {
      return { searchTerm: trimmed, isAdLibraryUrl: true };
    }
  }
  // Plain URL -> extract brand from hostname
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const host = u.hostname.replace(/^www\./, "");
      const brand = host.split(".")[0];
      return { searchTerm: brand, isAdLibraryUrl: false };
    } catch {
      return { searchTerm: trimmed, isAdLibraryUrl: false };
    }
  }
  // Plain brand name
  return { searchTerm: trimmed, isAdLibraryUrl: false };
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
    // Variants
    const body = ad.snapshot?.body?.trim().slice(0, 120);
    if (body) {
      const variants = bodyCounts.get(body) || 1;
      if (variants > 1) score += 30 * Math.min(3, variants);
    }
    // Cross-platform
    const pp = (ad as { publisherPlatform?: string[] }).publisherPlatform;
    if (Array.isArray(pp) && pp.length > 1) score += 15;
    // Impressions
    const impUpper = ad.impressions?.upperBound ? parseInt(ad.impressions.upperBound, 10) : 0;
    if (impUpper > 0) {
      score += Math.min(40, Math.log10(impUpper) * 6);
    }
    return { ...ad, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored;
}

async function analyzeImage(imageUrl: string, prompt: string): Promise<string> {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return "";
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const ct = imgRes.headers.get("content-type") || "image/jpeg";
    const b64 = buf.toString("base64");
    const res = await anthropic().messages.create({
      model: "claude-opus-4-6",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: ct as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: b64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text : "";
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
{"summary": "1-2 sentences what this ad is selling and why it works", "hook": "the opening line/visual hook in <=12 words", "style": "ugc_review" | "yapping" | "founder_pov" | "demo", "body_themes": ["3-6 short keyword themes from the body copy"]}

Style definitions:
- ugc_review: real person holding/reviewing product, selfie cam
- yapping: fast talking head selfie, hook mid-sentence, raw vibe
- founder_pov: brand owner explaining, polished but personal
- demo: product close-up, motion, no face`;

  const user = `Ad title: ${title}
Ad body: ${body}
Visual: ${visualDescription || "(unknown)"}`;

  const res = await anthropic().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 800,
    system: sys,
    messages: [{ role: "user", content: user }],
  });
  const text = (res.content[0] as { type: "text"; text: string }).text;
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
  };
  return { ...parsed, thumbnailUrl };
}

export async function pickProduct(themes: string[]): Promise<{ id?: string; title: string; description: string; link: string }> {
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
    };
  } catch {
    return fallback;
  }
}

export interface RunAutopilotInput {
  competitorInput: string;
  dailyBudget?: number;
}

export async function runAutopilot(input: RunAutopilotInput): Promise<AutopilotResult> {
  const dailyBudget = input.dailyBudget ?? 100;
  const resolved = resolveCompetitor(input.competitorInput);

  // Build apify input
  const apifyInput: { searchPageIDs?: string[]; searchTerms?: string[]; country: string; maxResults: number } = {
    country: "US",
    maxResults: 30,
  };
  if (resolved.pageId) {
    apifyInput.searchPageIDs = [resolved.pageId];
  } else {
    apifyInput.searchTerms = [resolved.searchTerm];
  }

  const ads = await scrapeAdLibrary(apifyInput, 180_000);
  if (!ads || ads.length === 0) {
    throw new Error("לא נמצאו מודעות פעילות למתחרה הזה");
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

  const videoJob = await startVideo(scriptOut.visual_prompt, "minimax");

  const headlinesOut = await writeHeadlines({
    productTitle: product.title,
    productDescription: product.description,
    language: "en",
  });

  // Body copy: simple template referencing winning hook
  const bodyCopy = `${analysis.hook}\n\n${product.title} — ${product.description}\n\nShop now: ${product.link}`;

  return {
    competitorPageName: winner.pageName,
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
    videoJobId: videoJob.id,
    videoModel: videoJob.model,
    thumbnailUrl: analysis.thumbnailUrl,
    dailyBudget,
  };
}

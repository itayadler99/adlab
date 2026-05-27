"use client";

import { useEffect, useRef, useState } from "react";

type Stage = "idle" | "scanning" | "rendering" | "review" | "launching" | "launched" | "error";

type AdStyle = "ugc_review" | "yapping" | "founder_pov" | "demo";

interface UgcInputsClient {
  productTitle: string;
  productDescription?: string;
  productImageUrl: string;
  script: string;
  hook: string;
  style: AdStyle;
  demographic?: string;
  setting?: string;
  language: "en" | "he";
  voiceArchetype?: string;
}

interface AutopilotResult {
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
  mode: "video" | "ugc" | "showcase";
  videoJobId?: string;
  videoJobIds?: string[];
  videoClipSeconds?: number;
  videoTotalSeconds?: number;
  videoModel?: string;
  ugcInputs?: UgcInputsClient;
  showcaseInputs?: ShowcaseInputsClient;
  imageJobIds?: string[];
  thumbnailUrl?: string;
  dailyBudget: number;
}

interface ShowcaseInputsClient {
  productTitle: string;
  productImageUrl: string;
  hook: string;
  scene?: string;
  durationSec?: number;
}

type ShowcaseStage = "hero" | "animate" | "done" | "failed";
interface ShowcaseState {
  stage: ShowcaseStage;
  inputs: ShowcaseInputsClient;
  artifacts: { heroImageUrl?: string; videoUrl?: string };
  pending?: { provider: "fal" | "replicate"; endpoint: string; jobId: string };
  error?: string;
  animateModel?: "seedance-1-pro" | "kling-2.1";
  qualityAttempt?: number;
  qualityScore?: number;
  qualityReasons?: string[];
  startedAt: number;
  updatedAt: number;
}

const SHOWCASE_STAGE_LABEL: Record<ShowcaseStage, string> = {
  hero: "יוצר תמונת מוצר מסוגננת",
  animate: "מחיה את המוצר לסרטון",
  done: "הסרטון מוכן",
  failed: "נכשל",
};

type UgcStage = "actor" | "composite" | "animate" | "tts" | "lipsync" | "done" | "failed";
interface UgcState {
  stage: UgcStage;
  inputs: UgcInputsClient;
  artifacts: {
    actorImageUrl?: string;
    compositeImageUrl?: string;
    rawVideoUrl?: string;
    audioUrl?: string;
    finalVideoUrl?: string;
  };
  pending?: { endpoint: string; jobId: string };
  error?: string;
  startedAt: number;
  updatedAt: number;
}

const UGC_STAGE_LABEL: Record<UgcStage, string> = {
  actor: "יוצר דמות (שחקן/ית)",
  composite: "מצמיד את המוצר ליד של הדמות",
  animate: "מחיה את התמונה לסרטון",
  tts: "מקליט את הקריינות",
  lipsync: "מתאים שפתיים לקול",
  done: "הסרטון מוכן",
  failed: "נכשל",
};
const UGC_STAGES: UgcStage[] = ["actor", "composite", "animate", "tts", "lipsync", "done"];

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  scanning: "סורק את ספריית המודעות של המתחרה...",
  rendering: "מנתח את המודעה המנצחת ומרנדר וידאו (1-3 דקות)...",
  review: "מוכן לבדיקה",
  launching: "מעלה לאוויר...",
  launched: "הקמפיין באוויר",
  error: "שגיאה",
};

type VideoModelChoice =
  | "veo-3.1-fast"
  | "sora-2-pro"
  | "kling-3.0"
  | "seedance-2.0";

const VIDEO_MODELS: { value: VideoModelChoice; label: string; note: string }[] = [
  { value: "veo-3.1-fast", label: "Veo 3.1 Fast — מומלץ", note: "Google Veo 3.1, 8s, קול מובנה, איכות מצוינת ($)" },
  { value: "sora-2-pro", label: "Sora 2 Pro — ריאליזם מקסימלי", note: "OpenAI, פרימיום, איכות הגבוהה ביותר ($$$)" },
  { value: "kling-3.0", label: "Kling 3 Pro — סרטון ארוך", note: "עד 15 שניות, מלך ה-UGC הארוך ($$)" },
  { value: "seedance-2.0", label: "Seedance 2.0 — תנועה דינמית", note: "Bytedance, ספורט/מחול/אקשן ($)" },
];

export default function AutopilotPage() {
  const [competitorInput, setCompetitorInput] = useState("");
  const [dailyBudget, setDailyBudget] = useState(100);
  const [videoModel, setVideoModel] = useState<VideoModelChoice>("veo-3.1-fast");
  const [videoDuration, setVideoDuration] = useState(0); // 0 = auto-detect from competitor
  const [adMode, setAdMode] = useState<"auto" | "video" | "ugc" | "showcase">("auto");
  const [postProcess, setPostProcess] = useState<"off" | "fast" | "speel" | "speel-4k">("fast");
  const [language, setLanguage] = useState<"en" | "he">("en");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AutopilotResult | null>(null);
  const [videoUrls, setVideoUrls] = useState<(string | null)[]>([]);
  const [imageUrls, setImageUrls] = useState<(string | null)[]>([]);
  const [selectedHeadline, setSelectedHeadline] = useState(0);
  const [editedBody, setEditedBody] = useState("");
  const [editedBudget, setEditedBudget] = useState(100);
  const [launchInfo, setLaunchInfo] = useState<{ campaign_id?: string } | null>(null);
  const [stitchedUrl, setStitchedUrl] = useState<string | null>(null);
  const [stitching, setStitching] = useState(false);
  const [stitchError, setStitchError] = useState("");
  const stitchTriggeredRef = useRef(false);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState("");
  const enhanceTriggeredRef = useRef(false);
  const pollersRef = useRef<number[]>([]);
  // UGC mode state
  const [ugcState, setUgcState] = useState<UgcState | null>(null);
  const ugcTickRef = useRef<number | null>(null);
  const ugcAdvanceInFlightRef = useRef(false);
  const finalUgcUrl = ugcState?.artifacts.finalVideoUrl || null;
  // Multi-variant fan-out state (P2)
  interface VariantRunClient {
    variantIndex: number;
    hook: string;
    script: string;
    state: UgcState;
  }
  const [variantRuns, setVariantRuns] = useState<VariantRunClient[] | null>(null);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState("");
  const variantsTickRef = useRef<number | null>(null);
  const variantsAdvanceInFlightRef = useRef(false);
  // Showcase mode state
  const [showcaseState, setShowcaseState] = useState<ShowcaseState | null>(null);
  const showcaseTickRef = useRef<number | null>(null);
  const showcaseAdvanceInFlightRef = useRef(false);
  const finalShowcaseUrl = showcaseState?.artifacts.videoUrl || null;
  // "Source" video — first cut from whichever pipeline produced it.
  const sourceVideoUrl = finalShowcaseUrl || finalUgcUrl || stitchedUrl || videoUrls[0] || null;
  // Preferred for player + launch — enhanced if postprocess succeeded, else source.
  const videoUrl = enhancedUrl || sourceVideoUrl;

  function clearAllPollers() {
    for (const id of pollersRef.current) window.clearInterval(id);
    pollersRef.current = [];
  }

  function clearUgcTick() {
    if (ugcTickRef.current !== null) {
      window.clearInterval(ugcTickRef.current);
      ugcTickRef.current = null;
    }
  }

  function clearShowcaseTick() {
    if (showcaseTickRef.current !== null) {
      window.clearInterval(showcaseTickRef.current);
      showcaseTickRef.current = null;
    }
  }

  function clearVariantsTick() {
    if (variantsTickRef.current !== null) {
      window.clearInterval(variantsTickRef.current);
      variantsTickRef.current = null;
    }
  }

  async function advanceVariantsOnce() {
    if (variantsAdvanceInFlightRef.current) return;
    variantsAdvanceInFlightRef.current = true;
    try {
      const current = variantRuns;
      if (!current || current.length === 0) return;
      const res = await fetch("/api/generate/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", runs: current }),
      });
      const data = (await res.json()) as { runs?: VariantRunClient[]; error?: string };
      if (!res.ok || data.error || !data.runs) return;
      setVariantRuns(data.runs);
      const allDone = data.runs.every(
        (r) => r.state.stage === "done" || r.state.stage === "failed"
      );
      if (allDone) clearVariantsTick();
    } catch {
      // swallow — next tick retries
    } finally {
      variantsAdvanceInFlightRef.current = false;
    }
  }

  async function fanOutVariants() {
    if (!result?.ugcInputs) return;
    setVariantsLoading(true);
    setVariantsError("");
    try {
      const inputs = {
        ...result.ugcInputs,
        baseScript: result.ugcInputs.script,
        baseHook: result.ugcInputs.hook,
        count: 5,
      };
      const res = await fetch("/api/generate/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", inputs }),
      });
      const data = (await res.json()) as { runs?: VariantRunClient[]; error?: string };
      if (!res.ok || data.error || !data.runs) {
        setVariantsError(data.error || `variants start failed: ${res.status}`);
        return;
      }
      setVariantRuns(data.runs);
      clearVariantsTick();
      variantsTickRef.current = window.setInterval(() => advanceVariantsOnce(), 6000);
    } catch (e) {
      setVariantsError(e instanceof Error ? e.message : "variants network error");
    } finally {
      setVariantsLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      clearAllPollers();
      clearUgcTick();
      clearShowcaseTick();
      clearVariantsTick();
    };
  }, []);

  async function startUgcPipeline(inputs: UgcInputsClient) {
    try {
      const res = await fetch("/api/ugc/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      });
      const data = (await res.json()) as UgcState & { error?: string };
      if (!res.ok || data.error) {
        setError(`UGC start failed: ${data.error || res.status}`);
        setStage("error");
        return;
      }
      setUgcState(data);
      // Begin tick loop
      clearUgcTick();
      ugcTickRef.current = window.setInterval(() => advanceUgcOnce(), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "UGC start network error");
      setStage("error");
    }
  }

  async function startShowcasePipeline(inputs: ShowcaseInputsClient) {
    try {
      const res = await fetch("/api/showcase/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      });
      const data = (await res.json()) as ShowcaseState & { error?: string };
      if (!res.ok || data.error) {
        setError(`Showcase start failed: ${data.error || res.status}`);
        setStage("error");
        return;
      }
      setShowcaseState(data);
      clearShowcaseTick();
      showcaseTickRef.current = window.setInterval(() => advanceShowcaseOnce(), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Showcase start network error");
      setStage("error");
    }
  }

  async function advanceShowcaseOnce() {
    if (showcaseAdvanceInFlightRef.current) return;
    let snapshot: ShowcaseState | null = null;
    setShowcaseState((prev) => {
      snapshot = prev;
      return prev;
    });
    if (!snapshot) return;
    const cur: ShowcaseState = snapshot;
    if (cur.stage === "done" || cur.stage === "failed") {
      clearShowcaseTick();
      return;
    }
    showcaseAdvanceInFlightRef.current = true;
    try {
      const res = await fetch("/api/showcase/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cur),
      });
      const data = (await res.json()) as ShowcaseState & { error?: string };
      if (!res.ok || data.error) {
        setError(`Showcase advance failed: ${data.error || res.status}`);
        setStage("error");
        clearShowcaseTick();
        return;
      }
      setShowcaseState(data);
      if (data.stage === "done" || data.stage === "failed") {
        clearShowcaseTick();
      }
    } catch (e) {
      console.warn("showcase advance tick error:", e);
    } finally {
      showcaseAdvanceInFlightRef.current = false;
    }
  }

  async function advanceUgcOnce() {
    // Skip if a previous advance is still in flight — avoids duplicate jobs.
    if (ugcAdvanceInFlightRef.current) return;
    let snapshot: UgcState | null = null;
    setUgcState((prev) => {
      snapshot = prev;
      return prev;
    });
    if (!snapshot) return;
    const cur: UgcState = snapshot;
    if (cur.stage === "done" || cur.stage === "failed") {
      clearUgcTick();
      return;
    }
    ugcAdvanceInFlightRef.current = true;
    try {
      const res = await fetch("/api/ugc/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cur),
      });
      const data = (await res.json()) as UgcState & { error?: string };
      if (!res.ok || data.error) {
        setError(`UGC advance failed: ${data.error || res.status}`);
        setStage("error");
        clearUgcTick();
        return;
      }
      setUgcState(data);
      if (data.stage === "done" || data.stage === "failed") {
        clearUgcTick();
      }
    } catch (e) {
      // Transient errors are tolerated — next tick retries.
      console.warn("ugc advance tick error:", e);
    } finally {
      ugcAdvanceInFlightRef.current = false;
    }
  }

  function pollJob(jobId: string, kind: "video" | "image", onDone: (url: string) => void, onFail: (msg: string) => void, model?: string) {
    let failedAttempts = 0;
    const modelQ = kind === "video" && model ? `&model=${encodeURIComponent(model)}` : "";
    const handle = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/poll?id=${encodeURIComponent(jobId)}&kind=${kind}${modelQ}`);
        if (!res.ok) {
          failedAttempts += 1;
          if (failedAttempts >= 5) {
            onFail(`HTTP ${res.status}`);
            window.clearInterval(handle);
          }
          return;
        }
        failedAttempts = 0;
        const data = (await res.json()) as {
          status?: string;
          videoUrl?: string;
          imageUrl?: string;
          error?: string;
        };
        const url = kind === "video" ? data.videoUrl : data.imageUrl;
        if (url && data.status === "succeeded") {
          onDone(url);
          window.clearInterval(handle);
        } else if (data.status === "failed") {
          onFail(data.error || "failed");
          window.clearInterval(handle);
        }
      } catch (e) {
        failedAttempts += 1;
        if (failedAttempts >= 5) {
          onFail(e instanceof Error ? e.message : "network");
          window.clearInterval(handle);
        }
      }
    }, 5000);
    pollersRef.current.push(handle);
  }

  function startPollingAll(videoIds: string[], imageIds: string[], model?: string) {
    clearAllPollers();
    setVideoUrls(new Array(videoIds.length).fill(null));
    setImageUrls(new Array(imageIds.length).fill(null));
    setStitchedUrl(null);
    setStitching(false);
    setStitchError("");
    stitchTriggeredRef.current = false;
    videoIds.forEach((jid, idx) => {
      pollJob(
        jid,
        "video",
        (url) =>
          setVideoUrls((prev) => {
            const next = [...prev];
            next[idx] = url;
            return next;
          }),
        (msg) => {
          // Only first-clip failure is fatal; later clips can fail silently
          if (idx === 0) {
            setError(`ייצור הוידאו נכשל: ${msg}`);
            setStage("error");
          }
        },
        model
      );
    });
    imageIds.forEach((jid, idx) => {
      pollJob(
        jid,
        "image",
        (url) =>
          setImageUrls((prev) => {
            const next = [...prev];
            next[idx] = url;
            return next;
          }),
        () => {
          // image failure is non-fatal
        }
      );
    });
  }

  // Auto-stitch when all clips ready and N>1
  useEffect(() => {
    if (stitchTriggeredRef.current) return;
    if (!result) return;
    if (videoUrls.length <= 1) return;
    if (!videoUrls.every((u) => !!u)) return;
    stitchTriggeredRef.current = true;
    setStitching(true);
    setStitchError("");
    (async () => {
      try {
        const res = await fetch("/api/stitch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            urls: videoUrls as string[],
            clipSeconds: result.videoClipSeconds,
          }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || data.error || !data.url) {
          setStitchError(data.error || "stitch failed");
        } else {
          setStitchedUrl(data.url);
        }
      } catch (e) {
        setStitchError(e instanceof Error ? e.message : "stitch network error");
      } finally {
        setStitching(false);
      }
    })();
  }, [videoUrls, result]);

  // Auto-postprocess once the pipeline produces a source video. Runs at most
  // once per autopilot run; failures fall back to the source url silently.
  useEffect(() => {
    if (postProcess === "off") return;
    if (enhanceTriggeredRef.current) return;
    if (!sourceVideoUrl) return;
    // If multi-clip, wait for the stitched url; otherwise process the single clip.
    if (videoUrls.length > 1 && !stitchedUrl) return;
    enhanceTriggeredRef.current = true;
    setEnhancing(true);
    setEnhanceError("");
    (async () => {
      try {
        const res = await fetch("/api/postprocess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: sourceVideoUrl, level: postProcess }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || data.error || !data.url) {
          setEnhanceError(data.error || "postprocess failed");
        } else {
          setEnhancedUrl(data.url);
        }
      } catch (e) {
        setEnhanceError(e instanceof Error ? e.message : "postprocess network error");
      } finally {
        setEnhancing(false);
      }
    })();
  }, [sourceVideoUrl, stitchedUrl, videoUrls.length, postProcess]);

  async function runAutopilot() {
    if (!competitorInput.trim()) {
      setError("הכנס כתובת מתחרה או שם מותג");
      return;
    }
    setError("");
    setResult(null);
    setVideoUrls([]);
    setImageUrls([]);
    setStitchedUrl(null);
    setStitchError("");
    setLaunchInfo(null);
    setUgcState(null);
    setShowcaseState(null);
    setEnhancedUrl(null);
    setEnhancing(false);
    setEnhanceError("");
    enhanceTriggeredRef.current = false;
    clearUgcTick();
    clearShowcaseTick();
    setStage("scanning");

    try {
      const res = await fetch("/api/autopilot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorInput, dailyBudget, videoModel, videoDuration, mode: adMode, language }),
      });
      const data = (await res.json()) as AutopilotResult & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Autopilot נכשל");
        setStage("error");
        return;
      }
      setResult(data);
      setEditedBody(data.bodyCopy);
      setEditedBudget(data.dailyBudget);
      setSelectedHeadline(0);
      setStage("rendering");

      if (data.mode === "ugc" && data.ugcInputs) {
        // Kick off UGC pipeline; sales images still poll in parallel.
        await startUgcPipeline(data.ugcInputs);
        if (data.imageJobIds && data.imageJobIds.length > 0) {
          startPollingAll([], data.imageJobIds);
        }
      } else if (data.mode === "showcase" && data.showcaseInputs) {
        await startShowcasePipeline(data.showcaseInputs);
        if (data.imageJobIds && data.imageJobIds.length > 0) {
          startPollingAll([], data.imageJobIds);
        }
      } else {
        const vids = data.videoJobIds && data.videoJobIds.length > 0
          ? data.videoJobIds
          : data.videoJobId ? [data.videoJobId] : [];
        startPollingAll(vids, data.imageJobIds || [], data.videoModel);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setStage("error");
    }
  }

  async function approve() {
    if (!result || !videoUrl) return;
    setStage("launching");
    setError("");
    try {
      const res = await fetch("/api/autopilot/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireApproved: true,
          videoUrl,
          thumbnailUrl: result.thumbnailUrl,
          headline: result.headlines[selectedHeadline],
          bodyCopy: editedBody,
          productLink: result.product.link,
          dailyBudget: editedBudget,
          countries: ["US"],
          campaignName: `autopilot-${result.competitorPageName || "comp"}-${Date.now()}`,
        }),
      });
      const data = (await res.json()) as { campaign_id?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "העלאה נכשלה");
        setStage("error");
        return;
      }
      setLaunchInfo(data);
      setStage("launched");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setStage("error");
    }
  }

  function reject() {
    clearAllPollers();
    runAutopilot();
  }

  const showReview = (stage === "rendering" || stage === "review" || stage === "launching") && result;

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-violet-400">טייס אוטומטי</span> — מ-URL לקמפיין חי
          </h1>
          <p className="mt-2 text-white/50 text-sm">
            הדבק כתובת מתחרה (Ad Library או דומיין) ונבנה קמפיין שלם — סריקה, ניתוח, וידאו, קופי. אתה רק מאשר.
          </p>
        </div>

        {(stage === "idle" || stage === "error") && (
          <div className="space-y-4 bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">כתובת מתחרה או שם מותג</label>
              <textarea
                value={competitorInput}
                onChange={(e) => setCompetitorInput(e.target.value)}
                placeholder="https://www.facebook.com/ads/library/?view_all_page_id=123 או icecartel.com"
                className="w-full bg-black border border-white/15 rounded-lg px-4 py-3 text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500 min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">תקציב יומי ($)</label>
              <input
                type="number"
                min={5}
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
                className="w-full bg-black border border-white/15 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">סוג מודעה</label>
              <select
                value={adMode}
                onChange={(e) => setAdMode(e.target.value as "auto" | "video" | "ugc" | "showcase")}
                className="w-full bg-black border border-white/15 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="auto">אוטומטי (לפי המתחרה)</option>
                <option value="showcase">תצוגת מוצר — תקריב יוקרתי של התכשיט בלבד</option>
                <option value="ugc">UGC — דמות אמיתית מחזיקה את המוצר ומדברת</option>
                <option value="video">סרטון רגיל (Veo / Kling / Sora)</option>
              </select>
              <p className="text-xs text-white/40">
                תצוגת מוצר = רק התכשיט שלך, ללא שחקן, סטודיו יוקרתי. UGC = שחקן AI עם פנים, מחזיק את המוצר שלך, מדבר עם שפתיים בסנכרון. סרטון רגיל = סצנה גנרית.
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">שפת קריינות (UGC)</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "en" | "he")}
                className="w-full bg-black border border-white/15 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="en">אנגלית</option>
                <option value="he">עברית</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">דגם וידאו (סרטון רגיל)</label>
              <select
                value={videoModel}
                onChange={(e) => setVideoModel(e.target.value as VideoModelChoice)}
                className="w-full bg-black border border-white/15 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {VIDEO_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className="text-xs text-white/40">
                {VIDEO_MODELS.find((m) => m.value === videoModel)?.note}
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">אורך וידאו</label>
              <select
                value={videoDuration}
                onChange={(e) => setVideoDuration(Number(e.target.value))}
                className="w-full bg-black border border-white/15 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value={0}>אוטומטי (לפי המתחרה) — מומלץ</option>
                <option value={8}>8 שניות</option>
                <option value={10}>10 שניות</option>
                <option value={15}>15 שניות</option>
                <option value={20}>20 שניות</option>
                <option value={30}>30 שניות</option>
                <option value={45}>45 שניות</option>
                <option value={60}>60 שניות</option>
              </select>
              <p className="text-xs text-white/40">
                סרטון רציף, ללא חתכים נראים. אוטומטי = מדדים את אורך הסרטון של המתחרה ומתאימים. עד 15 שניות מיוצר כקליפ אחד אחיד; מעל זה חיבור חלק עם המשכיות ויזואלית מלאה.
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-white/80">שיפור ריאליזם (פוסט-פרודקשן)</label>
              <select
                value={postProcess}
                onChange={(e) => setPostProcess(e.target.value as "off" | "fast" | "speel" | "speel-4k")}
                className="w-full bg-black border border-white/15 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="fast">מהיר — גרעין סרט + תיקון צבע (מומלץ)</option>
                <option value="speel">מקסימום — אינטרפולציה ל-48fps + גרעין + צבע</option>
                <option value="speel-4k">איכות Speel — 48fps + שדרוג ל-4K + גרעין</option>
                <option value="off">כבוי — סרטון גולמי בלי שיפור</option>
              </select>
              <p className="text-xs text-white/40">
                מהיר: כ-10 שניות, חינם. מקסימום: כ-60 שניות, ~$0.05. איכות Speel: כ-3 דקות, ~$0.20, 4K משודרג.
              </p>
            </div>
            <button
              onClick={runAutopilot}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              התחל סריקה אוטומטית
            </button>
            {error && (
              <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg p-4 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {(stage === "scanning") && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-3">
            <div className="inline-block w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/80">{STAGE_LABEL[stage]}</p>
            <p className="text-white/40 text-xs">זה לוקח 30-90 שניות. אל תסגור את החלון.</p>
          </div>
        )}

        {showReview && result && (
          <div className="space-y-6">
            {/* Status banner */}
            <div className="bg-violet-950/40 border border-violet-500/30 rounded-xl p-4 text-sm text-violet-200">
              {!videoUrl
                ? STAGE_LABEL.rendering
                : enhancing
                  ? "מוסיף גרעין סרט ותיקון צבע..."
                  : enhanceError
                    ? `שיפור ריאליזם נכשל (משתמש בסרטון הגולמי): ${enhanceError}`
                    : enhancedUrl
                      ? "הסרטון משופר ומוכן — בדוק ואשר"
                      : "הוידאו מוכן — בדוק ואשר"}
            </div>

            {/* UGC pipeline progress */}
            {result.mode === "ugc" && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  צינור UGC — דמות אמיתית מדברת
                </h2>

                {/* Stage strip */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-1">
                    {UGC_STAGES.filter((s) => s !== "done").map((s) => {
                      const currentIdx = ugcState ? UGC_STAGES.indexOf(ugcState.stage) : -1;
                      const myIdx = UGC_STAGES.indexOf(s);
                      const isDone = currentIdx > myIdx || ugcState?.stage === "done";
                      const isActive = currentIdx === myIdx && ugcState?.stage !== "failed";
                      const isFailed = ugcState?.stage === "failed" && currentIdx === myIdx;
                      return (
                        <div key={s} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-colors ${
                              isFailed
                                ? "border-red-500 bg-red-950 text-red-300"
                                : isDone
                                  ? "border-emerald-500 bg-emerald-950 text-emerald-300"
                                  : isActive
                                    ? "border-violet-400 bg-violet-950 text-violet-200 animate-pulse"
                                    : "border-white/20 bg-black text-white/40"
                            }`}
                          >
                            {isDone ? "✓" : isFailed ? "!" : myIdx + 1}
                          </div>
                          <div className="text-[10px] text-white/50 text-center leading-tight">
                            {UGC_STAGE_LABEL[s]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-sm text-white/70 text-center">
                    {ugcState
                      ? ugcState.stage === "done"
                        ? "הסרטון מוכן."
                        : ugcState.stage === "failed"
                          ? `נכשל: ${ugcState.error || "שגיאה"}`
                          : `${UGC_STAGE_LABEL[ugcState.stage]}...`
                      : "מאתחל..."}
                  </div>
                </div>

                {/* Artifact previews */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <div className="text-[10px] text-white/40">שחקן/ית</div>
                    {ugcState?.artifacts.actorImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ugcState.artifacts.actorImageUrl} alt="actor" className="w-full aspect-[9/16] object-cover rounded-lg border border-white/10" />
                    ) : (
                      <div className="aspect-[9/16] bg-zinc-900 border border-white/10 rounded-lg" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-white/40">עם המוצר</div>
                    {ugcState?.artifacts.compositeImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ugcState.artifacts.compositeImageUrl} alt="composite" className="w-full aspect-[9/16] object-cover rounded-lg border border-white/10" />
                    ) : (
                      <div className="aspect-[9/16] bg-zinc-900 border border-white/10 rounded-lg" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-white/40">סרטון מסונכרן</div>
                    {ugcState?.artifacts.finalVideoUrl ? (
                      <video src={ugcState.artifacts.finalVideoUrl} controls className="w-full aspect-[9/16] object-cover rounded-lg border border-emerald-500/40 bg-zinc-900" />
                    ) : ugcState?.artifacts.rawVideoUrl ? (
                      <video src={ugcState.artifacts.rawVideoUrl} controls muted className="w-full aspect-[9/16] object-cover rounded-lg border border-white/10 bg-zinc-900" />
                    ) : (
                      <div className="aspect-[9/16] bg-zinc-900 border border-white/10 rounded-lg" />
                    )}
                  </div>
                </div>

                {/* P2 — Variant fan-out grid */}
                {result.mode === "ugc" && ugcState?.stage === "done" && (
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                        ‎5 וריאציות hooks (fan-out)
                      </h3>
                      <button
                        type="button"
                        onClick={fanOutVariants}
                        disabled={variantsLoading || (variantRuns?.length ?? 0) > 0}
                        className="px-3 py-1.5 text-xs rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {variantsLoading
                          ? "מתחיל..."
                          : variantRuns
                            ? `${variantRuns.filter((r) => r.state.stage === "done").length}/${variantRuns.length} מוכנות`
                            : "‎צור 5 וריאציות"}
                      </button>
                    </div>
                    {variantsError && (
                      <div className="text-xs text-red-300">{variantsError}</div>
                    )}
                    {variantRuns && variantRuns.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {variantRuns.map((r) => (
                          <div key={r.variantIndex} className="space-y-1">
                            <div className="text-[10px] text-white/40 line-clamp-1" title={r.hook}>
                              {r.hook}
                            </div>
                            {r.state.artifacts.finalVideoUrl ? (
                              <video
                                src={r.state.artifacts.finalVideoUrl}
                                controls
                                className="w-full aspect-[9/16] object-cover rounded-lg border border-emerald-500/40 bg-zinc-900"
                              />
                            ) : r.state.stage === "failed" ? (
                              <div className="aspect-[9/16] bg-zinc-900 border border-red-500/30 rounded-lg flex items-center justify-center text-[10px] text-red-300 text-center px-2">
                                {r.state.error || "נכשל"}
                              </div>
                            ) : (
                              <div className="aspect-[9/16] bg-zinc-900 border border-white/10 rounded-lg flex items-center justify-center text-[10px] text-white/40">
                                {UGC_STAGE_LABEL[r.state.stage]}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Showcase pipeline progress */}
            {result.mode === "showcase" && (
              <section className="space-y-3">
                <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  צינור תצוגת מוצר
                </h2>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <div className="text-sm text-white/70 text-center">
                    {showcaseState
                      ? showcaseState.stage === "done"
                        ? "הסרטון מוכן."
                        : showcaseState.stage === "failed"
                          ? `נכשל: ${showcaseState.error || "שגיאה"}`
                          : `${SHOWCASE_STAGE_LABEL[showcaseState.stage]}...`
                      : "מאתחל..."}
                  </div>
                  {showcaseState?.qualityScore !== undefined && (
                    <div className={`text-xs text-center ${showcaseState.qualityScore >= 7 ? "text-emerald-300" : "text-amber-300"}`}>
                      איכות סרטון (Claude Vision): {showcaseState.qualityScore}/10
                      {showcaseState.qualityAttempt && showcaseState.qualityAttempt > 1
                        ? ` (ניסיון ${showcaseState.qualityAttempt})`
                        : ""}
                      {showcaseState.qualityReasons && showcaseState.qualityReasons.length > 0 && (
                        <div className="text-white/40 mt-1">{showcaseState.qualityReasons.slice(0, 2).join(" · ")}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="text-[10px] text-white/40">תמונת מוצר (הרו)</div>
                    {showcaseState?.artifacts.heroImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={showcaseState.artifacts.heroImageUrl} alt="hero" className="w-full aspect-[9/16] object-cover rounded-lg border border-white/10" />
                    ) : (
                      <div className="aspect-[9/16] bg-zinc-900 border border-white/10 rounded-lg" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-white/40">סרטון</div>
                    {showcaseState?.artifacts.videoUrl ? (
                      <video src={showcaseState.artifacts.videoUrl} controls className="w-full aspect-[9/16] object-cover rounded-lg border border-emerald-500/40 bg-zinc-900" />
                    ) : (
                      <div className="aspect-[9/16] bg-zinc-900 border border-white/10 rounded-lg" />
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Video clips (mode = "video") */}
            {result.mode !== "ugc" && result.mode !== "showcase" && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                וידאו{videoUrls.length > 1 ? ` (${videoUrls.length} קליפים)` : ""}
              </h2>

              {/* Stitched master video */}
              {stitchedUrl && (
                <div className="space-y-1">
                  <div className="text-xs text-emerald-300">סרטון מלא מחובר</div>
                  <video src={stitchedUrl} controls className="w-full rounded-xl border border-emerald-500/40 bg-zinc-900" />
                </div>
              )}

              {/* Stitch status */}
              {videoUrls.length > 1 && videoUrls.every((u) => u) && !stitchedUrl && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white/70 flex items-center gap-3">
                  {stitching ? (
                    <>
                      <div className="inline-block w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                      <span>מחבר את הקליפים לסרטון אחד...</span>
                    </>
                  ) : stitchError ? (
                    <span className="text-red-300">חיבור נכשל: {stitchError}</span>
                  ) : null}
                </div>
              )}

              <div className={videoUrls.length > 1 ? "grid grid-cols-1 md:grid-cols-2 gap-3" : ""}>
                {videoUrls.length === 0 && (
                  <div className="aspect-video bg-zinc-900 border border-white/10 rounded-xl flex items-center justify-center text-white/40 text-sm">
                    <div className="text-center space-y-2">
                      <div className="inline-block w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                      <p>מרנדר וידאו...</p>
                    </div>
                  </div>
                )}
                {videoUrls.map((url, i) => (
                  <div key={i} className="space-y-1">
                    {videoUrls.length > 1 && (
                      <div className="text-xs text-white/40">קליפ {i + 1}/{videoUrls.length}</div>
                    )}
                    {url ? (
                      <video src={url} controls className="w-full rounded-xl border border-white/10 bg-zinc-900" />
                    ) : (
                      <div className="aspect-[9/16] max-h-96 bg-zinc-900 border border-white/10 rounded-xl flex items-center justify-center text-white/40 text-sm">
                        <div className="text-center space-y-2">
                          <div className="inline-block w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                          <p>מרנדר...</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
            )}

            {/* Sales images */}
            {(imageUrls.length > 0 || (result.imageJobIds && result.imageJobIds.length > 0)) && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  3 תמונות מכירתיות עם כיתובים
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {imageUrls.map((url, i) => (
                    <div key={i} className="space-y-1">
                      <div className="text-xs text-white/40">תמונה {i + 1}</div>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`sales-${i}`} className="w-full rounded-xl border border-white/10 bg-zinc-900" />
                        </a>
                      ) : (
                        <div className="aspect-[9/16] bg-zinc-900 border border-white/10 rounded-xl flex items-center justify-center text-white/40 text-xs">
                          <div className="text-center space-y-2">
                            <div className="inline-block w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                            <p>מרנדר...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Winning ad info */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
              <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">המודעה המנצחת שזיהינו</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-white/40 text-xs">מתחרה</div>
                  <div className="text-white">{result.competitorPageName || "—"}</div>
                </div>
                <div>
                  <div className="text-white/40 text-xs">סגנון</div>
                  <div className="text-white">{result.winningAdStyle}</div>
                </div>
              </div>
              <div>
                <div className="text-white/40 text-xs">Hook</div>
                <div className="text-white text-sm">{result.winningAdHook}</div>
              </div>
              <div>
                <div className="text-white/40 text-xs">סיכום</div>
                <div className="text-white/80 text-sm leading-relaxed">{result.winningAdSummary}</div>
              </div>
              {result.winningAdThemes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.winningAdThemes.map((t) => (
                    <span key={t} className="text-xs bg-violet-950/60 border border-violet-500/30 text-violet-200 rounded-full px-2.5 py-1">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Product */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-2">
              <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">מוצר שנבחר</h2>
              <div className="text-white text-base font-medium">{result.product.title}</div>
              <div className="text-white/60 text-sm">{result.product.description}</div>
              <a href={result.product.link} target="_blank" rel="noopener noreferrer" className="text-violet-400 text-xs hover:underline break-all">
                {result.product.link}
              </a>
            </section>

            {/* Script */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-2">
              <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">סקריפט</h2>
              <pre className="whitespace-pre-wrap text-sm text-white/80 font-sans leading-relaxed">{result.script}</pre>
            </section>

            {/* Headlines */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
              <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">בחר Headline</h2>
              <div className="space-y-2">
                {result.headlines.map((h, i) => (
                  <label key={i} className="flex items-start gap-3 cursor-pointer bg-black/40 border border-white/10 hover:border-violet-500/40 rounded-lg p-3 transition-colors">
                    <input
                      type="radio"
                      name="headline"
                      checked={selectedHeadline === i}
                      onChange={() => setSelectedHeadline(i)}
                      className="mt-1 accent-violet-500"
                    />
                    <span className="text-sm text-white">{h}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* Body copy */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-2">
              <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">קופי (ניתן לערוך)</h2>
              <textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                className="w-full bg-black border border-white/15 rounded-lg px-3 py-2 text-sm text-white min-h-[120px] focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </section>

            {/* Budget */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-2">
              <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">תקציב יומי ($)</h2>
              <input
                type="number"
                min={5}
                value={editedBudget}
                onChange={(e) => setEditedBudget(Number(e.target.value))}
                className="w-full bg-black border border-white/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </section>

            {/* Actions */}
            <div className="flex gap-3 sticky bottom-4">
              <button
                onClick={approve}
                disabled={!videoUrl || stage === "launching"}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
              >
                {stage === "launching" ? "מעלה..." : !videoUrl ? "ממתין לוידאו..." : "אשר והעלה לאוויר"}
              </button>
              <button
                onClick={reject}
                disabled={stage === "launching"}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                תייצר מחדש
              </button>
            </div>

            {error && (
              <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg p-4 text-sm">{error}</div>
            )}
          </div>
        )}

        {stage === "launched" && launchInfo && (
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-6 space-y-3 text-center">
            <div className="text-4xl">🚀</div>
            <h2 className="text-xl font-bold text-emerald-300">הקמפיין באוויר</h2>
            <p className="text-white/60 text-sm">Campaign ID: <code className="text-emerald-300">{launchInfo.campaign_id}</code></p>
            <button
              onClick={() => {
                setStage("idle");
                setResult(null);
                setVideoUrls([]);
                setImageUrls([]);
                setStitchedUrl(null);
                setStitchError("");
                setCompetitorInput("");
                setLaunchInfo(null);
                setUgcState(null);
                clearUgcTick();
              }}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              קמפיין חדש
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

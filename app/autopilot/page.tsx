"use client";

import { useEffect, useRef, useState } from "react";

type Stage = "idle" | "scanning" | "rendering" | "review" | "launching" | "launched" | "error";

interface AutopilotResult {
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
  videoModel: string;
  thumbnailUrl?: string;
  dailyBudget: number;
}

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  scanning: "סורק את ספריית המודעות של המתחרה...",
  rendering: "מנתח את המודעה המנצחת ומרנדר וידאו (1-3 דקות)...",
  review: "מוכן לבדיקה",
  launching: "מעלה לאוויר...",
  launched: "הקמפיין באוויר",
  error: "שגיאה",
};

export default function AutopilotPage() {
  const [competitorInput, setCompetitorInput] = useState("");
  const [dailyBudget, setDailyBudget] = useState(100);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AutopilotResult | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedHeadline, setSelectedHeadline] = useState(0);
  const [editedBody, setEditedBody] = useState("");
  const [editedBudget, setEditedBudget] = useState(100);
  const [launchInfo, setLaunchInfo] = useState<{ campaign_id?: string } | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  function startPollingVideo(jobId: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let failedAttempts = 0;
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/poll?id=${encodeURIComponent(jobId)}`);
        if (!res.ok) {
          failedAttempts += 1;
          if (failedAttempts >= 5) {
            setError(`שגיאה בבדיקת סטטוס הוידאו (HTTP ${res.status})`);
            setStage("error");
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
          return;
        }
        failedAttempts = 0;
        const data = (await res.json()) as { status?: string; videoUrl?: string; error?: string };
        if (data.videoUrl && data.status === "succeeded") {
          setVideoUrl(data.videoUrl);
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        } else if (data.status === "failed") {
          setError(data.error || "ייצור הוידאו נכשל");
          setStage("error");
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (e) {
        failedAttempts += 1;
        if (failedAttempts >= 5) {
          setError(e instanceof Error ? e.message : "שגיאת רשת בבדיקת הוידאו");
          setStage("error");
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 5000);
  }

  async function runAutopilot() {
    if (!competitorInput.trim()) {
      setError("הכנס כתובת מתחרה או שם מותג");
      return;
    }
    setError("");
    setResult(null);
    setVideoUrl(null);
    setLaunchInfo(null);
    setStage("scanning");

    try {
      const res = await fetch("/api/autopilot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorInput, dailyBudget }),
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
      startPollingVideo(data.videoJobId);
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
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
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
              {!videoUrl ? STAGE_LABEL.rendering : "הוידאו מוכן — בדוק ואשר"}
            </div>

            {/* Video */}
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">וידאו</h2>
              {videoUrl ? (
                <video src={videoUrl} controls className="w-full rounded-xl border border-white/10 bg-zinc-900" />
              ) : (
                <div className="aspect-video bg-zinc-900 border border-white/10 rounded-xl flex items-center justify-center text-white/40 text-sm">
                  <div className="text-center space-y-2">
                    <div className="inline-block w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    <p>מרנדר וידאו...</p>
                  </div>
                </div>
              )}
            </section>

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
                setVideoUrl(null);
                setCompetitorInput("");
                setLaunchInfo(null);
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

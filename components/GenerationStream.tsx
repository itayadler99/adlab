"use client";

// Per-stage generation preview: a numbered stage strip + live thumbnail tiles.
//
// Presentational and transport-agnostic. It can be driven by the SSE hook
// (`hooks/useGenerationStream`) or, as in the autopilot page, by the existing
// start/advance poll loop — whichever produces the `currentKey` + tile URLs.
// Keeping it controlled avoids running the pipeline twice.

export interface StreamStep {
  key: string;
  label: string;
}

export interface StreamTile {
  label: string;
  /** Best-available artifact URL for this tile, if any yet. */
  url?: string;
  /** Render as a <video> instead of an <img>. */
  kind?: "image" | "video";
  /** Marks the final/hero tile so it gets the emerald accent. */
  highlight?: boolean;
}

export interface GenerationStreamProps {
  title: string;
  /** Ordered steps shown in the numbered strip (exclude done/failed). */
  steps: StreamStep[];
  /** Current step key. */
  currentKey: string;
  /** Ordered index of steps that are fully complete is derived from this. */
  stepOrder: string[];
  done?: boolean;
  failed?: boolean;
  errorText?: string;
  doneText?: string;
  /** Status line while a step is active, e.g. the localized stage label. */
  activeLabel?: string;
  initLabel?: string;
  /** Thumbnail tiles below the strip. */
  tiles: StreamTile[];
  /** Subtle "updating" pulse while the pipeline is still running. */
  live?: boolean;
}

export function GenerationStream({
  title,
  steps,
  currentKey,
  stepOrder,
  done = false,
  failed = false,
  errorText,
  doneText = "הסרטון מוכן.",
  activeLabel,
  initLabel = "מאתחל...",
  tiles,
  live = false,
}: GenerationStreamProps) {
  const currentIdx = stepOrder.indexOf(currentKey);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-white/60 tracking-wider">
          {title}
        </h2>
        {live && !done && !failed && (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-violet-300">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            מתעדכן
          </span>
        )}
      </div>

      {/* Stage strip */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-1">
          {steps.map((s, i) => {
            const myIdx = stepOrder.indexOf(s.key);
            const isDone = done || currentIdx > myIdx;
            const isActive = !done && !failed && currentIdx === myIdx;
            const isFailed = failed && currentIdx === myIdx;
            return (
              <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
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
                  {isDone ? "✓" : isFailed ? "!" : i + 1}
                </div>
                <div className="text-[10px] text-white/50 text-center leading-tight">
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-sm text-white/70 text-center">
          {failed
            ? `נכשל: ${errorText || "שגיאה"}`
            : done
              ? doneText
              : activeLabel
                ? `${activeLabel}...`
                : initLabel}
        </div>
      </div>

      {/* Thumbnail tiles */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
      >
        {tiles.map((t) => (
          <div key={t.label} className="space-y-1">
            <div className="text-[10px] text-white/40">{t.label}</div>
            {t.url ? (
              t.kind === "video" ? (
                <video
                  src={t.url}
                  controls
                  className={`w-full aspect-[9/16] object-cover rounded-lg bg-zinc-900 border ${
                    t.highlight ? "border-emerald-500/40" : "border-white/10"
                  }`}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.url}
                  alt={t.label}
                  className="w-full aspect-[9/16] object-cover rounded-lg border border-white/10"
                />
              )
            ) : (
              <div className="aspect-[9/16] bg-zinc-900 border border-white/10 rounded-lg" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

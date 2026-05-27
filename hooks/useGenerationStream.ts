"use client";

// Subscribes to /api/generate/stream and exposes the latest stage + thumbnail.
// Falls back to a 5s poll when the SSE connection drops or the runtime
// doesn't keep streams alive (some Vercel edge configs).

import { useEffect, useRef, useState } from "react";

export interface StreamStageEvent {
  stage: string;
  thumbnailUrl?: string;
}

export interface UseGenerationStreamArgs<S> {
  pipeline: "ugc" | "showcase";
  initialState: S | null;
  /**
   * Called once with the full final state when the pipeline reaches `done`.
   */
  onDone?: (finalState: S) => void;
  /**
   * Called with the latest state on each tick — useful for UI that wants the
   * complete artifact bag and not just the stage name.
   */
  onUpdate?: (state: S) => void;
  /**
   * Manual poll URL used when SSE isn't usable. Defaults to the same advance
   * route the legacy poll loop already calls.
   */
  fallbackPollUrl?: string;
  /** Poll cadence ms for the fallback path. Default 5000. */
  fallbackPollMs?: number;
}

export function useGenerationStream<S extends { stage: string }>(
  args: UseGenerationStreamArgs<S>
) {
  const [stage, setStage] = useState<string>(args.initialState?.stage ?? "idle");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const onDoneRef = useRef(args.onDone);
  const onUpdateRef = useRef(args.onUpdate);

  useEffect(() => {
    onDoneRef.current = args.onDone;
    onUpdateRef.current = args.onUpdate;
  });

  useEffect(() => {
    if (!args.initialState) return;
    let cancelled = false;
    let aborter: AbortController | null = null;
    let pollTimer: number | null = null;

    async function runStream() {
      aborter = new AbortController();
      setIsStreaming(true);
      try {
        const res = await fetch("/api/generate/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pipeline: args.pipeline,
            [args.pipeline]: args.initialState,
          }),
          signal: aborter.signal,
        });
        if (!res.body) throw new Error("no body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            handleChunk(chunk);
          }
        }
      } catch (e) {
        if (!cancelled) {
          // Stream failed — fall back to polling.
          startFallbackPolling(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setIsStreaming(false);
      }
    }

    function handleChunk(chunk: string) {
      const lines = chunk.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) return;
      try {
        const payload = JSON.parse(data);
        if (event === "stage") {
          setStage(payload.stage);
          if (payload.thumbnailUrl) setThumbnailUrl(payload.thumbnailUrl);
        } else if (event === "done") {
          setStage("done");
          if (payload.state) onUpdateRef.current?.(payload.state as S);
          if (payload.state) onDoneRef.current?.(payload.state as S);
        } else if (event === "error") {
          setError(payload.error || "stream error");
          setStage("failed");
        }
      } catch {
        // ignore malformed event
      }
    }

    function startFallbackPolling(reason: string) {
      console.warn(`[useGenerationStream] SSE failed (${reason}); falling back to poll`);
      if (!args.fallbackPollUrl) return;
      const cadence = args.fallbackPollMs ?? 5000;
      const tick = async () => {
        if (cancelled) return;
        try {
          const res = await fetch(args.fallbackPollUrl!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(args.initialState),
          });
          const next = (await res.json()) as S & { error?: string };
          if (next.error) {
            setError(next.error);
            setStage("failed");
            return;
          }
          setStage(next.stage);
          onUpdateRef.current?.(next);
          if (next.stage !== "done" && next.stage !== "failed") {
            pollTimer = window.setTimeout(tick, cadence);
          } else if (next.stage === "done") {
            onDoneRef.current?.(next);
          }
        } catch (e) {
          console.warn("[useGenerationStream] poll error", e);
          pollTimer = window.setTimeout(tick, cadence);
        }
      };
      tick();
    }

    runStream();
    return () => {
      cancelled = true;
      aborter?.abort();
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
    // initialState identity changes intentionally trigger re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.pipeline, args.initialState, args.fallbackPollUrl, args.fallbackPollMs]);

  return { stage, thumbnailUrl, error, isStreaming };
}

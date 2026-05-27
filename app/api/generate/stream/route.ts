// SSE generation stream. Client kicks off a UGC or showcase run, then
// connects here with the same state; the route polls /api/ugc/advance under
// the hood and pushes per-stage events as they fire.
//
// Stream protocol (event lines per SSE spec):
//   event: stage
//   data: {"stage": "composite", "thumbnailUrl": "https://…"}
//
//   event: done
//   data: {"finalVideoUrl": "https://…"}
//
//   event: error
//   data: {"error": "…"}
//
// The client can replace the legacy 5s poll loop with `new EventSource(...)`.
// Fallback for runtimes without SSE keep-alive: see `hooks/useGenerationStream.ts`
// which falls back to polling when the connection closes.

import type { NextRequest } from "next/server";
import { advanceUgc, type UgcState } from "@/lib/ugc";
import { advanceShowcase, type ShowcaseState } from "@/lib/showcase";

export const runtime = "nodejs";
export const maxDuration = 600;
export const dynamic = "force-dynamic";

type Pipeline = "ugc" | "showcase";

interface InitMsg {
  pipeline: Pipeline;
  ugc?: UgcState;
  showcase?: ShowcaseState;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as InitMsg;
  if (!body.pipeline) {
    return new Response(JSON.stringify({ error: "pipeline required" }), { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        if (body.pipeline === "ugc") {
          let state = body.ugc;
          if (!state) {
            send("error", { error: "ugc state required" });
            controller.close();
            return;
          }
          let lastStage = state.stage;
          send("stage", {
            stage: state.stage,
            thumbnailUrl: pickThumbnail(state),
          });
          while (state.stage !== "done" && state.stage !== "failed") {
            await sleep(4000);
            state = await advanceUgc(state);
            if (state.stage !== lastStage) {
              lastStage = state.stage;
              send("stage", {
                stage: state.stage,
                thumbnailUrl: pickThumbnail(state),
              });
            }
          }
          if (state.stage === "failed") send("error", { error: state.error || "ugc failed" });
          else send("done", { finalVideoUrl: state.artifacts.finalVideoUrl, state });
        } else {
          let state = body.showcase;
          if (!state) {
            send("error", { error: "showcase state required" });
            controller.close();
            return;
          }
          let lastStage = state.stage;
          send("stage", { stage: state.stage });
          while (state.stage !== "done" && state.stage !== "failed") {
            await sleep(4000);
            state = await advanceShowcase(state);
            if (state.stage !== lastStage) {
              lastStage = state.stage;
              send("stage", {
                stage: state.stage,
                thumbnailUrl: state.artifacts.heroImageUrl,
              });
            }
          }
          if (state.stage === "failed") send("error", { error: state.error || "showcase failed" });
          else send("done", { finalVideoUrl: state.artifacts.videoUrl, state });
        }
      } catch (e) {
        send("error", { error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function pickThumbnail(state: UgcState): string | undefined {
  return (
    state.artifacts.finalVideoUrl ||
    state.artifacts.rawVideoUrl ||
    state.artifacts.compositeImageUrl ||
    state.artifacts.actorImageUrl
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
